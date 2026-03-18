import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppCode, PrismaService } from '@sentra-core/prisma-client';
import { JwtPayload, UserRole } from '@sentra-core/types';
import {
  RBAC_PERMISSIONS,
  RBAC_SYSTEM_ROLES,
  runRbacSeed,
} from '../../../../../../libs/backend/prisma-client/prisma/seeds/rbac.seed';
import { RbacService } from './rbac.service';

type PermissionRecord = {
  id: string;
  appId: string;
  key: string;
  label: string;
  description: string | null;
  isActive: boolean;
};

type RolePermissionRecord = {
  appRoleId: string;
  permissionId: string;
};

type AppRoleRecord = {
  id: string;
  organizationId: string | null;
  appId: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
};

const currentUser: JwtPayload = {
  sub: 'user-1',
  email: 'owner@example.com',
  orgId: 'org-1',
  role: UserRole.OWNER,
  jti: 'jti-1',
};

function makeRoleWithPermissions(role: Partial<AppRoleRecord> = {}, permissions: any[] = []) {
  return {
    id: role.id ?? 'role-1',
    organizationId: role.organizationId ?? currentUser.orgId,
    appId: role.appId ?? 'app-sales',
    name: role.name ?? 'Role',
    slug: role.slug ?? 'role_slug',
    description: role.description ?? null,
    isSystem: role.isSystem ?? false,
    isActive: role.isActive ?? true,
    createdAt: role.createdAt ?? new Date('2026-03-18T00:00:00.000Z'),
    updatedAt: role.updatedAt ?? new Date('2026-03-18T00:00:00.000Z'),
    permissions,
  };
}

function buildSeedHarness() {
  const apps = new Map<AppCode, { id: string; code: AppCode; name: string; description: string | null; baseUrl: string | null; isActive: boolean }>();
  const permissions = new Map<string, PermissionRecord>();
  const roles = new Map<string, AppRoleRecord>();
  const rolePermissions: RolePermissionRecord[] = [];
  let sequence = 1;

  const tx = {
    appRegistry: {
      upsert: async ({ where, update, create }: any) => {
        const existing = apps.get(where.code);
        const app = existing
          ? { ...existing, ...update }
          : { id: `app-${sequence++}`, ...create };
        apps.set(where.code, app);
        return app;
      },
    },
    permissionCatalog: {
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.appId_key.appId}:${where.appId_key.key}`;
        const existing = permissions.get(key);
        const permission = existing
          ? { ...existing, ...update }
          : { id: `perm-${sequence++}`, ...create };
        permissions.set(key, permission);
        return permission;
      },
      findMany: async ({ where }: any) => {
        const keys = new Set(where.key.in);
        return [...permissions.values()]
          .filter((permission) => permission.appId === where.appId && keys.has(permission.key))
          .map((permission) => ({ id: permission.id, key: permission.key }));
      },
    },
    appRole: {
      findFirst: async ({ where }: any) =>
        [...roles.values()].find(
          (role) =>
            role.organizationId === where.organizationId &&
            role.appId === where.appId &&
            role.slug === where.slug,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const existing = roles.get(where.id);
        if (!existing) {
          throw new Error(`Role not found: ${where.id}`);
        }

        const updated = { ...existing, ...data, updatedAt: new Date('2026-03-18T12:00:00.000Z') };
        roles.set(where.id, updated);
        return updated;
      },
      create: async ({ data }: any) => {
        const role = {
          id: `role-${sequence++}`,
          createdAt: new Date('2026-03-18T00:00:00.000Z'),
          updatedAt: new Date('2026-03-18T00:00:00.000Z'),
          ...data,
        };
        roles.set(role.id, role);
        return role;
      },
    },
    appRolePermission: {
      deleteMany: async ({ where }: any) => {
        for (let index = rolePermissions.length - 1; index >= 0; index -= 1) {
          if (rolePermissions[index].appRoleId === where.appRoleId) {
            rolePermissions.splice(index, 1);
          }
        }

        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        for (const item of data) {
          rolePermissions.push(item);
        }

        return { count: data.length };
      },
    },
  };

  return {
    prisma: {
      $transaction: async (callback: any) => callback(tx),
      $disconnect: async () => undefined,
      appRegistry: tx.appRegistry,
      permissionCatalog: tx.permissionCatalog,
      appRole: tx.appRole,
      appRolePermission: tx.appRolePermission,
    },
    getState: () => ({ apps, permissions, roles, rolePermissions }),
  };
}

describe('RbacService', () => {
  let service: RbacService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      appRegistry: {
        findFirst: jest.fn(),
      },
      appRole: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      permissionCatalog: {
        findMany: jest.fn(),
      },
      appRolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      userAppRole: {
        count: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RbacService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<RbacService>(RbacService);

    prismaMock.appRegistry.findFirst.mockResolvedValue({ id: 'app-sales' });
  });

  it('seed runs without error and creates permissions plus system roles', async () => {
    const harness = buildSeedHarness();

    await runRbacSeed(harness.prisma as any);
    await runRbacSeed(harness.prisma as any);

    const state = harness.getState();
    expect(state.permissions.size).toBe(RBAC_PERMISSIONS.length);
    expect([...state.roles.values()].filter((role) => role.organizationId === null)).toHaveLength(
      RBAC_SYSTEM_ROLES.length,
    );
    expect(state.rolePermissions.length).toBeGreaterThan(0);
  });

  it('system role delete throws 403', async () => {
    prismaMock.appRole.findFirst.mockResolvedValue(
      makeRoleWithPermissions({ id: 'role-system', organizationId: null, isSystem: true }),
    );

    await expect(service.deleteRole('SALES', 'role-system', currentUser)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.appRole.delete).not.toHaveBeenCalled();
  });

  it('system role permission replacement throws 403', async () => {
    prismaMock.appRole.findFirst.mockResolvedValue(
      makeRoleWithPermissions({ id: 'role-system', organizationId: null, isSystem: true }),
    );

    await expect(
      service.replaceRolePermissions(
        'SALES',
        'role-system',
        { permissionIds: ['perm-1'] },
        currentUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('custom role delete with assigned users throws 409', async () => {
    prismaMock.appRole.findFirst.mockResolvedValue(
      makeRoleWithPermissions({ id: 'role-custom', organizationId: currentUser.orgId }),
    );
    prismaMock.userAppRole.count.mockResolvedValue(1);

    await expect(service.deleteRole('SALES', 'role-custom', currentUser)).rejects.toThrow(
      ConflictException,
    );
  });

  it('custom role permission replacement returns new set and get confirms it', async () => {
    const updatedPermissions = [
      {
        permission: {
          id: 'perm-1',
          key: 'sales:leads:view_own',
          label: 'View Own Leads',
          description: null,
        },
      },
      {
        permission: {
          id: 'perm-2',
          key: 'sales:leads:create',
          label: 'Create Leads',
          description: null,
        },
      },
    ];

    prismaMock.appRole.findFirst
      .mockResolvedValueOnce(makeRoleWithPermissions({ id: 'role-custom' }))
      .mockResolvedValueOnce(makeRoleWithPermissions({ id: 'role-custom' }, updatedPermissions));
    prismaMock.permissionCatalog.findMany.mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]);

    const result = await service.replaceRolePermissions(
      'SALES',
      'role-custom',
      { permissionIds: ['perm-1', 'perm-2'] },
      currentUser,
    );

    expect(prismaMock.appRolePermission.deleteMany).toHaveBeenCalledWith({
      where: { appRoleId: 'role-custom' },
    });
    expect(result).toEqual([
      {
        id: 'perm-2',
        appCode: 'SALES',
        code: 'sales:leads:create',
        label: 'Create Leads',
        description: null,
      },
      {
        id: 'perm-1',
        appCode: 'SALES',
        code: 'sales:leads:view_own',
        label: 'View Own Leads',
        description: null,
      },
    ]);
  });

  it('cross-app permission assignment throws 400', async () => {
    prismaMock.appRole.findFirst.mockResolvedValue(makeRoleWithPermissions({ id: 'role-custom' }));
    prismaMock.permissionCatalog.findMany.mockResolvedValue([{ id: 'perm-sales' }]);

    await expect(
      service.replaceRolePermissions(
        'SALES',
        'role-custom',
        { permissionIds: ['perm-sales', 'perm-pm'] },
        currentUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('get roles returns merged system and org custom roles', async () => {
    prismaMock.appRole.findMany.mockResolvedValue([
      makeRoleWithPermissions({ id: 'role-custom', isSystem: false, name: 'Custom Closer', slug: 'custom_closer' }),
      makeRoleWithPermissions({ id: 'role-system', organizationId: null, isSystem: true, name: 'Sales Admin', slug: 'sales_admin' }),
    ]);

    const result = await service.listRoles('SALES', currentUser);

    expect(result.map((role: any) => role.id)).toEqual(['role-system', 'role-custom']);
  });

  it('unknown appCode throws 400', async () => {
    await expect(service.listPermissions('UNKNOWN')).rejects.toThrow(BadRequestException);
  });
});
