 You are the orchestrator agent for implementing RBAC tickets in a NestJS + Next.js
  multi-tenant SaaS. You will break this work into subagents and coordinate them.

  ## Your Task
  Implement these 3 tickets IN ORDER using subagents:
    RBAC-001 → RBAC-002 → RBAC-003

  Ticket files: docs/tickets/rbac/

  ## Orchestration Rules
  - Spawn a subagent per ticket (do NOT do all 3 in one subagent)
  - RBAC-002 subagent must NOT start until RBAC-001 subagent reports complete + tests pass
  - RBAC-003 subagent must NOT start until RBAC-002 subagent reports complete + tests pass
  - After ALL 3 tickets: spawn a dedicated TEST subagent to run the full test suite
  - If any subagent reports a failure or TypeScript error, STOP and fix before continuing

  ---

  ## SUBAGENT 1 — RBAC-001: Permission Catalog + App Roles

  ### What to build
  Read docs/tickets/rbac/RBAC-001-permission-catalog-app-roles.md fully first.

  ### Codebase context
  - Prisma schema: libs/backend/prisma-client/prisma/schema.prisma
  - Core service: apps/backend/core-service/src/
  - HRMS service does NOT exist yet — put role management endpoints in core-service
    under a new module: src/modules/rbac/
  - Existing IAM module: apps/backend/core-service/src/modules/iam/ — READ this first,
    understand what already exists (AppRole, UserAppRole, PermissionCatalog may partially
    exist), DO NOT duplicate
  - Shared types: libs/shared/types/src/lib/types.ts

  ### Steps
  1. READ apps/backend/core-service/src/modules/iam/ fully before writing anything
  2. READ the current Prisma schema — check if PermissionCatalog, AppRole, AppRolePermission
     already exist (the IAM module may have partial models)
  3. Add ONLY missing models/fields to schema.prisma:
     - PermissionCatalog (if not exists)
     - AppRole fields: isSystem, slug, description (add if missing)
     - AppRolePermission junction (if not exists)
  4. Run migration: cd libs/backend/prisma-client && npx prisma migrate dev --name rbac-permission-catalog
  5. Create seed file: libs/backend/prisma-client/prisma/seeds/rbac.seed.ts
     - All permissions from ticket (sales:*, pm:*, hrms:*)
     - All system roles (sales_admin, frontsell_agent, upsell_agent, pm_admin, etc.)
     - Seed must be IDEMPOTENT (upsert, not create — safe to run multiple times)
  6. Create module: apps/backend/core-service/src/modules/rbac/
     - rbac.module.ts
     - rbac.controller.ts
     - rbac.service.ts
  7. Endpoints (all require JwtAuthGuard + OrgContextGuard):
     GET    /rbac/apps/:appCode/roles
     POST   /rbac/apps/:appCode/roles
     PATCH  /rbac/apps/:appCode/roles/:roleId
     DELETE /rbac/apps/:appCode/roles/:roleId
     GET    /rbac/apps/:appCode/permissions
     PUT    /rbac/apps/:appCode/roles/:roleId/permissions
     GET    /rbac/apps/:appCode/roles/:roleId/permissions
  8. Import RbacModule in app.module.ts
  9. Run seed: npx ts-node libs/backend/prisma-client/prisma/seeds/rbac.seed.ts
  10. Write tests: apps/backend/core-service/src/modules/rbac/rbac.service.spec.ts

  ### Constraints
  - System roles (isSystem: true) cannot be deleted or have permissions modified → 403
  - Permission appCode must match role appCode — cross-app assignment rejected → 400
  - organizationId: null on system roles (global), orgId on custom roles (org-scoped)
  - Valid appCodes enum: 'SALES' | 'PM' | 'HRMS' | 'ADMIN' | 'COMM'
  - Deleting a custom role that has UserAppRole assignments → 409 Conflict
  - Seed is idempotent — upsertMany or upsert per item

  ### Tests to write
  - Seed runs without error, creates all permissions + system roles
  - System role: DELETE → 403
  - System role: PUT permissions → 403
  - Custom role: DELETE with assigned users → 409
  - Custom role: PUT permissions (replace) → 200, GET confirms new set
  - Cross-app permission assignment → 400
  - GET roles returns system + org custom roles merged
  - Unknown appCode in URL → 400

  ### Report back
  When done, output:
    ✅ RBAC-001 COMPLETE
    - Migration name: <name>
    - New files: <list>
    - Seed: <ran successfully / failed with error>
    - Tests: <X passing, Y failing>
    - Any deviations from ticket: <list or "none">

  ---

  ## SUBAGENT 2 — RBAC-002: User App Access + Multi-Role

  ### What to build
  Read docs/tickets/rbac/RBAC-002-user-app-access-multi-role.md fully first.

  ### Codebase context
  - Same Prisma schema (RBAC-001 migration already applied)
  - IAM module already has UserAppAccess and UserAppRole — READ iam.service.ts carefully
    before writing anything. DO NOT duplicate existing logic.
  - Auth service: apps/backend/core-service/src/modules/auth/auth.service.ts
    - getAvailableApps() already exists → update or extend, don't replace
  - Frontend apps:
    - apps/frontend/sales-dashboard/src/
    - apps/frontend/pm-dashboard/src/
    - Check existing /auth/select-app page in both (already created by AUTH agent)
      Read it first — update it to use new /auth/my-apps response format if needed

  ### Steps
  1. READ apps/backend/core-service/src/modules/iam/iam.service.ts fully
  2. CHECK what UserAppAccess and UserAppRole already have in schema + IAM service
  3. Add ONLY missing fields to UserAppAccess/UserAppRole if needed:
     - UserAppAccess: grantedBy, revokedAt, revokedBy (add if missing)
     - UserAppRole: assignedBy, assignedAt (add if missing)
  4. Run migration if schema changed: npx prisma migrate dev --name rbac-user-app-roles
  5. Add to rbac.module.ts (or iam.module.ts if more appropriate):
     POST   /rbac/users/:userId/app-access        { appCode }
     DELETE /rbac/users/:userId/app-access/:appCode
     GET    /rbac/users/:userId/app-access
     POST   /rbac/users/:userId/app-roles          { appRoleId }
     DELETE /rbac/users/:userId/app-roles/:id
     GET    /rbac/users/:userId/app-roles
  6. Update GET /auth/my-apps endpoint in auth.controller.ts:
     - Returns: [{ appCode, appLabel, appUrl, roles: [{ id, name, slug }] }]
     - Use UserAppAccess + UserAppRole joins
  7. Update /auth/select-app frontend page in BOTH dashboards:
     - Reads roles from my-apps response
     - Each app card shows user's role(s) within that app
     - If 1 app → direct redirect (no select-app shown)
     - If 0 apps → "No apps assigned" message

  ### Constraints
  - assigning a role WITHOUT granting app access first → 400 with clear message
  - assigning role from different org's custom role → 403
  - grantAccess is idempotent (upsert)
  - revokeAccess also removes ALL UserAppRole rows for that appCode
  - Multi-role: same user can have frontsell_agent + upsell_agent simultaneously
  - Permission cache invalidation: call cacheService.del('perms:{userId}:{orgId}')
    after every assign/revoke

  ### Tests to write
  - grantAccess is idempotent — grant twice → only 1 row
  - revokeAccess removes all roles for that app
  - assignRole without app access → 400
  - assignRole from different org custom role → 403
  - GET /auth/my-apps returns apps with roles array populated
  - User with 2 roles: my-apps shows both roles in that app's card

  ### Frontend tests (manual verify)
  - Select-app page shows role names on each app card
  - User with 1 app skips select-app → direct redirect

  ### Report back
    ✅ RBAC-002 COMPLETE
    - Schema changes: <list or "none">
    - New endpoints: <list>
    - IAM module changes: <summary>
    - Tests: <X passing, Y failing>
    - Deviations: <list or "none">

  ---

  ## SUBAGENT 3 — RBAC-003: Permission Guard + @Permissions Decorator

  ### What to build
  Read docs/tickets/rbac/RBAC-003-permission-guard.md fully first.

  ### Codebase context
  - Existing guards: apps/backend/core-service/src/modules/auth/guards/
    - access-token.guard.ts (JWT guard — DO NOT modify)
    - roles.guard.ts (legacy — keep, just deprecate)
    - app-access.guard.ts (check this, may overlap)
  - Cache service: apps/backend/core-service/src/common/cache/cache.service.ts
  - UserAppRole + AppRolePermission + PermissionCatalog now exist (from RBAC-001/002)

  ### Steps
  1. Create decorator:
     apps/backend/core-service/src/common/decorators/permissions.decorator.ts
     export const Permissions = (...permissions: string[]) => SetMetadata('required_permissions', permissions)

  2. Create guard:
     apps/backend/core-service/src/common/guards/permissions.guard.ts
     - Reads required_permissions from reflector
     - If none set → allow (no decorator = no permission check)
     - Gets userId + orgId from request.user (JWT payload: sub + orgId)
     - Loads UserAppRole → AppRole → AppRolePermission → PermissionCatalog for user
     - Unions all permissions across all roles
     - Caches result in Redis: key = perms:{userId}:{orgId}, TTL = 300s
     - Wildcard check: if perms has "sales:*:*" → passes any "sales:..." check
     - If permission missing → throw ForbiddenException('Insufficient permissions')
     - If no user in request → throw UnauthorizedException

  3. Add GET /auth/my-permissions endpoint in auth.controller.ts:
     - Returns string[] of all effective permission codes for current user
     - Used by frontend PermissionsProvider

  4. Register PermissionsGuard as APP_GUARD (second guard, after AccessTokenGuard):
     In app.module.ts providers array:
     { provide: APP_GUARD, useClass: AccessTokenGuard },   // already exists
     { provide: APP_GUARD, useClass: PermissionsGuard },   // ADD THIS

  5. Migrate 3-5 existing controller methods from @Roles() to @Permissions():
     Pick controllers you've already read. Migrate gradually, not all at once.
     Example migrations:
     - GET /leads → @Permissions('sales:leads:view_own')
     - POST /leads → @Permissions('sales:leads:create')
     - DELETE /leads/:id → @Permissions('sales:leads:delete')

  6. Export PermissionsGuard + Permissions decorator from common/index.ts

  ### Cache invalidation (CRITICAL)
  - In RBAC-002's service methods (assignRole, removeRole, grantAccess, revokeAccess),
    add cache invalidation after every mutation:
    await this.cacheService.del(`perms:${userId}:${orgId}`)
  - Verify this is called in all 4 mutation methods

  ### Constraints
  - Guard must handle missing @Permissions decorator gracefully (not throw)
  - Wildcard logic:
      '*:*:*' → passes everything
      'sales:*:*' → passes any 'sales:...' permission
      exact match → passes only that permission
  - Cache key format EXACTLY: perms:{userId}:{orgId}
  - Cache TTL: 300 seconds
  - Do NOT remove @Roles() decorator or RolesGuard — keep for backward compat
  - PermissionsGuard runs AFTER AccessTokenGuard (order matters in APP_GUARD array)

  ### Tests to write (permissions.guard.spec.ts)
  - No @Permissions decorator → canActivate returns true
  - User with matching permission → canActivate returns true
  - User without permission → ForbiddenException
  - Wildcard 'sales:*:*' → passes 'sales:leads:view_all'
  - '*:*:*' → passes any permission
  - Cache hit: second call doesn't query DB (mock Prisma, verify not called twice)
  - Cache miss: queries DB and stores result
  - Cache invalidation: after assignRole, cache key deleted

  ### Integration test
  - Login as user with frontsell_agent role
  - Call GET /leads → 200 (has sales:leads:view_own)
  - Call DELETE /leads/:id → 403 (lacks sales:leads:delete)

  ### Report back
    ✅ RBAC-003 COMPLETE                                                                                                                       ─    - New files: <list>
    - Controllers migrated: <list>
    - Cache invalidation verified in: <list of methods>
    - Tests: <X passing, Y failing>
    - Deviations: <list or "none">

  ---

  ## SUBAGENT 4 — TEST RUNNER (spawn after all 3 complete)

  Run the following and report results:

  1. TypeScript check (no compile errors):
     cd apps/backend/core-service && npx tsc --noEmit

  2. Prisma validate:
     cd libs/backend/prisma-client && npx prisma validate

  3. Run seed again (idempotency test — should not error):
     npx ts-node libs/backend/prisma-client/prisma/seeds/rbac.seed.ts

  4. Run unit tests:
     npx nx test core-service --testPathPattern="rbac|permissions"

  5. Check for any imports of deleted/renamed symbols:
     grep -r "RolesGuard\|@Roles(" apps/backend/core-service/src --include="*.ts" | grep -v "roles.guard.ts"

  6. Verify cache invalidation is present in all mutation methods:
     grep -n "perms:" apps/backend/core-service/src/modules/rbac/rbac.service.ts
     grep -n "perms:" apps/backend/core-service/src/modules/iam/iam.service.ts

  Report:
    ✅ ALL TESTS PASSED or ❌ FAILURES: <list each failure with file:line>

  ---

  ## Hard Rules — DO NOT VIOLATE

  - READ existing IAM module BEFORE writing any code — it may already have what you need
  - NEVER duplicate UserAppAccess or UserAppRole logic that already exists in iam.service.ts
  - NEVER remove @Roles() or RolesGuard — keep for backward compat, just add new system alongside
  - Cache key format is EXACTLY: perms:{userId}:{orgId} — no variation
  - Permission strings format: {app}:{resource}:{action} — lowercase, colon-separated
  - System roles: organizationId = null (not empty string, not undefined — null)
  - Custom org roles: organizationId = the org's ID
  - Seed must use upsert (not create) — running twice must be safe
  - PermissionsGuard registered as APP_GUARD runs after AccessTokenGuard
  - appCode must be validated: throw 400 for unknown appCodes

  ## Codebase Conventions
  - Response format: { data: T } single, { data: T[], meta: {...} } paginated
  - Guards: @Public() decorator skips JWT guard (already exists)
  - Cache: use CacheService (not raw Redis ioredis) — .get(key), .set(key, value, ttlMs), .del(key)
  - NestJS exceptions: NotFoundException, ForbiddenException, BadRequestException, ConflictException
  - Org context: x-organization-id header → req.user.orgId (from JWT) or OrgContextGuard
  - No console.log in production code — use Logger from @nestjs/common

  ## Start
  Spawn SUBAGENT 1 now. Wait for completion report before spawning SUBAGENT 2.

  ---
  Ek important note: prompt mein READ IAM module first ko bold kiya hai kyunki existing codebase mein IAM module already partial RBAC logic     
  rakhta hai (UserAppAccess, UserAppRole). Agent agar pehle nahi padha to duplicate code likhega. Yeh sab se common mistake hogi.