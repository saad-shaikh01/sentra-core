import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@sentra-core/prisma-client';
import { LeadSource, LeadStatus, LeadType, UserRole } from '@sentra-core/types';
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
  organizationId?: string;
  deletedAt?: null;
  assignedToId?: string | { in: string[] };
  leadDate?: {
    gte?: Date;
    lte?: Date;
  };
  OR?: Array<{
    email?: {
      equals: string;
      mode?: 'insensitive';
    };
  }>;
}

type TransactionClient = {
  client: {
    create: jest.Mock;
  };
  lead: {
    create: jest.Mock;
    update: jest.Mock;
  };
  leadActivity: {
    create: jest.Mock;
    createMany: jest.Mock;
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
    brand: {
      findFirst: jest.Mock;
    };
    lead: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    leadActivity: {
      create: jest.Mock;
      createMany: jest.Mock;
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
        create: jest.fn(),
        update: jest.fn(),
      },
      leadActivity: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
    };

    prismaMock = {
      brand: {
        findFirst: jest.fn(),
      },
      lead: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      leadActivity: {
        create: jest.fn(),
        createMany: jest.fn(),
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
        companyName: 'Existing Co',
        contactName: 'Existing Contact',
        phone: '+15551234567',
      }),
    ).rejects.toThrow(ConflictException);

    expect(transactionClient.lead.update).not.toHaveBeenCalled();
  });

  it('TC-B7: import creates leads from CSV rows and records created activities', async () => {
    prismaMock.brand.findFirst.mockResolvedValue({ id: brandId });
    prismaMock.lead.findMany.mockResolvedValue([]);
    transactionClient.lead.create
      .mockResolvedValueOnce({ id: 'lead-import-1' })
      .mockResolvedValueOnce({ id: 'lead-import-2' });
    transactionClient.leadActivity.createMany.mockResolvedValue({ count: 2 });

    const file = {
      originalname: 'leads.csv',
      mimetype: 'text/csv',
      size: 1024,
      buffer: Buffer.from(
        [
          'name,email,lead_type,source,lead_date,company',
          'Alice,alice@example.com,INBOUND,PPC,2026-03-01,Acme',
          'Bob,bob@example.com,REFERRAL,COLD_REFERRAL,16/03/2026,Globex',
        ].join('\n'),
      ),
    } as any;

    const result = await service.import(orgId, userId, { brandId }, file);

    expect(result).toEqual({
      total: 2,
      created: 2,
      duplicates: 0,
      errors: 0,
      errorDetails: [],
    });
    expect(transactionClient.lead.create).toHaveBeenCalledTimes(2);
    expect(transactionClient.leadActivity.createMany).toHaveBeenCalledTimes(1);
  });

  it('TC-B8: import reports invalid leadType rows in errorDetails', async () => {
    prismaMock.brand.findFirst.mockResolvedValue({ id: brandId });
    prismaMock.lead.findMany.mockResolvedValue([]);

    const file = {
      originalname: 'leads.csv',
      mimetype: 'text/csv',
      size: 512,
      buffer: Buffer.from(
        [
          'name,email,lead_type',
          'Alice,alice@example.com,BAD_TYPE',
        ].join('\n'),
      ),
    } as any;

    const result = await service.import(
      orgId,
      userId,
      { brandId, source: LeadSource.PPC },
      file,
    );

    expect(result.created).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.errorDetails).toEqual([
      {
        row: 2,
        reason: 'Invalid leadType "BAD_TYPE"',
      },
    ]);
  });

  it('TC-B9: import skips duplicate emails from the same file and existing org leads', async () => {
    prismaMock.brand.findFirst.mockResolvedValue({ id: brandId });
    prismaMock.lead.findMany.mockResolvedValue([{ email: 'existing@example.com' }]);
    transactionClient.lead.create.mockResolvedValue({ id: 'lead-import-1' });
    transactionClient.leadActivity.createMany.mockResolvedValue({ count: 1 });

    const file = {
      originalname: 'leads.csv',
      mimetype: 'text/csv',
      size: 1024,
      buffer: Buffer.from(
        [
          'name,email,lead_type',
          'Existing,existing@example.com,INBOUND',
          'Fresh,fresh@example.com,INBOUND',
          'Fresh Copy,fresh@example.com,INBOUND',
        ].join('\n'),
      ),
    } as any;

    const result = await service.import(
      orgId,
      userId,
      { brandId, leadType: LeadType.INBOUND },
      file,
    );

    expect(result).toEqual({
      total: 3,
      created: 1,
      duplicates: 2,
      errors: 0,
      errorDetails: [],
    });
    expect(transactionClient.lead.create).toHaveBeenCalledTimes(1);
  });

  it('TC-B10: findAll date filters apply to leadDate instead of createdAt', async () => {
    prismaMock.lead.findMany.mockResolvedValue([]);
    prismaMock.lead.count.mockResolvedValue(0);

    await service.findAll(
      orgId,
      {
        page: 1,
        limit: 20,
        dateFrom: '2026-03-01',
        dateTo: '2026-03-16',
      },
      adminId,
      UserRole.ADMIN,
    );

    const findManyArgs = prismaMock.lead.findMany.mock.calls[0][0];
    expect(findManyArgs.where.leadDate).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lte: new Date('2026-03-16T23:59:59.999Z'),
    });
    expect(findManyArgs.where.createdAt).toBeUndefined();
  });
});
