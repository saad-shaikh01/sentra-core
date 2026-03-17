import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PaymentPlanType, SaleStatus, UserRole } from '@sentra-core/types';
import { CacheService } from '../../../common';
import { AuthorizeNetService } from '../../authorize-net';
import { TeamsService } from '../../teams';
import { CreateSaleDto } from '../dto';
import { SalesNotificationService } from '../sales-notification.service';
import { SalesService } from '../sales.service';

const orgId = 'org-1';
const actorId = 'user-1';
const clientId = 'client-1';
const matchedClientId = 'client-match';
const leadId = 'lead-1';
const brandId = 'brand-1';
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

describe('SalesService collision warning', () => {
  let service: SalesService;
  let prismaMock: {
    $transaction: jest.Mock<Promise<unknown>, [unknown]>;
    client: {
      findFirst: jest.Mock<Promise<any>, [unknown]>;
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    lead: {
      findUnique: jest.Mock<Promise<any>, [unknown]>;
      update: jest.Mock<Promise<any>, [unknown]>;
    };
    sale: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    invoice: {
      create: jest.Mock<Promise<any>, [unknown]>;
      createMany: jest.Mock<Promise<any>, [unknown]>;
    };
    saleActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    clientActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
    leadActivity: {
      create: jest.Mock<Promise<any>, [unknown]>;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn<Promise<unknown>, [unknown]>(),
      client: {
        findFirst: jest.fn<Promise<any>, [unknown]>(),
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      lead: {
        findUnique: jest.fn<Promise<any>, [unknown]>(),
        update: jest.fn<Promise<any>, [unknown]>(),
      },
      sale: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      invoice: {
        create: jest.fn<Promise<any>, [unknown]>(),
        createMany: jest.fn<Promise<any>, [unknown]>(),
      },
      saleActivity: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      clientActivity: {
        create: jest.fn<Promise<any>, [unknown]>(),
      },
      leadActivity: {
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

  it('returns collisionWarning when lead email matches a different existing client', async () => {
    prismaMock.lead.findUnique.mockResolvedValue({
      id: leadId,
      email: 'match@example.com',
      name: 'Lead Name',
      phone: null,
      title: null,
      brandId,
      organizationId: orgId,
      deletedAt: null,
      convertedClientId: null,
    });
    prismaMock.client.findFirst.mockResolvedValue({
      id: matchedClientId,
      companyName: 'Matched Client',
    });

    const result = await (service as any).resolveClientIdFromLead(orgId, actorId, leadId);

    expect(result).toEqual({
      clientId: matchedClientId,
      collisionWarning: {
        matched: true,
        matchedClientId,
        matchedClientName: 'Matched Client',
      },
    });
  });

  it('returns no collisionWarning when lead already points to its own converted client', async () => {
    prismaMock.lead.findUnique.mockResolvedValue({
      id: leadId,
      email: 'owned@example.com',
      name: 'Lead Name',
      phone: null,
      title: null,
      brandId,
      organizationId: orgId,
      deletedAt: null,
      convertedClientId: clientId,
    });
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });

    const result = await (service as any).resolveClientIdFromLead(orgId, actorId, leadId);

    expect(result).toEqual({ clientId });
  });

  it('returns no collisionWarning when lead has no email match', async () => {
    prismaMock.lead.findUnique.mockResolvedValue({
      id: leadId,
      email: 'new@example.com',
      name: 'Lead Name',
      phone: null,
      title: null,
      brandId,
      organizationId: orgId,
      deletedAt: null,
      convertedClientId: null,
    });
    prismaMock.client.findFirst.mockResolvedValue(null);
    prismaMock.client.create.mockResolvedValue({
      id: clientId,
      companyName: 'New Client',
    });
    prismaMock.clientActivity.create.mockResolvedValue({ id: 'activity-1' });
    prismaMock.lead.update.mockResolvedValue({});
    prismaMock.leadActivity.create.mockResolvedValue({ id: 'lead-activity-1' });

    const result = await (service as any).resolveClientIdFromLead(orgId, actorId, leadId);

    expect(result).toEqual({ clientId });
    expect(prismaMock.client.create).toHaveBeenCalledTimes(1);
  });

  it('returns no collisionWarning when sale is created directly with clientId', async () => {
    const resolveFromLeadSpy = jest.spyOn(service as any, 'resolveClientIdFromLead');
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });
    prismaMock.sale.create.mockResolvedValue(makeSale({ clientId }));
    prismaMock.invoice.create.mockResolvedValue({ id: 'invoice-1' });
    prismaMock.saleActivity.create.mockResolvedValue({ id: 'activity-1' });

    const result = await service.create(
      orgId,
      actorId,
      UserRole.OWNER,
      makeCreateSaleDto({ leadId: undefined }),
    );

    expect(resolveFromLeadSpy).not.toHaveBeenCalled();
    expect(result.collisionWarning).toBeUndefined();
  });
});
