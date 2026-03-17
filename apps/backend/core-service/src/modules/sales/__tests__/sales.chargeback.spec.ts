import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  PaymentPlanType,
  SaleActivityType,
  SaleStatus,
  TransactionStatus,
  TransactionType,
} from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { CreateChargebackDto } from '../dto';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

const orgId = 'org-1';
const actorId = 'user-1';
const saleId = 'sale-1';
const clientId = 'client-1';
const brandId = 'brand-1';

function makeSale(overrides: Record<string, unknown> = {}) {
  return {
    id: saleId,
    totalAmount: 500,
    status: SaleStatus.ACTIVE,
    currency: 'USD',
    description: 'Chargeback sale',
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SalesService chargeback', () => {
  let service: SalesService;
  let prismaMock: {
    sale: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    paymentTransaction: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };
  let cacheMock: {
    delByPrefix: jest.Mock<Promise<void>, [string]>;
    get: jest.Mock<Promise<unknown>, [string]>;
    set: jest.Mock<Promise<void>, [string, unknown]>;
    del: jest.Mock<Promise<void>, [string]>;
    hashQuery: jest.Mock<string, [Record<string, unknown>]>;
  };

  beforeEach(async () => {
    prismaMock = {
      sale: {
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      paymentTransaction: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>().mockResolvedValue({ id: 'activity-1' }),
      },
    };

    cacheMock = {
      delByPrefix: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      get: jest.fn<Promise<unknown>, [string]>().mockResolvedValue(null),
      set: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
      del: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      hashQuery: jest.fn<string, [Record<string, unknown>]>().mockReturnValue('hash'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: {} },
        { provide: CacheService, useValue: cacheMock },
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

  it('records chargeback on ACTIVE sale with PENDING transaction, activity log, unchanged status, and success message', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'chargeback-txn-1',
      type: TransactionType.CHARGEBACK,
      amount: 150,
      status: TransactionStatus.PENDING,
    });

    const result = await service.recordChargeback(saleId, orgId, actorId, {
      amount: 150,
      notes: 'Customer disputed the charge with the bank',
      evidenceUrl: 'evidence.pdf',
      chargebackDate: '2026-03-15',
    });

    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: null,
          type: TransactionType.CHARGEBACK,
          amount: 150,
          status: TransactionStatus.PENDING,
          responseMessage: 'Customer disputed the charge with the bank',
          saleId,
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.CHARGEBACK_FILED,
          data: {
            amount: 150,
            notes: 'Customer disputed the charge with the bank',
            evidenceUrl: 'evidence.pdf',
            chargebackDate: '2026-03-15',
          },
        }),
      }),
    );
    expect(prismaMock.sale.update).not.toHaveBeenCalled();
    expect(cacheMock.delByPrefix).toHaveBeenCalledWith(`sales:${orgId}:`);
    expect(result).toEqual({ message: 'Chargeback recorded successfully' });
  });

  it('blocks chargeback on DRAFT sale with 422', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.DRAFT }));

    await expect(
      service.recordChargeback(saleId, orgId, actorId, {
        amount: 150,
        notes: 'Customer disputed the charge with the bank',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('blocks chargeback on archived sale with 422', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(
      makeSale({
        status: SaleStatus.ACTIVE,
        deletedAt: new Date('2026-03-16T00:00:00.000Z'),
      }),
    );

    await expect(
      service.recordChargeback(saleId, orgId, actorId, {
        amount: 150,
        notes: 'Customer disputed the charge with the bank',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('notes shorter than 10 chars fails DTO validation and service guard with 400', async () => {
    const dto = plainToInstance(CreateChargebackDto, {
      amount: 150,
      notes: 'too short',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'notes')).toBe(true);

    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    await expect(
      service.recordChargeback(saleId, orgId, actorId, {
        amount: 150,
        notes: 'too short',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('amount missing fails DTO validation and service guard with 400', async () => {
    const dto = plainToInstance(CreateChargebackDto, {
      notes: 'Customer disputed the charge with the bank',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);

    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    await expect(
      service.recordChargeback(saleId, orgId, actorId, {
        notes: 'Customer disputed the charge with the bank',
      } as CreateChargebackDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('logs CHARGEBACK_FILED activity with default chargebackDate when omitted', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'chargeback-txn-2',
      type: TransactionType.CHARGEBACK,
      amount: 200,
      status: TransactionStatus.PENDING,
    });

    await service.recordChargeback(saleId, orgId, actorId, {
      amount: 200,
      notes: 'Customer disputed the charge with the bank',
    });

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.CHARGEBACK_FILED,
          data: expect.objectContaining({
            amount: 200,
            notes: 'Customer disputed the charge with the bank',
            evidenceUrl: null,
            chargebackDate: expect.any(String),
          }),
        }),
      }),
    );
  });
});
