# RBAC-003: Permission Guard + @Permissions Decorator

## Overview
Replace the existing `RolesGuard` (which checks `user.role` from JWT against a hardcoded hierarchy) with a `PermissionsGuard` that resolves the user's effective permissions from their `UserAppRole` assignments in DB and checks against the `@Permissions()` decorator on each controller handler.

## Background / Context
`roles.guard.ts` currently uses `user.role` string from JWT + a static `ROLE_HIERARCHY` object. Every role change requires a code deploy. The new guard resolves permissions dynamically from DB and caches them in Redis per user per org for performance.

## Acceptance Criteria
- [ ] `@Permissions('sales:leads:view_all')` decorator works on controller handlers
- [ ] `PermissionsGuard` reads user's roles from `UserAppRole` table (all roles), unions their permissions
- [ ] Permission check result is cached in Redis (key: `perms:{userId}:{orgId}`, TTL: 5 minutes)
- [ ] Cache is invalidated when user's roles change (assign or remove role triggers cache delete)
- [ ] Old `RolesGuard` and `@Roles()` decorator are kept but deprecated (for backward compat during migration)
- [ ] Guard short-circuits with 403 if user has no app access to the current app
- [ ] Guard short-circuits with 401 if no user context in request
- [ ] All existing controllers gradually migrate from `@Roles()` to `@Permissions()` (tracked in this ticket)
- [ ] Wildcard permission `sales:*:*` (used by admin roles) correctly matches all sales permissions

## Technical Specification

### Decorator

```typescript
// common/decorators/permissions.decorator.ts

import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'required_permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

### Permission Guard

```typescript
// common/guards/permissions.guard.ts

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Permissions decorator = allow (public or jwt-only protected)
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) throw new UnauthorizedException();

    const userId = user.sub;
    const orgId = user.organizationId;

    // Get effective permissions (from cache or DB)
    const effectivePermissions = await this.getEffectivePermissions(userId, orgId);

    // Check all required permissions are present
    const hasAll = requiredPermissions.every(required => {
      // Wildcard check: if user has "sales:*:*" it covers "sales:leads:view_all"
      if (effectivePermissions.has('*:*:*')) return true;
      const [app] = required.split(':');
      if (effectivePermissions.has(`${app}:*:*`)) return true;
      return effectivePermissions.has(required);
    });

    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private async getEffectivePermissions(userId: string, orgId: string): Promise<Set<string>> {
    const cacheKey = `perms:${userId}:${orgId}`;

    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached));

    // Load from DB: all UserAppRole → AppRole → AppRolePermission → PermissionCatalog
    const userRoles = await this.prisma.userAppRole.findMany({
      where: { userId, organizationId: orgId },
      include: {
        appRole: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        }
      }
    });

    // Union all permissions across all roles
    const allPermissions = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePerm of userRole.appRole.permissions) {
        allPermissions.add(rolePerm.permission.code);
      }
    }

    // Cache for 5 minutes (300s)
    await this.cache.set(cacheKey, JSON.stringify([...allPermissions]), 300);

    return allPermissions;
  }
}
```

### Cache Invalidation on Role Change

```typescript
// user-app-access.service.ts — call this after every assign/remove role operation:

async invalidatePermissionsCache(userId: string, orgId: string) {
  const cacheKey = `perms:${userId}:${orgId}`;
  await this.cache.del(cacheKey);
}

// Call invalidatePermissionsCache in:
// - assignRole()
// - removeRole()
// - grantAppAccess() — in case roles were implicitly changed
// - revokeAppAccess() — roles removed, perms change
// - suspendUser() — though suspended check is elsewhere
```

### Register Guard Globally (or per-module)

```typescript
// Option A: Global (recommended — applies everywhere)
// app.module.ts providers:
{
  provide: APP_GUARD,
  useClass: PermissionsGuard,
}
// Note: this runs AFTER JwtAuthGuard. JwtAuthGuard must be first global guard.

// Option B: Per-module
@UseGuards(JwtAuthGuard, PermissionsGuard)
```

### Controller Migration Examples

```typescript
// BEFORE (old approach):
@Get('leads')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
async getLeads() {}

// AFTER (new approach):
@Get('leads')
@Permissions('sales:leads:view_all')
async getLeads() {}

// For "view own OR view all" — use OR logic:
@Get('leads')
@Permissions('sales:leads:view_own') // minimum permission — service filters data accordingly
async getLeads(@Req() req) {
  const canViewAll = await this.permissionsService.userHasPermission(req.user.sub, req.user.orgId, 'sales:leads:view_all');
  // service-level: if canViewAll, return all; else filter by userId
}
```

### Helper Service for In-Code Permission Checks

```typescript
// common/services/permissions.service.ts

@Injectable()
export class PermissionsService {
  async userHasPermission(userId: string, orgId: string, permission: string): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId, orgId);
    const [app] = permission.split(':');
    return perms.has('*:*:*') || perms.has(`${app}:*:*`) || perms.has(permission);
  }

  async getUserPermissions(userId: string, orgId: string): Promise<string[]> {
    const perms = await this.getEffectivePermissions(userId, orgId);
    return [...perms];
  }
}
```

### Controllers to Migrate (tracked list)

| Controller | Current guard | New permission |
|---|---|---|
| sales.controller.ts GET /leads | RolesGuard | `sales:leads:view_own` (min) |
| sales.controller.ts POST /leads | RolesGuard | `sales:leads:create` |
| sales.controller.ts PATCH /sales/:id | RolesGuard | `sales:sales:edit_own` (min) |
| sales.controller.ts POST /sales/:id/refund | RolesGuard | `sales:sales:refund` |
| sales.controller.ts GET /reports | RolesGuard | `sales:reports:view` |

(Add remaining controllers as found)

## Testing Requirements

### Unit Tests
- `getEffectivePermissions()` returns union of all role permissions for user with 2 roles
- Cache is hit on second call (no DB query)
- Cache invalidation removes the key from Redis
- Wildcard `sales:*:*` passes check for `sales:leads:view_all`
- Wildcard `*:*:*` passes any permission check
- Missing permission → ForbiddenException
- No user in request → UnauthorizedException

### Integration Tests
- Assign `frontsell_agent` + `upsell_agent` to user → permission check for `sales:leads:create` passes (from frontsell)
- Assign `frontsell_agent` + `upsell_agent` to user → permission check for `sales:sales:edit_own` passes (from upsell)
- Remove `frontsell_agent` → cache invalidated → permission check for `sales:leads:create` now fails
- Admin with `sales_admin` role → any sales permission check passes

### Performance Test
- 100 concurrent requests for same user → only 1 DB query (cache shared within TTL window)

### Edge Cases
- User with 0 roles → empty permission set → all permission checks fail
- TTL expired → next request re-fetches from DB and re-caches
- Permission check for `pm:tasks:view_all` when user only has SALES roles → fails (correctly)
