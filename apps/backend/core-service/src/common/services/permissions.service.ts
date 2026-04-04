import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../cache/cache.service';

const PERMISSIONS_CACHE_TTL_MS = 300_000;

// Permissions granted to legacy roles that have no UserAppRole records.
// This ensures backward compatibility while the system migrates to permission-based access.
const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER:  ['*:*:*'],
  ADMIN:  ['*:*:*'],
  SALES_MANAGER: [
    'sales:leads:view_own', 'sales:leads:view_all', 'sales:leads:create', 'sales:leads:edit_own', 'sales:leads:edit_all',
    'sales:leads:delete', 'sales:leads:assign', 'sales:leads:export',
    'sales:leads:claim', 'sales:leads:collaborate', 'sales:leads:convert', 'sales:leads:import',
    'sales:sales:view_own', 'sales:sales:view_all', 'sales:sales:create', 'sales:sales:edit_all',
    'sales:sales:note', 'sales:sales:contract',
    'sales:invoices:view', 'sales:invoices:create', 'sales:invoices:edit', 'sales:invoices:pay',
    'sales:reports:view', 'sales:reports:export', 'sales:teams:view', 'sales:settings:view',
    'sales:clients:view_own', 'sales:clients:view_all', 'sales:clients:create', 'sales:clients:edit',
    'sales:clients:delete', 'sales:clients:assign', 'sales:clients:note', 'sales:clients:portal',
    'sales:clients:status',
    'sales:page:leads', 'sales:page:clients', 'sales:page:sales', 'sales:page:invoices',
    'sales:page:packages', 'sales:page:teams', 'sales:page:settings',
  ],
  PROJECT_MANAGER: [
    'sales:sales:view_all', 'sales:sales:create', 'sales:sales:note', 'sales:sales:contract',
    'sales:invoices:view', 'sales:invoices:create', 'sales:invoices:edit', 'sales:invoices:pay',
    'sales:reports:view',
    'sales:clients:view_all', 'sales:clients:note',
    'sales:page:clients', 'sales:page:sales', 'sales:page:invoices',
  ],
  FRONTSELL_AGENT: [
    'sales:leads:view_own', 'sales:leads:create', 'sales:leads:edit_own',
    'sales:leads:claim', 'sales:leads:collaborate', 'sales:leads:notify_signup',
    'sales:sales:view_own', 'sales:sales:create', 'sales:sales:edit_own',
    'sales:sales:note', 'sales:invoices:view', 'sales:invoices:pay',
    'sales:page:leads', 'sales:page:sales', 'sales:page:invoices',
  ],
  UPSELL_AGENT: [
    'sales:sales:view_own', 'sales:sales:create', 'sales:sales:edit_own',
    'sales:sales:note', 'sales:invoices:view', 'sales:invoices:pay',
    'sales:clients:view_own', 'sales:clients:edit', 'sales:clients:note', 'sales:clients:status',
    'sales:page:clients', 'sales:page:sales', 'sales:page:invoices',
  ],
};

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

    // No explicit app-role assignments — fall back to legacy system-role permissions
    if (permissions.size === 0) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, organizationId: orgId },
        select: { role: true },
      });
      const legacyPerms = user?.role ? (LEGACY_ROLE_PERMISSIONS[user.role] ?? []) : [];
      await this.cacheService.set(cacheKey, legacyPerms, PERMISSIONS_CACHE_TTL_MS);
      return legacyPerms;
    }

    const resolved = [...permissions].sort((left, right) => left.localeCompare(right));
    await this.cacheService.set(cacheKey, resolved, PERMISSIONS_CACHE_TTL_MS);
    return resolved;
  }

  async userHasPermission(userId: string, orgId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, orgId);
    return this.matchesAnyPermission(permissions, permission);
  }

  getLegacyPermissionsForRole(role: string | null | undefined): string[] {
    if (!role) {
      return [];
    }

    return [...(LEGACY_ROLE_PERMISSIONS[role] ?? [])];
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
    if (grantedPermission === `${requiredApp}:*:*`) {
      return true;
    }

    // _all implies _own (e.g. edit_all satisfies edit_own requirement)
    if (requiredPermission.endsWith('_own')) {
      const allVariant = requiredPermission.slice(0, -'_own'.length) + '_all';
      if (grantedPermission === allVariant) {
        return true;
      }
    }

    return false;
  }

  private getCacheKey(userId: string, orgId: string): string {
    return `perms:${userId}:${orgId}`;
  }
}
