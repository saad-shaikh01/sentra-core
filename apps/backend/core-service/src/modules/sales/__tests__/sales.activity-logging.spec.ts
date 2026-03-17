import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  PaymentPlanType,
  SaleActivityType,
  SaleStatus,
  UserRole,
  DiscountType,
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
    totalAmount: 1200,
    status: SaleStatus.PENDING,
    currency: 'USD',
    description: 'Test sale',
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

function makeInvoice(index = 1) {
  return {
    id: `invoice-${index}`,
    invoiceNumber: `INV-${index}`,
    amount: 400,
    dueDate: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
    saleId,
  };
}

function makeCreateDto(overrides: Partial<CreateSaleDto> = {}): CreateSaleDto {
  return {
    clientId,
    brandId,
    totalAmount: 1200,
    currency: 'USD',
    description: 'Test sale',
    paymentPlan: PaymentPlanType.ONE_TIME,
    ...overrides,
  };
}

describe('SalesService activity logging', () => {
  let service: SalesService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    client: {
      findFirst: jest.Mock<Promise<any>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<any>, [unknown]>;
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      findFirst: jest.Mock<Promise<any>, [unknown]>;
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
        findFirst: jest.fn<Promise<any>, [unknown]>(),
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

  it('create() logs CREATED activity', async () => {
    prismaMock.sale.create.mockResolvedValue(makeSale());
    prismaMock.invoice.create.mockResolvedValue(makeInvoice());

    await service.create(orgId, actorId, UserRole.OWNER, makeCreateDto());

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId,
          userId: actorId,
          type: SaleActivityType.CREATED,
        }),
      }),
    );
  });

  it('create() with discount also logs DISCOUNT_APPLIED', async () => {
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        discountedTotal: 1080,
      }),
    );
    prismaMock.invoice.create.mockResolvedValue(makeInvoice());

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
      }),
    );

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.DISCOUNT_APPLIED,
          data: expect.objectContaining({
            discountType: DiscountType.PERCENTAGE,
            discountValue: 10,
            discountedTotal: 1080,
          }),
        }),
      }),
    );
  });

  it('create() with ONE_TIME plan logs INVOICE_CREATED once', async () => {
    prismaMock.sale.create.mockResolvedValue(makeSale());
    prismaMock.invoice.create.mockResolvedValue(makeInvoice());

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({ paymentPlan: PaymentPlanType.ONE_TIME }),
    );

    const invoiceLogs = prismaMock.saleActivity.create.mock.calls.filter(
      ([arg]) => (arg as { data: { type: SaleActivityType } }).data.type === SaleActivityType.INVOICE_CREATED,
    );

    expect(invoiceLogs).toHaveLength(1);
  });

  it('create() with INSTALLMENTS(3) logs INVOICE_CREATED three times', async () => {
    prismaMock.sale.create.mockResolvedValue(
      makeSale({
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 3,
      }),
    );
    prismaMock.invoice.create
      .mockResolvedValueOnce(makeInvoice(1))
      .mockResolvedValueOnce(makeInvoice(2))
      .mockResolvedValueOnce(makeInvoice(3));

    await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateDto({
        paymentPlan: PaymentPlanType.INSTALLMENTS,
        installmentCount: 3,
      }),
    );

    const invoiceLogs = prismaMock.saleActivity.create.mock.calls.filter(
      ([arg]) => (arg as { data: { type: SaleActivityType } }).data.type === SaleActivityType.INVOICE_CREATED,
    );

    expect(invoiceLogs).toHaveLength(3);
  });

  it('update() with status change logs STATUS_CHANGE with correct from/to', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.PENDING }));
    prismaMock.sale.update.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));

    await service.update(
      saleId,
      orgId,
      actorId,
      UserRole.OWNER,
      { status: SaleStatus.ACTIVE } as UpdateSaleDto,
    );

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.STATUS_CHANGE,
          data: { from: SaleStatus.PENDING, to: SaleStatus.ACTIVE },
        }),
      }),
    );
  });

  it('update() without status change does not log STATUS_CHANGE', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.PENDING }));
    prismaMock.sale.update.mockResolvedValue(makeSale({ status: SaleStatus.PENDING, description: 'updated' }));

    await service.update(
      saleId,
      orgId,
      actorId,
      UserRole.OWNER,
      { description: 'updated' } as UpdateSaleDto,
    );

    const statusLogs = prismaMock.saleActivity.create.mock.calls.filter(
      ([arg]) => (arg as { data: { type: SaleActivityType } }).data.type === SaleActivityType.STATUS_CHANGE,
    );

    expect(statusLogs).toHaveLength(0);
  });

  it('update() with discount change logs DISCOUNT_APPLIED', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(
      makeSale({
        discountType: null,
        discountValue: null,
        discountedTotal: null,
      }),
    );
    prismaMock.sale.update.mockResolvedValue(
      makeSale({
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 100,
        discountedTotal: 1100,
      }),
    );

    await service.update(
      saleId,
      orgId,
      actorId,
      UserRole.OWNER,
      {
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 100,
      } as UpdateSaleDto,
    );

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.DISCOUNT_APPLIED,
          data: expect.objectContaining({
            discountType: DiscountType.FIXED_AMOUNT,
            discountValue: 100,
            discountedTotal: 1100,
          }),
        }),
      }),
    );
  });

  it('remove() logs STATUS_CHANGE with action ARCHIVED', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale());
    prismaMock.sale.update.mockResolvedValue(makeSale({ deletedAt: new Date('2026-01-02T00:00:00.000Z') }));

    const result = await service.remove(saleId, orgId, actorId);

    expect(result).toEqual({ message: 'Sale archived successfully' });
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.STATUS_CHANGE,
          data: expect.objectContaining({ action: 'ARCHIVED' }),
        }),
      }),
    );
  });

  it('addNote() with valid note logs NOTE activity and returns success', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(makeSale());

    const result = await service.addNote(saleId, orgId, actorId, 'Followed up with client');

    expect(result).toEqual({ success: true });
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.NOTE,
          data: { note: 'Followed up with client' },
        }),
      }),
    );
  });

  it('addNote() on missing sale throws NotFoundException', async () => {
    prismaMock.sale.findFirst.mockResolvedValue(null);

    await expect(service.addNote(saleId, orgId, actorId, 'Missing sale note')).rejects.toThrow(NotFoundException);
  });
});
