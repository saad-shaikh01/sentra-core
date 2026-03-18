import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AppCode, PrismaService } from '@sentra-core/prisma-client';
import { JwtPayload, UserRole } from '@sentra-core/types';
import { CacheService } from '../cache/cache.service';
import { PermissionsService } from '../services/permissions.service';
import { PermissionsGuard } from './permissions.guard';

function createHttpContext(user?: JwtPayload): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const salesUser: JwtPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  orgId: 'org-1',
  role: UserRole.FRONTSELL_AGENT,
  appCodes: [AppCode.SALES_DASHBOARD],
  jti: 'jti-1',
};

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let permissionsService: { getUserPermissions: jest.Mock; matchesAnyPermission: jest.Mock };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    permissionsService = {
      getUserPermissions: jest.fn(),
      matchesAnyPermission: jest.fn((permissions: string[], requiredPermission: string) =>
        permissions.some(
          (permission) =>
            permission === requiredPermission ||
            permission === '*:*:*' ||
            permission === `${requiredPermission.split(':', 1)[0]}:*:*`,
        ),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
        {
          provide: PermissionsService,
          useValue: permissionsService,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
  });

  it('allows when no @Permissions decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(createHttpContext(salesUser))).resolves.toBe(true);
    expect(permissionsService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when no user is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(['sales:leads:create']);

    await expect(guard.canActivate(createHttpContext())).rejects.toThrow(UnauthorizedException);
  });

  it('allows when the user has a matching permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['sales:leads:create']);
    permissionsService.getUserPermissions.mockResolvedValue(['sales:leads:create']);

    await expect(guard.canActivate(createHttpContext(salesUser))).resolves.toBe(true);
  });

  it('throws ForbiddenException when the user lacks the permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['sales:leads:delete']);
    permissionsService.getUserPermissions.mockResolvedValue(['sales:leads:create']);

    await expect(guard.canActivate(createHttpContext(salesUser))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows wildcard app permission sales:*:*', async () => {
    reflector.getAllAndOverride.mockReturnValue(['sales:leads:view_all']);
    permissionsService.getUserPermissions.mockResolvedValue(['sales:*:*']);

    await expect(guard.canActivate(createHttpContext(salesUser))).resolves.toBe(true);
  });

  it('allows global wildcard permission *:*:*', async () => {
    reflector.getAllAndOverride.mockReturnValue(['pm:tasks:view_all']);
    permissionsService.getUserPermissions.mockResolvedValue(['*:*:*']);
    const crossAppUser = { ...salesUser, appCodes: [AppCode.SALES_DASHBOARD, AppCode.PM_DASHBOARD] };

    await expect(guard.canActivate(createHttpContext(crossAppUser))).resolves.toBe(true);
  });
});

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prismaMock: any;
  let cacheService: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      userAppRole: {
        findMany: jest.fn(),
      },
    };

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  it('loads the union of permissions on a cache miss and stores them with a 300_000 ms TTL', async () => {
    cacheService.get.mockResolvedValue(undefined);
    prismaMock.userAppRole.findMany.mockResolvedValue([
      {
        appRole: {
          permissions: [
            { permission: { key: 'sales:leads:create' } },
            { permission: { key: 'sales:sales:create' } },
          ],
        },
      },
      {
        appRole: {
          permissions: [
            { permission: { key: 'sales:sales:create' } },
            { permission: { key: 'sales:sales:refund' } },
          ],
        },
      },
    ]);

    const result = await service.getUserPermissions('user-1', 'org-1');

    expect(result).toEqual([
      'sales:leads:create',
      'sales:sales:create',
      'sales:sales:refund',
    ]);
    expect(cacheService.set).toHaveBeenCalledWith(
      'perms:user-1:org-1',
      result,
      300_000,
    );
  });

  it('uses the cached permissions on a cache hit', async () => {
    cacheService.get.mockResolvedValue(['sales:leads:create']);

    const first = await service.getUserPermissions('user-1', 'org-1');
    const second = await service.getUserPermissions('user-1', 'org-1');

    expect(first).toEqual(['sales:leads:create']);
    expect(second).toEqual(['sales:leads:create']);
    expect(prismaMock.userAppRole.findMany).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
