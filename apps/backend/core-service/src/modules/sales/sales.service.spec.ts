import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '@sentra-core/prisma-client';
import { InvoiceStatus, PaymentPlanType, SaleStatus, UserRole } from '@sentra-core/types';
import { CacheService } from '../../common';
import { AuthorizeNetService } from '../authorize-net';
import { TeamsService } from '../teams';
import { CreateSaleDto, UpdateSaleDto } from './dto';
import { SalesNotificationService } from './sales-notification.service';
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
  packageId: string | null;
  packageName: string | null;
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
  deletedAt: Date | null;
  items: SaleItemRecord[];
  client?: ClientRecord;
  invoices?: InvoiceRecord[];
  transactions?: unknown[];
  activities?: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  saleId: string;
  status?: InvoiceStatus | string;
  notes?: string;
}

const orgId = 'org-1';
const actorId = 'user-1';
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
    deletedAt: null,
    items: [
      {
        id: 'item-1',
        name: 'Package',
        description: null,
        quantity: 1,
        unitPrice: 1200,
        customPrice: null,
        packageId: null,
        packageName: null,
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
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    client: {
      findFirst: jest.Mock<Promise<ClientRecord | null>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<SaleRecord>, [unknown]>;
      findFirst: jest.Mock<Promise<SaleRecord | null>, [unknown]>;
      findUnique: jest.Mock<Promise<SaleRecord | null>, [unknown]>;
      update: jest.Mock<Promise<SaleRecord>, [unknown]>;
      delete: jest.Mock<Promise<SaleRecord>, [unknown]>;
    };
    invoice: {
      create: jest.Mock<Promise<InvoiceRecord>, [unknown]>;
      createMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
      count: jest.Mock<Promise<number>, [unknown]>;
      update: jest.Mock<Promise<InvoiceRecord>, [unknown]>;
    };
    paymentTransaction: {
      create: jest.Mock<Promise<unknown>, [unknown]>;
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    saleItem: {
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<unknown>, [unknown]>;
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
  let salesNotificationServiceMock: {
    dispatch: jest.Mock<Promise<void>, [unknown]>;
    resolveRecipientsByRole: jest.Mock<Promise<string[]>, [string, UserRole[]]>;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      client: {
        findFirst: jest.fn<Promise<ClientRecord | null>, [unknown]>(),
      },
      sale: {
        create: jest.fn<Promise<SaleRecord>, [unknown]>(),
        findFirst: jest.fn<Promise<SaleRecord | null>, [unknown]>(),
        findUnique: jest.fn<Promise<SaleRecord | null>, [unknown]>(),
        update: jest.fn<Promise<SaleRecord>, [unknown]>(),
        delete: jest.fn<Promise<SaleRecord>, [unknown]>(),
      },
      invoice: {
        create: jest.fn<Promise<InvoiceRecord>, [unknown]>(),
        createMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
        count: jest.fn<Promise<number>, [unknown]>(),
        update: jest.fn<Promise<InvoiceRecord>, [unknown]>(),
      },
      paymentTransaction: {
        create: jest.fn<Promise<unknown>, [unknown]>(),
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      saleItem: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<unknown>, [unknown]>(),
      },
      lead: {
        findMany: jest.fn<Promise<Array<{ convertedClientId: string | null }>>, [unknown]>(),
      },
    };
    (prismaMock as any).$executeRaw = jest.fn().mockResolvedValue(1);
    (prismaMock as any).invoiceSequence = {
      findUnique: jest.fn().mockResolvedValue({
        lastSeq: 1,
        year: new Date().getFullYear(),
        brandId,
      }),
    };

    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return callback(prismaMock);
      }

      return Promise.all(callback as Promise<unknown>[]);
    });

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
    salesNotificationServiceMock = {
      dispatch: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
      resolveRecipientsByRole: jest
        .fn<Promise<string[]>, [string, UserRole[]]>()
        .mockResolvedValue(['user-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: authorizeNetMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: SalesNotificationService, useValue: salesNotificationServiceMock },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('TC-B1: create ONE_TIME sale generates one invoice.create call', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
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

    await service.create(orgId, actorId, UserRole.OWNER, makeCreateSaleDto(PaymentPlanType.ONE_TIME));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.invoice.createMany).not.toHaveBeenCalled();
  });

  it('TC-B2: create INSTALLMENTS sale creates one invoice per installment', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 3,
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-installment',
      invoiceNumber: 'INV-installment',
      amount: 400,
      dueDate: new Date('2026-02-01T00:00:00.000Z'),
      saleId,
    });
    await service.create(orgId, actorId, UserRole.OWNER, makeCreateSaleDto(PaymentPlanType.INSTALLMENTS));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.invoice.createMany).not.toHaveBeenCalled();
  });

  it('TC-B3: create SUBSCRIPTION sale does not generate upfront invoices', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.SUBSCRIPTION,
      }),
    );

    await service.create(orgId, actorId, UserRole.OWNER, makeCreateSaleDto(PaymentPlanType.SUBSCRIPTION));

    expect(prismaMock.invoice.create).toHaveBeenCalledTimes(0);
    expect(prismaMock.invoice.createMany).not.toHaveBeenCalled();
  });

  it('TC-B3.1: create persists package linkage fields when provided', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        items: [
          {
            id: 'item-1',
            name: 'Package',
            description: null,
            quantity: 1,
            unitPrice: 1200,
            customPrice: null,
            packageId: 'pkg_test',
            packageName: 'Test Package',
            saleId,
          },
        ],
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 1200,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateSaleDto(PaymentPlanType.ONE_TIME, {
        items: [
          {
            name: 'Package',
            quantity: 1,
            unitPrice: 1200,
            packageId: 'pkg_test',
            packageName: 'Test Package',
          },
        ],
      }),
    );

    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                packageId: 'pkg_test',
                packageName: 'Test Package',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('TC-B3.2: create persists null package linkage fields when omitted', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(makeSale());
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 1200,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateSaleDto(PaymentPlanType.ONE_TIME, {
        items: [
          {
            name: 'Package',
            quantity: 1,
            unitPrice: 1200,
          },
        ],
      }),
    );

    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                packageId: null,
                packageName: null,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('TC-B3.3: create maps package linkage fields when present', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        items: [
          {
            id: 'item-1',
            name: 'Package',
            description: null,
            quantity: 1,
            unitPrice: 1200,
            customPrice: null,
            packageId: 'pkg_test',
            packageName: 'Test Package',
            saleId,
          },
        ],
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 1200,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    const result = await service.create(orgId, actorId, UserRole.OWNER, makeCreateSaleDto(PaymentPlanType.ONE_TIME));

    expect(result.items?.[0]?.packageId).toBe('pkg_test');
    expect(result.items?.[0]?.packageName).toBe('Test Package');
  });

  it('TC-B3.4: create leaves package linkage fields undefined when null in source item', async () => {
    prismaMock.client.findFirst.mockResolvedValue(makeClient());
    prismaMock.sale.create.mockResolvedValue(makeSale());
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 1200,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    const result = await service.create(orgId, actorId, UserRole.OWNER, makeCreateSaleDto(PaymentPlanType.ONE_TIME));

    expect(result.items?.[0]?.packageId).toBeUndefined();
    expect(result.items?.[0]?.packageName).toBeUndefined();
  });

  it('TC-B4: remove rejects archiving when sale is already archived', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(
      makeSale({
        deletedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );

    await expect(service.remove(saleId, orgId, actorId)).rejects.toThrow(BadRequestException);

    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
  });

  it('TC-B5: remove archives sale and logs archive activity', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale());
    prismaMock.sale.update.mockResolvedValue(
      makeSale({
        deletedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );
    prismaMock.saleActivity.create.mockResolvedValue({ id: 'activity-1' });

    const result = await service.remove(saleId, orgId, actorId);

    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith({
      data: {
        saleId,
        userId: actorId,
        type: 'STATUS_CHANGE',
        data: {
          action: 'ARCHIVED',
          deletedAt: expect.any(String),
        },
      },
    });
    expect(prismaMock.paymentTransaction.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.saleItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Sale archived successfully' });
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

  it('TC-B7: charge failure dispatches PAYMENT_FAILED notification', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({
      ...makeSale(),
      client: makeClient(),
      customerProfileId: 'cust-1',
      paymentProfileId: 'pay-1',
    });
    authorizeNetMock.chargeCustomerProfile.mockResolvedValue({
      success: false,
      transactionId: 'txn-failed',
      responseCode: '2',
      message: 'Declined',
    });
    prismaMock.paymentTransaction.create.mockResolvedValue({ id: 'payment-1' });

    await expect(
      service.charge(saleId, orgId, actorId, { amount: 1200 }),
    ).rejects.toThrow(BadRequestException);

    await Promise.resolve();

    expect(salesNotificationServiceMock.resolveRecipientsByRole).toHaveBeenCalledWith(
      orgId,
      [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
    );
    expect(salesNotificationServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT_FAILED',
        saleId,
        organizationId: orgId,
      }),
    );
  });

  it('TC-B8: update with status change dispatches SALE_STATUS_CHANGED notification', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.PENDING }));
    prismaMock.sale.update.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));

    await service.update(
      saleId,
      orgId,
      actorId,
      UserRole.OWNER,
      { status: SaleStatus.ACTIVE } as UpdateSaleDto,
    );

    await Promise.resolve();

    expect(salesNotificationServiceMock.resolveRecipientsByRole).toHaveBeenCalledWith(
      orgId,
      [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
    );
    expect(salesNotificationServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SALE_STATUS_CHANGED',
        message: `Sale ${saleId} status changed from ${SaleStatus.PENDING} to ${SaleStatus.ACTIVE}.`,
        saleId,
        organizationId: orgId,
        data: { from: SaleStatus.PENDING, to: SaleStatus.ACTIVE },
      }),
    );
  });

  it('TC-B9: recordChargeback dispatches CHARGEBACK_FILED notification', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    prismaMock.paymentTransaction.create.mockResolvedValue({ id: 'txn-chargeback' });

    await service.recordChargeback(saleId, orgId, actorId, {
      amount: 150,
      notes: 'Customer disputed the charge with the bank',
    } as any);

    await Promise.resolve();

    expect(salesNotificationServiceMock.resolveRecipientsByRole).toHaveBeenCalledWith(
      orgId,
      [UserRole.OWNER, UserRole.ADMIN],
    );
    expect(salesNotificationServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHARGEBACK_FILED',
        saleId,
        organizationId: orgId,
        data: {
          amount: 150,
          notes: 'Customer disputed the charge with the bank',
        },
      }),
    );
  });

  it('TC-B10: findOne marks overdue invoices and dispatches INVOICE_OVERDUE notification', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({
      ...makeSale(),
      invoices: [
        {
          id: 'invoice-overdue',
          invoiceNumber: 'INV-OVERDUE',
          amount: 200,
          dueDate: new Date('2026-01-01T00:00:00.000Z'),
          saleId,
          status: InvoiceStatus.UNPAID,
        },
      ],
      transactions: [],
      activities: [],
    } as any);
    prismaMock.invoice.update.mockResolvedValue({
      id: 'invoice-overdue',
      invoiceNumber: 'INV-OVERDUE',
      amount: 200,
      dueDate: new Date('2026-01-01T00:00:00.000Z'),
      saleId,
      status: InvoiceStatus.OVERDUE,
    });

    await service.findOne(saleId, orgId);

    await Promise.resolve();

    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-overdue' },
      data: { status: InvoiceStatus.OVERDUE },
    });
    expect(salesNotificationServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INVOICE_OVERDUE',
        saleId,
        organizationId: orgId,
        data: { invoiceId: 'invoice-overdue' },
      }),
    );
  });
});
