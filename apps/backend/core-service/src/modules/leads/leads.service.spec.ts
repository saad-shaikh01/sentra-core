import { BadRequestException, ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { NOTIFICATION_QUEUE, PrismaService } from '@sentra-core/prisma-client';
import { LeadSource, LeadStatus, LeadType, UserRole } from '@sentra-core/types';
import { CacheService, PermissionsService, StorageService } from '../../common';
import { ScopeService } from '../scope/scope.service';
import { TeamBrandHelper } from '../scope/team-brand.helper';
import { LeadsService } from './leads.service';

interface LeadRecord {
  id: string;
  title: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: LeadStatus;
  leadType: string | null;
  source: string | null;
  leadDate: Date | null;
  lostReason: string | null;
  data: Record<string, unknown> | null;
  brandId: string;
  organizationId: string;
  assignedToId: string | null;
  teamId: string | null;
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
const flushAsyncWork = () => new Promise<void>((resolve) => setImmediate(resolve));

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: leadId,
    title: 'Test Lead',
    name: 'Test Lead Name',
    email: 'lead@example.com',
    phone: '+15550000000',
    website: 'https://example.com',
    status: LeadStatus.NEW,
    leadType: LeadType.INBOUND,
    source: 'Referral',
    leadDate: new Date('2026-01-01T00:00:00.000Z'),
    lostReason: null,
    data: null,
    brandId,
    organizationId: orgId,
    assignedToId: userId,
    teamId: null,
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
      findUnique: jest.Mock;
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
    teamMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
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
  let scopeServiceMock: {
    getUserScope: jest.Mock;
  };
  let teamBrandHelperMock: {
    resolveTeamForBrand: jest.Mock;
    resolveBrandTeamMap: jest.Mock;
  };
  let notifQueueMock: {
    add: jest.Mock;
  };
  let permissionsServiceMock: {
    userHasPermission: jest.Mock;
    getLegacyPermissionsForRole: jest.Mock;
    matchesAnyPermission: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };
  let storageServiceMock: {
    buildUrl: jest.Mock;
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
        findUnique: jest.fn(),
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
      teamMember: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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

    scopeServiceMock = {
      getUserScope: jest.fn(async (requestedUserId: string, requestedOrgId: string, role: UserRole) => ({
        isFullAccess: role === UserRole.ADMIN || role === UserRole.OWNER,
        toLeadFilter: () => (
          role === UserRole.FRONTSELL_AGENT
            ? { organizationId: requestedOrgId, assignedToId: requestedUserId }
            : { organizationId: requestedOrgId }
        ),
      })),
    };

    teamBrandHelperMock = {
      resolveTeamForBrand: jest.fn().mockResolvedValue(null),
      resolveBrandTeamMap: jest.fn().mockResolvedValue(new Map()),
    };

    permissionsServiceMock = {
      userHasPermission: jest.fn().mockResolvedValue(true),
      getLegacyPermissionsForRole: jest.fn().mockReturnValue([]),
      matchesAnyPermission: jest.fn((permissions: Iterable<string>, requiredPermission: string) => {
        const [requiredApp] = requiredPermission.split(':');
        return [...permissions].some((permission) =>
          permission === '*:*:*' ||
          permission === requiredPermission ||
          permission === `${requiredApp}:*:*`,
        );
      }),
    };

    configServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
    };

    storageServiceMock = {
      buildUrl: jest.fn((value: string | null | undefined) => value ?? undefined),
    };

    notifQueueMock = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: ScopeService, useValue: scopeServiceMock },
        { provide: TeamBrandHelper, useValue: teamBrandHelperMock },
        { provide: PermissionsService, useValue: permissionsServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: StorageService, useValue: storageServiceMock },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: notifQueueMock },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  it('TC-B0: create auto-assigns frontsell leads to the creator and creator team', async () => {
    prismaMock.teamMember.findFirst.mockResolvedValue({ teamId: 'team-frontsell' });
    prismaMock.lead.create.mockResolvedValue(
      makeLead({
        id: 'lead-created-frontsell',
        assignedToId: userId,
        teamId: 'team-frontsell',
      }),
    );
    prismaMock.leadActivity.create.mockResolvedValue({ id: 'activity-created' });

    const result = await service.create(orgId, userId, UserRole.FRONTSELL_AGENT, { brandId });

    expect(prismaMock.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: orgId,
        brandId,
        assignedToId: userId,
        teamId: 'team-frontsell',
      }),
    }));
    expect(teamBrandHelperMock.resolveTeamForBrand).not.toHaveBeenCalled();
    expect(result.assignedToId).toBe(userId);
    expect(result.teamId).toBe('team-frontsell');
  });

  it('TC-B0.1: create preserves manual assignee behavior for admin users', async () => {
    teamBrandHelperMock.resolveTeamForBrand.mockResolvedValue('team-brand');
    prismaMock.lead.create.mockResolvedValue(
      makeLead({
        id: 'lead-created-admin',
        assignedToId: otherUserId,
        teamId: 'team-brand',
      }),
    );
    prismaMock.leadActivity.create.mockResolvedValue({ id: 'activity-created-admin' });

    const result = await service.create(orgId, adminId, UserRole.ADMIN, {
      brandId,
      assignedToId: otherUserId,
    });

    expect(prismaMock.teamMember.findFirst).not.toHaveBeenCalled();
    expect(teamBrandHelperMock.resolveTeamForBrand).toHaveBeenCalledWith(brandId);
    expect(prismaMock.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignedToId: otherUserId,
        teamId: 'team-brand',
      }),
    }));
    expect(result.assignedToId).toBe(otherUserId);
    expect(result.teamId).toBe('team-brand');
  });

  it('TC-B0.2: capture persists brand team mapping and notifies admins plus eligible signup team members', async () => {
    prismaMock.brand.findUnique.mockResolvedValue({
      id: brandId,
      organizationId: orgId,
      teamBrand: { teamId: 'team-signup' },
    });
    prismaMock.user.findMany
      .mockResolvedValueOnce([{ id: adminId }])
      .mockResolvedValueOnce([
        {
          id: 'frontsell-legacy',
          role: UserRole.FRONTSELL_AGENT,
          appRoles: [],
        },
        {
          id: 'sales-manager-without-permission',
          role: UserRole.SALES_MANAGER,
          appRoles: [],
        },
        {
          id: 'frontsell-explicit-off',
          role: UserRole.FRONTSELL_AGENT,
          appRoles: [
            {
              appRole: {
                permissions: [{ permission: { key: 'sales:leads:view_own' } }],
              },
            },
          ],
        },
        {
          id: 'frontsell-explicit-on',
          role: UserRole.FRONTSELL_AGENT,
          appRoles: [
            {
              appRole: {
                permissions: [{ permission: { key: 'sales:leads:notify_signup' } }],
              },
            },
          ],
        },
      ]);
    permissionsServiceMock.getLegacyPermissionsForRole.mockImplementation((role: string) =>
      role === UserRole.FRONTSELL_AGENT ? ['sales:leads:notify_signup'] : [],
    );
    prismaMock.lead.create.mockResolvedValue(
      makeLead({
        id: 'lead-captured-signup',
        assignedToId: null,
        teamId: 'team-signup',
        leadType: LeadType.SIGNUP,
        source: LeadSource.PPC,
      }),
    );

    const result = await service.capture({
      brandId,
      leadType: LeadType.SIGNUP,
      source: LeadSource.PPC,
      name: 'Signup Lead',
    });

    await flushAsyncWork();

    expect(prismaMock.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        brandId,
        organizationId: orgId,
        teamId: 'team-signup',
        leadType: LeadType.SIGNUP,
      }),
    }));
    expect(result).toEqual({
      id: 'lead-captured-signup',
      message: 'Lead captured successfully',
    });
    expect(notifQueueMock.add).toHaveBeenCalledTimes(2);
    expect(notifQueueMock.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: orgId,
        recipientIds: [adminId],
        type: 'LEAD_CREATED',
      }),
      expect.any(Object),
    );
    expect(notifQueueMock.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: orgId,
        recipientIds: ['frontsell-legacy', 'frontsell-explicit-on'],
        type: 'LEAD_CREATED',
        title: 'New Signup Lead',
        body: 'A new signup lead "Test Lead" was captured for your team.',
        data: expect.objectContaining({
          leadId: 'lead-captured-signup',
          trigger: 'signup_capture',
          teamId: 'team-signup',
        }),
      }),
      expect.any(Object),
    );
  });

  it('TC-B0.3: capture keeps non-signup notifications admin-only', async () => {
    prismaMock.brand.findUnique.mockResolvedValue({
      id: brandId,
      organizationId: orgId,
      teamBrand: { teamId: 'team-brand' },
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: adminId }]);
    prismaMock.lead.create.mockResolvedValue(
      makeLead({
        id: 'lead-captured-inbound',
        assignedToId: null,
        teamId: 'team-brand',
        leadType: LeadType.INBOUND,
      }),
    );

    await service.capture({
      brandId,
      leadType: LeadType.INBOUND,
      source: LeadSource.WEBHOOK,
      name: 'Inbound Lead',
    });

    await flushAsyncWork();

    expect(prismaMock.teamMember.findMany).not.toHaveBeenCalled();
    expect(permissionsServiceMock.getLegacyPermissionsForRole).not.toHaveBeenCalled();
    expect(permissionsServiceMock.matchesAnyPermission).not.toHaveBeenCalled();
    expect(permissionsServiceMock.userHasPermission).not.toHaveBeenCalled();
    expect(notifQueueMock.add).toHaveBeenCalledTimes(1);
    expect(notifQueueMock.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: orgId,
        recipientIds: [adminId],
        type: 'LEAD_CREATED',
      }),
      expect.any(Object),
    );
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

  it('TC-B3.1: changeStatus to LOST without lostReason throws BadRequestException', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(makeLead({ status: LeadStatus.PROPOSAL }));

    await expect(
      service.changeStatus(leadId, orgId, userId, { status: LeadStatus.LOST }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.lead.update).not.toHaveBeenCalled();
  });

  it('TC-B3.2: changeStatus to INVALID succeeds without lostReason', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(makeLead({ status: LeadStatus.CONTACTED }));
    prismaMock.lead.update.mockResolvedValue(
      makeLead({
        status: LeadStatus.INVALID,
      }),
    );
    prismaMock.leadActivity.create.mockResolvedValue({
      id: 'activity-invalid',
    });

    const result = await service.changeStatus(leadId, orgId, userId, {
      status: LeadStatus.INVALID,
    });

    expect(result.status).toBe(LeadStatus.INVALID);
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
