import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppCode, PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { HrmsCacheService } from '../../common';
import { AccessManagementService } from './access-management.service';

describe('AccessManagementService', () => {
  let service: AccessManagementService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    appRegistry: {
      findFirst: jest.fn(),
    },
    userAppAccess: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    userAppRole: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    appRole: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock = {
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));

    const module = await Test.createTestingModule({
      providers: [
        AccessManagementService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: HrmsCacheService, useValue: cacheMock },
      ],
    }).compile();

    service = module.get(AccessManagementService);
  });

  it('grantAccess is idempotent', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord());
    prismaMock.appRegistry.findFirst.mockResolvedValue(makeAppRecord());
    prismaMock.userAppAccess.findUnique.mockResolvedValue({
      id: 'access-1',
      isDefault: false,
    });
    prismaMock.userAppAccess.count.mockResolvedValue(1);
    prismaMock.userAppAccess.upsert.mockResolvedValue(makeAccessRecord());

    const first = await service.grantAccess('user-1', 'sales', 'org-1', 'admin-1');
    const second = await service.grantAccess('user-1', 'SALES', 'org-1', 'admin-1');

    expect(prismaMock.userAppAccess.upsert).toHaveBeenCalledTimes(2);
    expect(first.message).toBe('Access to SALES granted');
    expect(second.message).toBe('Access to SALES granted');
    expect(cacheMock.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });

  it('grantAccess fails for deactivated users', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord({ status: UserStatus.DEACTIVATED }));
    prismaMock.appRegistry.findFirst.mockResolvedValue(makeAppRecord());

    await expect(service.grantAccess('user-1', 'sales', 'org-1', 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('revokeAccess removes all roles for the app and invalidates cache', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord());
    prismaMock.appRegistry.findFirst.mockResolvedValue(makeAppRecord());
    prismaMock.userAppAccess.findUnique.mockResolvedValue({
      id: 'access-1',
      isEnabled: true,
      isDefault: false,
    });
    prismaMock.userAppRole.findMany.mockResolvedValue([{ id: 'role-1' }, { id: 'role-2' }]);

    const result = await service.revokeAccess('user-1', 'sales', 'org-1', 'admin-1');

    expect(prismaMock.userAppAccess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', userId: 'user-1', appId: 'app-sales' },
        data: expect.objectContaining({ isEnabled: false, revokedBy: 'admin-1' }),
      }),
    );
    expect(prismaMock.userAppRole.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        appId: 'app-sales',
      },
    });
    expect(result).toEqual({
      message: 'Access to SALES revoked',
      appCode: 'SALES',
      rolesRemoved: 2,
    });
    expect(cacheMock.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });

  it('assignRole fails if the user does not have app access', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord());
    prismaMock.appRole.findUnique.mockResolvedValue(makeRoleRecord());
    prismaMock.userAppAccess.findUnique.mockResolvedValue(null);

    await expect(service.assignRole('user-1', 'role-1', 'org-1', 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('assignRole fails for a different organization custom role', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord());
    prismaMock.appRole.findUnique.mockResolvedValue(
      makeRoleRecord({ organizationId: 'org-2', isSystem: false }),
    );

    await expect(service.assignRole('user-1', 'role-1', 'org-1', 'admin-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('removeRole fails when the assignment belongs to a different user', async () => {
    prismaMock.userAppRole.findFirst.mockResolvedValue(null);

    await expect(service.removeRole('user-1', 'user-app-role-1', 'org-1', 'admin-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getAccessSummary returns roles and distinct permission counts per app', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUserRecord());
    prismaMock.userAppAccess.findMany.mockResolvedValue([
      {
        id: 'access-1',
        organizationId: 'org-1',
        userId: 'user-1',
        appId: 'app-sales',
        grantedBy: 'admin-1',
        updatedAt: new Date('2026-03-19T10:00:00.000Z'),
        createdAt: new Date('2026-03-19T10:00:00.000Z'),
        isEnabled: true,
        isDefault: true,
        app: makeAppRecord({ name: 'Sales Dashboard' }),
      },
    ]);
    prismaMock.userAppRole.findMany.mockResolvedValue([
      makeAssignmentRecord({
        id: 'assignment-1',
        appId: 'app-sales',
        appRoleId: 'role-1',
        assignedAt: new Date('2026-03-19T11:00:00.000Z'),
        appRole: {
          id: 'role-1',
          name: 'Frontsell Agent',
          slug: 'frontsell_agent',
          isSystem: true,
          permissions: [
            { permission: { key: 'sales.lead.read' } },
            { permission: { key: 'sales.lead.write' } },
          ],
        },
      }),
      makeAssignmentRecord({
        id: 'assignment-2',
        appId: 'app-sales',
        appRoleId: 'role-2',
        assignedAt: new Date('2026-03-19T12:00:00.000Z'),
        appRole: {
          id: 'role-2',
          name: 'Upsell Agent',
          slug: 'upsell_agent',
          isSystem: true,
          permissions: [
            { permission: { key: 'sales.lead.write' } },
            { permission: { key: 'sales.client.read' } },
          ],
        },
      }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1', email: 'admin@example.com' }]);

    const result = await service.getAccessSummary('user-1', 'org-1');

    expect(result).toEqual({
      userId: 'user-1',
      apps: [
        {
          appCode: 'SALES',
          appLabel: 'Sales Dashboard',
          grantedAt: '2026-03-19T10:00:00.000Z',
          grantedBy: 'admin@example.com',
          roles: [
            {
              userAppRoleId: 'assignment-1',
              roleId: 'role-1',
              roleName: 'Frontsell Agent',
              roleSlug: 'frontsell_agent',
              isSystem: true,
              assignedAt: '2026-03-19T11:00:00.000Z',
            },
            {
              userAppRoleId: 'assignment-2',
              roleId: 'role-2',
              roleName: 'Upsell Agent',
              roleSlug: 'upsell_agent',
              isSystem: true,
              assignedAt: '2026-03-19T12:00:00.000Z',
            },
          ],
          effectivePermissionCount: 3,
        },
      ],
    });
  });

  function makeUserRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      status: UserStatus.ACTIVE,
      ...overrides,
    };
  }

  function makeAppRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'app-sales',
      code: AppCode.SALES_DASHBOARD,
      name: 'Sales Dashboard',
      ...overrides,
    };
  }

  function makeAccessRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'access-1',
      isEnabled: true,
      isDefault: false,
      updatedAt: new Date('2026-03-19T10:00:00.000Z'),
      app: makeAppRecord(),
      ...overrides,
    };
  }

  function makeRoleRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'role-1',
      organizationId: null,
      appId: 'app-sales',
      isActive: true,
      isSystem: true,
      app: makeAppRecord(),
      ...overrides,
    };
  }

  function makeAssignmentRecord(overrides: Record<string, any> = {}) {
    return {
      id: 'assignment-1',
      appId: 'app-sales',
      appRoleId: 'role-1',
      assignedAt: new Date('2026-03-19T11:00:00.000Z'),
      appRole: {
        id: 'role-1',
        name: 'Frontsell Agent',
        slug: 'frontsell_agent',
        isSystem: true,
        permissions: [],
      },
      ...overrides,
    };
  }
});
