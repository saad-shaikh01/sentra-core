import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  DiscountType,
  PaymentPlanType,
  SaleStatus,
  UserRole,
} from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { CreateSaleDto, UpdateSaleDto } from '../dto';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

const orgId = 'org-1';
const actorId = 'user-1';
const saleId = 'sale-1';
const clientId = '11111111-1111-1111-1111-111111111111';
const brandId = '22222222-2222-2222-2222-222222222222';

function makeSale(overrides: Record<string, unknown> = {}) {
  return {
    id: saleId,
    totalAmount: 500,
    status: SaleStatus.PENDING,
    currency: 'USD',
    description: 'Discount test sale',
    contractUrl: null,
    paymentPlan: PaymentPlanType.ONE_TIME,
    installmentCount: null,
    discountType: null,
    discountValue: null,
    discountedTotal: null,
    clientId,
    brandId,
    organizationId: orgId,
    customerProfileId: null,
    paymentProfileId: null,
    subscriptionId: null,
    deletedAt: null,
    items: [],
    activities: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeCreateDto(overrides: Partial<CreateSaleDto> = {}): CreateSaleDto {
  return {
    clientId,
    brandId,
    totalAmount: 500,
    currency: 'USD',
    description: 'Discount test sale',
    paymentPlan: PaymentPlanType.ONE_TIME,
    ...overrides,
  };
}

describe('SalesService discount logic', () => {
  let service: SalesService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    client: {
      findFirst: jest.Mock<Promise<any>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<any>, [unknown]>;
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    invoice: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      client: {
        findFirst: jest.fn<Promise<any>, [unknown]>().mockResolvedValue({ id: clientId }),
      },
      sale: {
        create: jest.fn<Promise<any>, [unknown]>(),
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      invoice: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>().mockResolvedValue({ id: 'activity-1' }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: {} },
        {
          provide: CacheService,
          useValue: {
            delByPrefix: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
            get: jest.fn<Promise<unknown>, [string]>().mockResolvedValue(null),
            set: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
            del: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
            hashQuery: jest.fn<string, [Record<string, unknown>]>().mockReturnValue('hash'),
          },
        },
        { provide: TeamsService, useValue: { getMemberIds: jest.fn().mockResolvedValue([]) } },
        {
          provide: SalesNotificationService,
          useValue: {
            dispatch: jest.fn().mockResolvedValue(undefined),
            resolveRecipientsByRole: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('computeDiscountedTotal() rounds to 2 decimal places', () => {
    expect(
      (service as any).computeDiscountedTotal(333.33, DiscountType.PERCENTAGE, 12.5),
    ).toBe(291.66);
    expect(
      (service as any).computeDiscountedTotal(333.33, DiscountType.FIXED_AMOUNT, 12.345),
    ).toBe(320.98);
  });

  it('validateDiscount() throws BadRequestException when discountValue is not greater than 0', () => {
    expect(() =>
      (service as any).validateDiscount(500, DiscountType.FIXED_AMOUNT, 0),
    ).toThrow(BadRequestException);
  });

  it('ONE_TIME sale with PERCENTAGE 20% discount on $500 computes discountedTotal $400.00', async () => {
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        totalAmount: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        discountedTotal: 400,
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 400,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    const result = await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({
        totalAmount: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
      }),
    );

    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20,
          discountedTotal: 400,
        }),
      }),
    );
    expect(prismaMock.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 400,
        }),
      }),
    );
    expect(result.discountedTotal).toBe(400);
  });

  it('ONE_TIME sale with FIXED_AMOUNT $50 discount on $500 computes discountedTotal $450.00', async () => {
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        totalAmount: 500,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 50,
        discountedTotal: 450,
      }),
    );
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 450,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    const result = await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({
        totalAmount: 500,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 50,
      }),
    );

    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 50,
          discountedTotal: 450,
        }),
      }),
    );
    expect(prismaMock.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 450,
        }),
      }),
    );
    expect(result.discountedTotal).toBe(450);
  });

  it('INSTALLMENTS(4) with PERCENTAGE 10% on $1000 creates $225.00 invoices', async () => {
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        totalAmount: 1000,
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 4,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        discountedTotal: 900,
      }),
    );
    prismaMock.invoice.create
      .mockResolvedValueOnce({
        id: 'invoice-1',
        invoiceNumber: 'INV-1',
        amount: 225,
        dueDate: new Date('2026-02-01T00:00:00.000Z'),
        saleId,
      })
      .mockResolvedValueOnce({
        id: 'invoice-2',
        invoiceNumber: 'INV-2',
        amount: 225,
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        saleId,
      })
      .mockResolvedValueOnce({
        id: 'invoice-3',
        invoiceNumber: 'INV-3',
        amount: 225,
        dueDate: new Date('2026-04-01T00:00:00.000Z'),
        saleId,
      })
      .mockResolvedValueOnce({
        id: 'invoice-4',
        invoiceNumber: 'INV-4',
        amount: 225,
        dueDate: new Date('2026-05-01T00:00:00.000Z'),
        saleId,
      });

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({
        totalAmount: 1000,
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 4,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
      }),
    );

    const createdAmounts = prismaMock.invoice.create.mock.calls.map(
      ([arg]) => (arg as { data: { amount: number } }).data.amount,
    );

    expect(createdAmounts).toEqual([225, 225, 225, 225]);
  });

  it('throws BadRequestException when percentage discount exceeds 100', async () => {
    await expect(
      service.create(
        orgId,
        actorId,
        UserRole.OWNER,
        makeCreateDto({
          totalAmount: 500,
          discountType: DiscountType.PERCENTAGE,
          discountValue: 101,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when fixed discount is greater than or equal to totalAmount', async () => {
    await expect(
      service.create(
        orgId,
        actorId,
        UserRole.OWNER,
        makeCreateDto({
          totalAmount: 500,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 500,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when discountType is provided without discountValue', async () => {
    await expect(
      service.create(
        orgId,
        actorId,
        UserRole.OWNER,
        makeCreateDto({
          totalAmount: 500,
          discountType: DiscountType.PERCENTAGE,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws UnprocessableEntityException when changing discount on an ACTIVE sale', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(
      makeSale({
        status: SaleStatus.ACTIVE,
        totalAmount: 500,
      }),
    );

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.OWNER,
        {
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10,
        } as UpdateSaleDto,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('recomputes discountedTotal when discount changes on a PENDING sale', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(
      makeSale({
        status: SaleStatus.PENDING,
        totalAmount: 500,
        discountType: null,
        discountValue: null,
        discountedTotal: null,
      }),
    );
    prismaMock.sale.update.mockResolvedValue(
      makeSale({
        status: SaleStatus.PENDING,
        totalAmount: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        discountedTotal: 400,
      }),
    );

    const result = await service.update(
      saleId,
      orgId,
      actorId,
      UserRole.OWNER,
      {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
      } as UpdateSaleDto,
    );

    expect(prismaMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20,
          discountedTotal: 400,
        }),
      }),
    );
    expect(result.discountedTotal).toBe(400);
  });

  it('sale with no discount stores discountedTotal null and invoices use totalAmount', async () => {
    prismaMock.sale.create.mockResolvedValue(makeSale({ totalAmount: 500, discountedTotal: null }));
    prismaMock.invoice.create.mockResolvedValue({
      id: 'invoice-1',
      invoiceNumber: 'INV-1',
      amount: 500,
      dueDate: new Date('2026-01-08T00:00:00.000Z'),
      saleId,
    });

    const result = await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({ totalAmount: 500 }),
    );

    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountType: null,
          discountValue: null,
          discountedTotal: null,
        }),
      }),
    );
    expect(prismaMock.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 500,
        }),
      }),
    );
    expect(result.discountedTotal).toBeUndefined();
  });
});
