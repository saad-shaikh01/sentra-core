import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '@sentra-core/prisma-client';
import { PaymentPlanType, SaleStatus } from '@sentra-core/types';
import { CacheService } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { TeamsService } from '../teams';
import { CreateSaleDto, UpdateSaleDto } from './dto';
import { SalesService } from './sales.service';

interface ClientRecord {
  id: string;
  email: string;
  companyName: string;
  organizationId: string;
}

interface SaleItemRecord {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  customPrice: number | null;
  saleId: string;
}

interface SaleRecord {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  currency: string;
  description: string | null;
  contractUrl: string | null;
  paymentPlan: PaymentPlanType;
  installmentCount: number | null;
  clientId: string;
  brandId: string;
  organizationId: string;
  customerProfileId: string | null;
  paymentProfileId: string | null;
  subscriptionId: string | null;
  items: SaleItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  saleId: string;
  status?: string;
  notes?: string;
}

const orgId = 'org-1';
const saleId = 'sale-1';
const clientId = '11111111-1111-1111-1111-111111111111';
const brandId = '22222222-2222-2222-2222-222222222222';

function makeClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: clientId,
    email: 'client@example.com',
    companyName: 'Acme Co',
    organizationId: orgId,
    ...overrides,
  };
}

function makeSale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: saleId,
    totalAmount: 1200,
    status: SaleStatus.PENDING,
    currency: 'USD',
    description: 'Test sale',
    contractUrl: null,
    paymentPlan: PaymentPlanType.ONE_TIME,
    installmentCount: null,
    clientId,
    brandId,
    organizationId: orgId,
    customerProfileId: null,
    paymentProfileId: null,
    subscriptionId: null,
    items: [
      {
        id: 'item-1',
        name: 'Package',
        description: null,
        quantity: 1,
        unitPrice: 1200,
        customPrice: null,
        saleId,
      },
    ],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeCreateSaleDto(
  paymentPlan: PaymentPlanType,
  overrides: Partial<CreateSaleDto> = {},
): CreateSaleDto {
  return {
    clientId,
    brandId,
    totalAmount: 1200,
    currency: 'USD',
    description: 'Test sale',
    paymentPlan,
    ...(paymentPlan === PaymentPlanType.INSTALLMENTS ? { installmentCount: 3 } : {}),
    ...overrides,
  };
}

describe('SalesService', () => {
  let service: SalesService;
  let prismaMock: {
    client: {
      findUnique: jest.Mock<Promise<ClientRecord | null>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<SaleRecord>, [unknown]>;
      findUnique: jest.Mock<Promise<SaleRecord | null>, [unknown]>;
      delete: jest.Mock<Promise<SaleRecord>, [unknown]>;
    };
    invoice: {
      create: jest.Mock<Promise<InvoiceRecord>, [unknown]>;
      createMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
      count: jest.Mock<Promise<number>, [unknown]>;
    };
    paymentTransaction: {
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    saleItem: {
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    lead: {
      findMany: jest.Mock<Promise<Array<{ convertedClientId: string | null }>>, [unknown]>;
    };
  };
  let authorizeNetMock: {
    createCustomerProfile: jest.Mock<Promise<unknown>, [unknown]>;
    createPaymentProfile: jest.Mock<Promise<unknown>, [unknown]>;
    chargeCustomerProfile: jest.Mock<Promise<unknown>, [unknown]>;
    createSubscription: jest.Mock<Promise<unknown>, [unknown]>;
    cancelSubscription: jest.Mock<Promise<unknown>, [unknown]>;
  };
  let cacheMock: {
    get: jest.Mock<Promise<unknown>, [string]>;
    set: jest.Mock<Promise<void>, [string, unknown]>;
    del: jest.Mock<Promise<void>, [string]>;
    delByPrefix: jest.Mock<Promise<void>, [string]>;
    hashQuery: jest.Mock<string, [Record<string, unknown>]>;
  };
  let teamsMock: {
    getMemberIds: jest.Mock<Promise<string[]>, [string, string]>;
  };

  beforeEach(async () => {
    prismaMock = {
      client: {
        findUnique: jest.fn<Promise<ClientRecord | null>, [unknown]>(),
      },
      sale: {
        create: jest.fn<Promise<SaleRecord>, [unknown]>(),
        findUnique: jest.fn<Promise<SaleRecord | null>, [unknown]>(),
        delete: jest.fn<Promise<SaleRecord>, [unknown]>(),
      },
      invoice: {
        create: jest.fn<Promise<InvoiceRecord>, [unknown]>(),
        createMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
        count: jest.fn<Promise<number>, [unknown]>(),
      },
      paymentTransaction: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      saleItem: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      lead: {
        findMany: jest.fn<Promise<Array<{ convertedClientId: string | null }>>, [unknown]>(),
      },
    };

    authorizeNetMock = {
      createCustomerProfile: jest.fn<Promise<unknown>, [unknown]>(),
      createPaymentProfile: jest.fn<Promise<unknown>, [unknown]>(),
      chargeCustomerProfile: jest.fn<Promise<unknown>, [unknown]>(),
      createSubscription: jest.fn<Promise<unknown>, [unknown]>(),
      cancelSubscription: jest.fn<Promise<unknown>, [unknown]>(),
    };

    cacheMock = {
      get: jest.fn<Promise<unknown>, [string]>().mockResolvedValue(null),
      set: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
      del: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      delByPrefix: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      hashQuery: jest.fn<string, [Record<string, unknown>]>().mockReturnValue('hash'),
    };

    teamsMock = {
      getMemberIds: jest.fn<Promise<string[]>, [string, string]>().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: authorizeNetMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: TeamsService, useValue: teamsMock },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('TC-B1: create ONE_TIME sale generates one invoice.create call', async () => {
    prismaMock.client.findUnique.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.ONE_TIME,
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 1200,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    await service.create(orgId, makeCreateSaleDto(PaymentPlanType.ONE_TIME));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.invoice.createMany).not.toHaveBeenCalled();
  });

  it('TC-B2: create INSTALLMENTS sale does not call invoice.create and uses createMany', async () => {
    prismaMock.client.findUnique.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 3,
      }),
    );
    prismaMock.invoice.createMany.mockResolvedValue({ count: 3 });

    await service.create(orgId, makeCreateSaleDto(PaymentPlanType.INSTALLMENTS));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(0);
    expect(prismaMock.invoice.createMany).toHaveBeenCalledTimes(1);
  });

  it('TC-B3: create SUBSCRIPTION sale does not generate upfront invoices', async () => {
    prismaMock.client.findUnique.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.SUBSCRIPTION,
      }),
    );

    await service.create(orgId, makeCreateSaleDto(PaymentPlanType.SUBSCRIPTION));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(0);
    expect(prismaMock.invoice.createMany).not.toHaveBeenCalled();
  });

  it('TC-B4: remove rejects deletion when invoices exist', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale());
    prismaMock.invoice.count.mockResolvedValue(2);

    await expect(service.remove(saleId, orgId)).rejects.toThrow(BadRequestException);

    expect(prismaMock.paymentTransaction.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
  });

  it('TC-B5: remove deletes sale when invoice count is zero', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale());
    prismaMock.invoice.count.mockResolvedValue(0);
    prismaMock.paymentTransaction.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.saleItem.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.sale.delete.mockResolvedValue(makeSale());

    const result = await service.remove(saleId, orgId);

    expect(prismaMock.paymentTransaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.saleItem.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.sale.delete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: 'Sale deleted successfully' });
  });

  it('TC-B6: UpdateSaleDto rejects clientId and brandId via class-validator validate()', async () => {
    const dto = plainToInstance(UpdateSaleDto, {
      totalAmount: 1200,
      clientId,
      brandId,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    const errorProperties = errors.map((error) => error.property);

    expect(errorProperties).toContain('clientId');
    expect(errorProperties).toContain('brandId');
  });
});
