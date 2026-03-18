import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailClientService } from '@sentra-core/mail-client';
import { PrismaService } from '@sentra-core/prisma-client';
import { JwtPayload, UserRole } from '@sentra-core/types';
import { CacheService } from '../../common/cache/cache.service';
import { IamService } from './iam.service';

const currentUser: JwtPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  orgId: 'org-1',
  role: UserRole.OWNER,
  jti: 'jti-1',
};

describe('IamService RBAC-002', () => {
  let service: IamService;
  let prismaMock: any;
  let cacheService: { del: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      userAppAccess: {
        count: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      userAppRole: {
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      appRole: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
    };

    cacheService = {
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IamService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) =>
              key === 'IAM_INVITE_V2' ? 'true' : fallback,
            ),
          },
        },
        {
          provide: MailClientService,
          useValue: {
            sendMail: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    service = module.get<IamService>(IamService);
    jest.spyOn(service as any, 'resolveAppByCode').mockResolvedValue({
      id: 'app-sales',
      code: 'SALES_DASHBOARD',
      name: 'Sales Dashboard',
      baseUrl: 'http://localhost:4200',
    });
    jest.spyOn(service as any, 'assertCanManageApp').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'assertUserInOrg').mockResolvedValue(undefined);
  });

  it('grantAppAccess is idempotent', async () => {
    prismaMock.userAppAccess.count.mockResolvedValue(0);
    prismaMock.userAppAccess.upsert.mockResolvedValue({
      id: 'uaa-1',
      isDefault: true,
      isEnabled: true,
      grantedBy: currentUser.sub,
      revokedAt: null,
      revokedBy: null,
      app: {
        code: 'SALES_DASHBOARD',
        name: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
      },
    });

    const first = await service.grantAppAccess('user-1', 'SALES_DASHBOARD', currentUser);
    const second = await service.grantAppAccess('user-1', 'SALES_DASHBOARD', currentUser);

    expect(first.id).toBe('uaa-1');
    expect(second.id).toBe('uaa-1');
    expect(prismaMock.userAppAccess.upsert).toHaveBeenCalledTimes(2);
    expect(cacheService.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });

  it('revokeAppAccess removes all roles for that app', async () => {
    prismaMock.userAppAccess.findUnique.mockResolvedValue({
      id: 'uaa-1',
      isDefault: false,
      isEnabled: true,
    });
    prismaMock.userAppRole.findMany.mockResolvedValue([{ id: 'uar-1' }, { id: 'uar-2' }]);
    prismaMock.userAppAccess.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prismaMock.userAppRole.deleteMany = jest.fn().mockResolvedValue({ count: 2 });

    const result = await service.revokeAppAccess('user-1', 'SALES_DASHBOARD', currentUser);

    expect(prismaMock.userAppRole.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: currentUser.orgId,
        userId: 'user-1',
        appId: 'app-sales',
      },
    });
    expect(result.removedRoleAssignments).toBe(2);
    expect(cacheService.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });

  it('assignAppRole throws if user does not have access first', async () => {
    prismaMock.appRole.findUnique.mockResolvedValue({
      id: 'role-1',
      appId: 'app-sales',
      organizationId: currentUser.orgId,
      isActive: true,
      app: {
        id: 'app-sales',
        code: 'SALES_DASHBOARD',
        name: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
      },
    });
    prismaMock.userAppAccess.findUnique.mockResolvedValue(null);

    await expect(service.assignAppRole('user-1', 'role-1', currentUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('assignAppRole throws when role belongs to another org', async () => {
    prismaMock.appRole.findUnique.mockResolvedValue({
      id: 'role-1',
      appId: 'app-sales',
      organizationId: 'org-2',
      isActive: true,
      app: {
        id: 'app-sales',
        code: 'SALES_DASHBOARD',
        name: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
      },
    });

    await expect(service.assignAppRole('user-1', 'role-1', currentUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('getMyApps returns apps with populated roles arrays', async () => {
    prismaMock.userAppAccess.findMany.mockResolvedValue([
      {
        app: {
          code: 'SALES_DASHBOARD',
          name: 'Sales Dashboard',
          baseUrl: 'http://localhost:4200',
        },
        isDefault: true,
      },
    ]);
    prismaMock.userAppRole.findMany.mockResolvedValue([
      {
        app: { code: 'SALES_DASHBOARD' },
        appRole: { id: 'role-1', name: 'Frontsell Agent', slug: 'frontsell_agent' },
      },
      {
        app: { code: 'SALES_DASHBOARD' },
        appRole: { id: 'role-2', name: 'Upsell Agent', slug: 'upsell_agent' },
      },
    ]);

    const result = await service.getMyApps('user-1', 'org-1');

    expect(result).toEqual([
      {
        appCode: 'SALES_DASHBOARD',
        appLabel: 'Sales Dashboard',
        appUrl: 'http://localhost:4200',
        appName: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
        isDefault: true,
        roles: [
          { id: 'role-1', name: 'Frontsell Agent', slug: 'frontsell_agent' },
          { id: 'role-2', name: 'Upsell Agent', slug: 'upsell_agent' },
        ],
      },
    ]);
  });

  it('assignAppRole invalidates the permissions cache after a successful assignment', async () => {
    prismaMock.appRole.findUnique.mockResolvedValue({
      id: 'role-1',
      appId: 'app-sales',
      organizationId: currentUser.orgId,
      isActive: true,
      app: {
        id: 'app-sales',
        code: 'SALES_DASHBOARD',
        name: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
      },
    });
    prismaMock.userAppAccess.findUnique.mockResolvedValue({
      id: 'uaa-1',
      isEnabled: true,
    });
    prismaMock.userAppRole.upsert.mockResolvedValue({
      id: 'uar-1',
      assignedAt: new Date('2026-03-18T10:00:00.000Z'),
      assignedBy: currentUser.sub,
      app: {
        code: 'SALES_DASHBOARD',
        name: 'Sales Dashboard',
        baseUrl: 'http://localhost:4200',
      },
      appRole: {
        id: 'role-1',
        name: 'Frontsell Agent',
        slug: 'frontsell_agent',
        isSystem: true,
      },
    });

    await service.assignAppRole('user-1', 'role-1', currentUser);

    expect(cacheService.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });

  it('removeAppRole invalidates the permissions cache after a successful removal', async () => {
    prismaMock.userAppRole.findFirst.mockResolvedValue({
      id: 'uar-1',
      appId: 'app-sales',
      app: {
        code: 'SALES_DASHBOARD',
      },
      appRole: {
        name: 'Frontsell Agent',
        slug: 'frontsell_agent',
      },
    });

    await service.removeAppRole('user-1', 'uar-1', currentUser);

    expect(prismaMock.userAppRole.delete).toHaveBeenCalledWith({
      where: { id: 'uar-1' },
    });
    expect(cacheService.del).toHaveBeenCalledWith('perms:user-1:org-1');
  });
});
