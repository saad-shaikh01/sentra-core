 You are implementing the Auth Overhaul for a NestJS + Next.js multi-tenant SaaS application.
  Read every ticket carefully before writing any code. Follow the execution order exactly.

  ## Your Task
  Implement auth tickets in this exact order:
  1. AUTH-001 → 2. AUTH-002 → 3. AUTH-006 → 4. AUTH-005 → 5. AUTH-003 → 6. AUTH-FE-001

  All ticket files are in: docs/tickets/auth/

  Read ALL 7 ticket files before starting. They contain exact schema, service logic,
  API signatures, and testing requirements.

  ## Codebase Context

  ### Backend: core-service
  - Location: apps/backend/core-service/src/
  - Auth files: src/modules/auth/ (auth.service.ts, auth.controller.ts, jwt.strategy.ts,
    jwt-refresh.strategy.ts, roles.guard.ts)
  - Prisma schema: libs/backend/prisma-client/prisma/schema.prisma
  - Cache module: look at existing cache.module.ts for Redis pattern
  - Audit module: AuditModule is @Global() — AuditService is injectable directly

  ### Frontend: Sales Dashboard + PM Dashboard
  - Sales: apps/frontend/sales-dashboard/src/
  - PM: apps/frontend/pm-dashboard/src/
  - Auth interceptors: look at src/lib/api.ts in each app
  - Token storage: look at existing localStorage usage (accessToken, refreshToken keys)

  ## Step-by-Step Execution

  ### STEP 1 — AUTH-001 (Session Table)
  1. Read docs/tickets/auth/AUTH-001-session-table.md fully
  2. Add RefreshToken model to libs/backend/prisma-client/prisma/schema.prisma
  3. REMOVE the refreshToken field from User model
  4. Run: cd libs/backend/prisma-client && npx prisma migrate dev --name auth-session-table
  5. Update auth.service.ts: login(), refresh(), logout() per ticket spec
  6. Add hashToken() helper using Node.js crypto SHA-256 (not bcrypt)
  7. Add jti to JWT payload in both access and refresh tokens
  8. Install ua-parser-js: npm install ua-parser-js @types/ua-parser-js
  9. Run existing auth tests — fix any failures before moving to next ticket

  ### STEP 2 — AUTH-002 (Reuse Detection + Multi-Device)
  1. Read docs/tickets/auth/AUTH-002-token-rotation-reuse-detection.md
  2. Add reuse detection block in refresh() — if revokedReason === 'ROTATED' revoke entire family
  3. Update logout() to revoke only current jti (not all sessions)
  4. Add POST /auth/logout-all endpoint
  5. Add lastUsedAt update on successful refresh
  6. Add deviceInfo parsing using ua-parser-js on login and refresh
  7. Write tests for token theft scenario described in ticket

  ### STEP 3 — AUTH-006 (User Suspend)
  1. Read docs/tickets/auth/AUTH-006-user-suspend-instant-effect.md
  2. Add UserStatus enum and status/suspendedAt/suspendedBy/suspendReason fields to User model
  3. Run: npx prisma migrate dev --name user-status-suspend-fields
  4. Add suspend/unsuspend methods to auth.service.ts
  5. Add PATCH /auth/users/:userId/suspend and /unsuspend endpoints
  6. Update JWT auth guard to check Redis blacklist (suspended:{userId})
  7. Update login() to block SUSPENDED and DEACTIVATED users with correct error codes
  8. Test: suspend → immediate 401 on next request (within 15 min blacklist window)

  ### STEP 4 — AUTH-005 (Admin Session Visibility)
  1. Read docs/tickets/auth/AUTH-005-admin-session-visibility.md
  2. Add GET /admin/users/:userId/sessions endpoint
  3. Add DELETE /admin/users/:userId/sessions/:sessionId endpoint
  4. Add DELETE /admin/users/:userId/sessions (revoke all) endpoint
  5. Validate that admin can only see sessions of users in their own organization
  6. Each revocation must create audit log entry

  ### STEP 5 — AUTH-003 (Client-Side Single-Flight — FRONTEND)
  1. Read docs/tickets/auth/AUTH-003-client-side-single-flight-refresh.md
  2. Create refresh-mutex.ts in BOTH:
     - apps/frontend/sales-dashboard/src/lib/refresh-mutex.ts
     - apps/frontend/pm-dashboard/src/lib/refresh-mutex.ts
  3. Create tokens.ts helper in both apps
  4. Replace the existing 401 interceptor in both apps' api.ts files
  5. Do NOT touch any other frontend logic
  6. Test: verify only one /auth/refresh fires when multiple requests 401 simultaneously

  ### STEP 6 — AUTH-FE-001 (Auth UI — FRONTEND)
  1. Read docs/tickets/auth/AUTH-FE-001-login-logout-ui.md
  2. Update/create login pages in both sales-dashboard and pm-dashboard
  3. Create forgot-password and reset-password pages
  4. Create /auth/suspended page
  5. Create /auth/select-app page (fetches /auth/my-apps)
  6. Add "My Sessions" modal to user avatar dropdown in both dashboards
  7. Add GET /auth/my-sessions, DELETE /auth/sessions/:id, DELETE /auth/sessions/others
     to auth.controller.ts (backend)
  8. Add GET /auth/my-apps to auth.controller.ts (returns user's accessible apps + roles)

  ## Hard Rules — Do NOT violate these
  - NEVER store raw refresh tokens — always SHA-256 hash before saving to DB
  - NEVER log raw tokens in console or error responses
  - jti in JWT payload must always equal RefreshToken.id in DB
  - familyId must never change during a rotation chain (only fresh login creates new familyId)
  - Redis blacklist key format: suspended:{userId} (TTL: 900 seconds)
  - Permission cache key format: perms:{userId}:{orgId} (TTL: 300 seconds)
  - Logout = revoke ONE session. Logout-all = revoke ALL sessions for userId.
  - appCode must be validated against enum: "SALES" | "PM" | "HRMS" | "ADMIN" | "COMM"
  - Do not skip writing tests — each ticket has a Testing Requirements section, implement them

  ## Conventions in This Codebase
  - API responses: { data: T } for single, { data: T[], meta: { total, page, limit, pages } } for lists
  - Guards: JwtAuthGuard globally registered, OrgContextGuard per module
  - Org context: x-organization-id and x-user-id headers → req.orgContext
  - Cache: use existing CacheService pattern (not raw Redis) unless ticket specifies Redis directly
  - Errors: use NestJS built-in exceptions (NotFoundException, UnauthorizedException, etc.)
  - Frontend: React Query for all data fetching, Axios for HTTP, shadcn/ui components
  - Frontend errors: always show toast for mutations, inline error for forms

  ## After Each Ticket
  - Run: npx prisma migrate status (ensure no pending migrations)
  - Run existing test suite for auth module
  - Confirm no TypeScript errors: npx tsc --noEmit in core-service
  - Commit with message: "feat: AUTH-00X - <ticket title>"

  Start with STEP 1. Do not jump ahead. Report back after each step is complete.