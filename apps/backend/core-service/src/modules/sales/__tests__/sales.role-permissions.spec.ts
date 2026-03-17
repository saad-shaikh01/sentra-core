import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PaymentPlanType, SaleStatus, UserRole } from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { CreateSaleDto, UpdateSaleDto } from '../dto';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

const orgId = 'org-1';
const actorId = 'agent-1';
const clientId = '11111111-1111-1111-1111-111111111111';
const brandId = '22222222-2222-2222-2222-222222222222';
const saleId = 'sale-1';

function makeCreateSaleDto(overrides: Partial<CreateSaleDto> = {}): CreateSaleDto {
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
    ...overrides,
  };
}

describe('SalesService role permissions', () => {
  let service: SalesService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    client: {
      findFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
    };
    lead: {
      findFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<any>, [unknown]>;
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    invoice: {
      create: jest.Mock<Promise<any>, [unknown]>;
      createMany: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      client: {
        findFirst: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
      lead: {
        findFirst: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
      sale: {
        create: jest.fn<Promise<any>, [unknown]>(),
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      invoice: {
        create: jest.fn<Promise<any>, [unknown]>(),
        createMany: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>(),
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

  it('allows a scoped agent to create a sale', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
    prismaMock.sale.create.mockResolvedValue(makeSale());
    prismaMock.invoice.create.mockResolvedValue({ id: 'invoice-1' });
    prismaMock.saleActivity.create.mockResolvedValue({ id: 'activity-1' });

    const result = await service.create(orgId, actorId, UserRole.FRONTSELL_AGENT, makeCreateSaleDto());

    expect(prismaMock.lead.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: orgId,
        assignedToId: actorId,
        convertedClientId: clientId,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(result.id).toBe(saleId);
  });

  it('rejects agent create for an unscoped client', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });
    prismaMock.lead.findFirst.mockResolvedValue(null);

    await expect(
      service.create(orgId, actorId, UserRole.FRONTSELL_AGENT, makeCreateSaleDto()),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });

  it('rejects agent create with status ACTIVE', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1' });

    await expect(
      service.create(
        orgId,
        actorId,
        UserRole.FRONTSELL_AGENT,
        makeCreateSaleDto({ status: SaleStatus.ACTIVE }),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });

  it('rejects agent updates that modify totalAmount', async () => {
    prismaMock.sale.findUnique.mockResolvedValue(makeSale());
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1' });

    await expect(
      service.update(
        saleId,
        orgId,
        actorId,
        UserRole.FRONTSELL_AGENT,
        { totalAmount: 999 } as UpdateSaleDto,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });
});
