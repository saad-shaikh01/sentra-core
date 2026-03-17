import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PaymentPlanType, SaleStatus, UserRole } from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { UpdateSaleDto } from '../dto';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

const orgId = 'org-1';
const actorId = 'user-1';
const saleId = 'sale-1';
const clientId = '11111111-1111-1111-1111-111111111111';
const brandId = '22222222-2222-2222-2222-222222222222';

function makeSale(status: SaleStatus) {
  return {
    id: saleId,
    totalAmount: 1200,
    status,
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
    items: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('SalesService status transitions', () => {
  let service: SalesService;
  let prismaMock: {
    sale: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      sale: {
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>().mockResolvedValue({ id: 'activity-1' }),
      },
    };

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

  it('allows DRAFT -> PENDING for SALES_MANAGER', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.DRAFT));
    prismaMock.sale.update.mockResolvedValue(makeSale(SaleStatus.PENDING));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.SALES_MANAGER,
        { status: SaleStatus.PENDING } as UpdateSaleDto,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: SaleStatus.PENDING }));

    expect(prismaMock.sale.update).toHaveBeenCalledTimes(1);
  });

  it('allows ACTIVE -> REFUNDED for OWNER and blocks SALES_MANAGER', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.ACTIVE));
    prismaMock.sale.update.mockResolvedValue(makeSale(SaleStatus.REFUNDED));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.OWNER,
        { status: SaleStatus.REFUNDED } as UpdateSaleDto,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: SaleStatus.REFUNDED }));

    prismaMock.sale.update.mockClear();

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.SALES_MANAGER,
        { status: SaleStatus.REFUNDED } as UpdateSaleDto,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });

  it('blocks PENDING -> COMPLETED with 422', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.PENDING));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.OWNER,
        { status: SaleStatus.COMPLETED } as UpdateSaleDto,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });

  it('blocks CANCELLED -> ACTIVE with 422', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.CANCELLED));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.OWNER,
        { status: SaleStatus.ACTIVE } as UpdateSaleDto,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });

  it('allows ACTIVE -> COMPLETED for SALES_MANAGER', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.ACTIVE));
    prismaMock.sale.update.mockResolvedValue(makeSale(SaleStatus.COMPLETED));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.SALES_MANAGER,
        { status: SaleStatus.COMPLETED } as UpdateSaleDto,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: SaleStatus.COMPLETED }));

    expect(prismaMock.sale.update).toHaveBeenCalledTimes(1);
  });

  it('allows ACTIVE -> CANCELLED for SALES_MANAGER', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.ACTIVE));
    prismaMock.sale.update.mockResolvedValue(makeSale(SaleStatus.CANCELLED));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.SALES_MANAGER,
        { status: SaleStatus.CANCELLED } as UpdateSaleDto,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: SaleStatus.CANCELLED }));

    expect(prismaMock.sale.update).toHaveBeenCalledTimes(1);
  });

  it('blocks COMPLETED -> CANCELLED with 422', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale(SaleStatus.COMPLETED));

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.OWNER,
        { status: SaleStatus.CANCELLED } as UpdateSaleDto,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });
});
