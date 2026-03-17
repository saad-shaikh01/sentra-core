import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { SaleStatus, PaymentPlanType } from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

describe('SalesService soft delete', () => {
  let service: SalesService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    sale: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
      delete: jest.Mock<Promise<any>, [unknown]>;
    };
    saleItem: {
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    paymentTransaction: {
      deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };
  let cacheMock: {
    delByPrefix: jest.Mock<Promise<void>, [string]>;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      sale: {
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
        delete: jest.fn<Promise<any>, [unknown]>(),
      },
      saleItem: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      paymentTransaction: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
    };

    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return callback(prismaMock);
      }

      return Promise.all(callback as Promise<unknown>[]);
    });

    cacheMock = {
      delByPrefix: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthorizeNetService, useValue: {} },
        { provide: CacheService, useValue: cacheMock },
        { provide: TeamsService, useValue: {} },
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

  it('remove() archives a sale without hard deleting related records', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      organizationId: 'org-1',
      deletedAt: null,
      totalAmount: 1200,
      status: SaleStatus.PENDING,
      currency: 'USD',
      description: null,
      contractUrl: null,
      paymentPlan: PaymentPlanType.ONE_TIME,
      installmentCount: null,
      clientId: 'client-1',
      brandId: 'brand-1',
      customerProfileId: null,
      paymentProfileId: null,
      subscriptionId: null,
      items: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.sale.update.mockResolvedValue({});
    prismaMock.saleActivity.create.mockResolvedValue({});

    const result = await service.remove('sale-1', 'org-1', 'user-1');

    expect(prismaMock.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.saleActivity.create).toHaveBeenCalledWith({
      data: {
        saleId: 'sale-1',
        userId: 'user-1',
        type: 'STATUS_CHANGE',
        data: {
          action: 'ARCHIVED',
          deletedAt: expect.any(String),
        },
      },
    });
    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
    expect(prismaMock.saleItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.paymentTransaction.deleteMany).not.toHaveBeenCalled();
    expect(cacheMock.delByPrefix).toHaveBeenCalledWith('sales:org-1:');
    expect(result).toEqual({ message: 'Sale archived successfully' });
  });
});
