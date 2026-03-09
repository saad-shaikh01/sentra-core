import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@sentra-core/prisma-client';
import { LeadStatus, UserRole } from '@sentra-core/types';
import { CacheService } from '../../common';
import { TeamsService } from '../teams';
import { LeadsService } from './leads.service';

interface LeadRecord {
  id: string;
  title: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: LeadStatus;
  source: string | null;
  data: Record<string, unknown> | null;
  brandId: string;
  organizationId: string;
  assignedToId: string | null;
  convertedClientId: string | null;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface LeadWhereInput {
  assignedToId?: string | { in: string[] };
}

type TransactionClient = {
  client: {
    create: jest.Mock;
  };
  lead: {
    update: jest.Mock;
  };
  leadActivity: {
    create: jest.Mock;
  };
};

const orgId = 'org-1';
const userId = 'user-1';
const otherUserId = 'user-2';
const adminId = 'admin-1';
const leadId = 'lead-1';
const brandId = 'brand-1';

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: leadId,
    title: 'Test Lead',
    name: 'Test Lead Name',
    email: 'lead@example.com',
    phone: '+15550000000',
    website: 'https://example.com',
    status: LeadStatus.NEW,
    source: 'Referral',
    data: null,
    brandId,
    organizationId: orgId,
    assignedToId: userId,
    convertedClientId: null,
    followUpDate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function filterLeadsByWhere(leads: LeadRecord[], where?: LeadWhereInput): LeadRecord[] {
  const assignedToFilter = where?.assignedToId;

  if (!assignedToFilter) {
    return leads;
  }

  if (typeof assignedToFilter === 'string') {
    return leads.filter((lead) => lead.assignedToId === assignedToFilter);
  }

  return leads.filter(
    (lead) => lead.assignedToId !== null && assignedToFilter.in.includes(lead.assignedToId),
  );
}

describe('LeadsService', () => {
  let service: LeadsService;
  let prismaMock: {
    lead: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    leadActivity: {
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cacheMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    delByPrefix: jest.Mock;
    hashQuery: jest.Mock;
  };
  let teamsMock: {
    getMemberIds: jest.Mock;
  };
  let transactionClient: TransactionClient;

  beforeEach(async () => {
    transactionClient = {
      client: {
        create: jest.fn(),
      },
      lead: {
        update: jest.fn(),
      },
      leadActivity: {
        create: jest.fn(),
      },
    };

    prismaMock = {
      lead: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      leadActivity: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async <T>(callback: (tx: TransactionClient) => Promise<T>) => callback(transactionClient)),
    };

    cacheMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
      hashQuery: jest.fn().mockReturnValue('hash'),
    };

    teamsMock = {
      getMemberIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: TeamsService, useValue: teamsMock },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  it('TC-B1: changeStatus to FOLLOW_UP without followUpDate throws BadRequestException', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(makeLead());

    await expect(
      service.changeStatus(leadId, orgId, userId, { status: LeadStatus.FOLLOW_UP }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.lead.update).not.toHaveBeenCalled();
  });

  it('TC-B2: changeStatus to FOLLOW_UP with followUpDate succeeds', async () => {
    const followUpDate = new Date('2026-06-01T00:00:00.000Z');

    prismaMock.lead.findUnique.mockResolvedValue(makeLead());
    prismaMock.lead.update.mockResolvedValue(
      makeLead({
        status: LeadStatus.FOLLOW_UP,
        followUpDate,
      }),
    );
    prismaMock.leadActivity.create.mockResolvedValue({
      id: 'activity-1',
    });

    const result = await service.changeStatus(leadId, orgId, userId, {
      status: LeadStatus.FOLLOW_UP,
      followUpDate: '2026-06-01',
    });

    expect(result.status).toBe(LeadStatus.FOLLOW_UP);
    expect(result.followUpDate).toBeTruthy();
  });

  it('TC-B3: changeStatus to CONTACTED without followUpDate succeeds', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(makeLead());
    prismaMock.lead.update.mockResolvedValue(
      makeLead({
        status: LeadStatus.CONTACTED,
      }),
    );
    prismaMock.leadActivity.create.mockResolvedValue({
      id: 'activity-2',
    });

    await expect(
      service.changeStatus(leadId, orgId, userId, { status: LeadStatus.CONTACTED }),
    ).resolves.not.toThrow();
  });

  it('TC-B4: findAll for FRONTSELL_AGENT only returns own leads', async () => {
    const leadRecords = [
      makeLead({ id: 'lead-own', assignedToId: userId }),
      makeLead({ id: 'lead-other', assignedToId: otherUserId }),
    ];

    prismaMock.lead.findMany.mockImplementation(async ({ where }: { where?: LeadWhereInput }) => {
      return filterLeadsByWhere(leadRecords, where);
    });
    prismaMock.lead.count.mockImplementation(async ({ where }: { where?: LeadWhereInput }) => {
      return filterLeadsByWhere(leadRecords, where).length;
    });

    const result = await service.findAll(
      orgId,
      { page: 1, limit: 20 },
      userId,
      UserRole.FRONTSELL_AGENT,
    );

    expect(result.data.every((lead) => lead.assignedToId === userId)).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('TC-B5: findAll for ADMIN returns all org leads', async () => {
    const leadRecords = [
      makeLead({ id: 'lead-admin-1', assignedToId: userId }),
      makeLead({ id: 'lead-admin-2', assignedToId: otherUserId }),
    ];

    prismaMock.lead.findMany.mockImplementation(async ({ where }: { where?: LeadWhereInput }) => {
      return filterLeadsByWhere(leadRecords, where);
    });
    prismaMock.lead.count.mockImplementation(async ({ where }: { where?: LeadWhereInput }) => {
      return filterLeadsByWhere(leadRecords, where).length;
    });

    const result = await service.findAll(
      orgId,
      { page: 1, limit: 20 },
      adminId,
      UserRole.ADMIN,
    );

    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-B6: convert with duplicate email throws ConflictException', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(makeLead());
    transactionClient.client.create.mockRejectedValue(
      new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test-client',
      }),
    );

    await expect(
      service.convert(leadId, orgId, userId, {
        email: 'existing@example.com',
        password: 'Secret123',
        companyName: 'Existing Co',
        contactName: 'Existing Contact',
        phone: '+15551234567',
      }),
    ).rejects.toThrow(ConflictException);

    expect(transactionClient.lead.update).not.toHaveBeenCalled();
  });
});
