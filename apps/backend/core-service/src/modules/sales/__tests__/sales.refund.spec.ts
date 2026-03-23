import {
  BadRequestException,
  NotImplementedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
import { CreateRefundDto, RefundType } from '../dto';
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
    description: 'Refundable sale',
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
    client: {
      id: clientId,
      email: 'client@example.com',
    },
    items: [],
    activities: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SalesService refund', () => {
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
  let authorizeNetMock: {
    refundTransaction: jest.Mock<Promise<any>, [unknown]>;
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

    authorizeNetMock = {
      refundTransaction: jest.fn<Promise<any>, [unknown]>(),
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
        { provide: AuthorizeNetService, useValue: authorizeNetMock },
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

  it('FULL refund on ACTIVE sale sets status to REFUNDED and logs REFUND_ISSUED', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    authorizeNetMock.refundTransaction.mockResolvedValue({
      success: true,
      transactionId: 'refund-txn-1',
      responseCode: '1',
      message: 'Refund approved',
    });
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'payment-txn-1',
      transactionId: 'refund-txn-1',
      type: TransactionType.REFUND,
      amount: 500,
      status: TransactionStatus.SUCCESS,
    });
    prismaMock.sale.update.mockResolvedValue(makeSale({ status: SaleStatus.REFUNDED }));

    const result = await service.refund(saleId, orgId, actorId, {
      type: RefundType.FULL,
      transactionId: 'capture-txn-1',
    });

    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: { status: SaleStatus.REFUNDED },
    });
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.REFUND,
          status: TransactionStatus.SUCCESS,
          amount: 500,
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.REFUND_ISSUED,
          data: {
            amount: 500,
            type: RefundType.FULL,
            transactionId: 'capture-txn-1',
            note: null,
          },
        }),
      }),
    );
    expect(cacheMock.delByPrefix).toHaveBeenCalledWith(`sales:${orgId}:`);
    expect(result).toEqual({
      message: 'Refund issued successfully',
      transactionId: 'refund-txn-1',
    });
  });

  it('PARTIAL refund on ACTIVE sale keeps status ACTIVE and creates a REFUND transaction', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    authorizeNetMock.refundTransaction.mockResolvedValue({
      success: true,
      transactionId: 'refund-txn-2',
      responseCode: '1',
      message: 'Partial refund approved',
    });
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'payment-txn-2',
      transactionId: 'refund-txn-2',
      type: TransactionType.REFUND,
      amount: 100,
      status: TransactionStatus.SUCCESS,
    });

    const result = await service.refund(saleId, orgId, actorId, {
      type: RefundType.PARTIAL,
      amount: 100,
      transactionId: 'capture-txn-2',
      cardLastFour: '4242',
    });

    expect(authorizeNetMock.refundTransaction).toHaveBeenCalledWith({
      transactionId: 'capture-txn-2',
      amount: 100,
      cardLastFour: '4242',
    });
    expect(prismaMock.sale.update).not.toHaveBeenCalled();
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.REFUND,
          amount: 100,
          status: TransactionStatus.SUCCESS,
        }),
      }),
    );
    expect(result).toEqual({
      message: 'Refund issued successfully',
      transactionId: 'refund-txn-2',
    });
  });

  it('MANUAL refund requires note, sets status to REFUNDED, and does not call gateway', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.COMPLETED }));
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'payment-txn-3',
      transactionId: null,
      type: TransactionType.REFUND,
      amount: 500,
      status: TransactionStatus.SUCCESS,
    });
    prismaMock.sale.update.mockResolvedValue(makeSale({ status: SaleStatus.REFUNDED }));

    const result = await service.refund(saleId, orgId, actorId, {
      type: RefundType.MANUAL,
      note: 'Manual refund approved',
    });

    expect(authorizeNetMock.refundTransaction).not.toHaveBeenCalled();
    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: { status: SaleStatus.REFUNDED },
    });
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.REFUND,
          amount: 500,
          status: TransactionStatus.SUCCESS,
          responseMessage: 'Manual refund approved',
        }),
      }),
    );
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.REFUND_ISSUED,
          data: {
            amount: 500,
            type: RefundType.MANUAL,
            transactionId: null,
            note: 'Manual refund approved',
          },
        }),
      }),
    );
    expect(result).toEqual({
      message: 'Refund issued successfully',
      transactionId: undefined,
    });
  });

  it('refund on PENDING sale throws UnprocessableEntityException', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.PENDING }));

    await expect(
      service.refund(saleId, orgId, actorId, {
        type: RefundType.FULL,
        transactionId: 'capture-txn-3',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('PARTIAL refund missing amount throws BadRequestException', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));

    await expect(
      service.refund(saleId, orgId, actorId, {
        type: RefundType.PARTIAL,
        transactionId: 'capture-txn-4',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('MANUAL refund missing note throws BadRequestException', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));

    await expect(
      service.refund(saleId, orgId, actorId, {
        type: RefundType.MANUAL,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('REFUND_ISSUED activity is logged with correct data for all success cases', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    authorizeNetMock.refundTransaction.mockResolvedValue({
      success: true,
      transactionId: 'refund-txn-4',
      responseCode: '1',
      message: 'Refund approved',
    });
    prismaMock.paymentTransaction.create.mockResolvedValue({
      id: 'payment-txn-4',
      transactionId: 'refund-txn-4',
      type: TransactionType.REFUND,
      amount: 250,
      status: TransactionStatus.SUCCESS,
    });

    await service.refund(saleId, orgId, actorId, {
      type: RefundType.PARTIAL,
      amount: 250,
      transactionId: 'capture-txn-5',
      note: 'Refund note',
    });

    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SaleActivityType.REFUND_ISSUED,
          data: {
            amount: 250,
            type: RefundType.PARTIAL,
            transactionId: 'capture-txn-5',
            note: 'Refund note',
          },
        }),
      }),
    );
  });

  it('propagates gateway refund stub until configured', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale({ status: SaleStatus.ACTIVE }));
    authorizeNetMock.refundTransaction.mockRejectedValue(
      new NotImplementedException('Refund via gateway not yet configured'),
    );

    await expect(
      service.refund(saleId, orgId, actorId, {
        type: RefundType.FULL,
        transactionId: 'capture-txn-6',
      }),
    ).rejects.toThrow(NotImplementedException);
  });
});
