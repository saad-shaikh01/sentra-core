import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../cache/cache.service';

const PERMISSIONS_CACHE_TTL_MS = 300_000;

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getUserPermissions(userId: string, orgId: string): Promise<string[]> {
    const cacheKey = this.getCacheKey(userId, orgId);
    const cached = await this.cacheService.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const assignments = await this.prisma.userAppRole.findMany({
      where: {
        userId,
        organizationId: orgId,
      },
      include: {
        appRole: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { key: true },
                },
              },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    for (const assignment of assignments) {
      for (const link of assignment.appRole.permissions) {
        permissions.add(link.permission.key);
      }
    }

    const resolved = [...permissions].sort((left, right) => left.localeCompare(right));
    await this.cacheService.set(cacheKey, resolved, PERMISSIONS_CACHE_TTL_MS);
    return resolved;
  }

  async userHasPermission(userId: string, orgId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, orgId);
    return this.matchesAnyPermission(permissions, permission);
  }

  matchesAnyPermission(permissions: Iterable<string>, requiredPermission: string): boolean {
    for (const permission of permissions) {
      if (this.matchesPermission(permission, requiredPermission)) {
        return true;
      }
    }

    return false;
  }

  matchesPermission(grantedPermission: string, requiredPermission: string): boolean {
    if (grantedPermission === '*:*:*' || grantedPermission === requiredPermission) {
      return true;
    }

    const [requiredApp] = requiredPermission.split(':', 1);
    return grantedPermission === `${requiredApp}:*:*`;
  }

  private getCacheKey(userId: string, orgId: string): string {
    return `perms:${userId}:${orgId}`;
  }
}
