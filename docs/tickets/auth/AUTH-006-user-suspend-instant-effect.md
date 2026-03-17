# AUTH-006: User Suspend / Unsuspend with Instant Session Invalidation

## Overview
Allow admins to suspend a user account with immediate effect. Suspension revokes all active refresh tokens and adds the userId to a short-lived Redis blacklist so even valid access tokens (still within their 15-minute TTL) are rejected instantly without waiting for expiry.

## Background / Context
Without instant effect, a suspended user's current access token remains valid for up to 15 minutes after suspension. For offboarding or security incidents, this window is unacceptable. Redis blacklist bridges the gap between suspension and access token expiry.

## Acceptance Criteria
- [ ] `User.status` enum has: `INVITED | ACTIVE | SUSPENDED | DEACTIVATED`
- [ ] `PATCH /hrms/users/:userId/suspend` sets status to SUSPENDED, revokes all refresh tokens, adds to Redis blacklist
- [ ] `PATCH /hrms/users/:userId/unsuspend` sets status back to ACTIVE, removes from Redis blacklist
- [ ] JWT auth guard checks Redis blacklist on every request — if userId is blacklisted, returns 401 immediately
- [ ] Suspended user cannot log in (login endpoint checks status before issuing tokens)
- [ ] Suspension creates audit log entry with adminId, reason, and timestamp
- [ ] Unsuspension creates audit log entry
- [ ] Suspended user sees a clear error message: "Your account has been suspended. Contact your administrator."
- [ ] Suspend/unsuspend only allowed within same organization (no cross-org suspension)
- [ ] Platform super-admin can suspend any user

## Technical Specification

### Schema Update

```prisma
// Add to User model in schema.prisma

enum UserStatus {
  INVITED
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

model User {
  // ... existing fields ...
  status          UserStatus  @default(INVITED)
  suspendedAt     DateTime?
  suspendedBy     String?     // userId of admin who suspended
  suspendReason   String?
  deactivatedAt   DateTime?
}
```

### Suspend Endpoint

```typescript
// PATCH /hrms/users/:userId/suspend
// Body: { reason: string }
// Requires: hrms:users:suspend permission

async suspendUser(userId: string, adminId: string, organizationId: string, reason: string) {
  // 1. Validate target user belongs to same org
  const user = await this.prisma.user.findFirst({
    where: { id: userId, organizationId }
  });
  if (!user) throw new NotFoundException('User not found');
  if (user.status === 'SUSPENDED') throw new BadRequestException('User already suspended');
  if (user.id === adminId) throw new BadRequestException('Cannot suspend yourself');

  // 2. Update user status
  await this.prisma.user.update({
    where: { id: userId },
    data: {
      status: 'SUSPENDED',
      suspendedAt: new Date(),
      suspendedBy: adminId,
      suspendReason: reason
    }
  });

  // 3. Revoke all active refresh tokens
  const revoked = await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: 'USER_SUSPENDED'
    }
  });

  // 4. Add to Redis blacklist (TTL = access token TTL = 900s = 15 min)
  // Key: suspended:{userId} → value: "1"
  await this.redis.setex(`suspended:${userId}`, 900, '1');

  // 5. Audit log
  await this.auditService.log({
    action: 'USER_SUSPENDED',
    actorId: adminId,
    targetUserId: userId,
    organizationId,
    metadata: { reason, revokedSessions: revoked.count }
  });

  return { message: 'User suspended and all sessions revoked' };
}
```

### Unsuspend Endpoint

```typescript
// PATCH /hrms/users/:userId/unsuspend
// Requires: hrms:users:suspend permission

async unsuspendUser(userId: string, adminId: string, organizationId: string) {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, organizationId }
  });
  if (!user) throw new NotFoundException('User not found');
  if (user.status !== 'SUSPENDED') throw new BadRequestException('User is not suspended');

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      status: 'ACTIVE',
      suspendedAt: null,
      suspendedBy: null,
      suspendReason: null
    }
  });

  // Remove from blacklist
  await this.redis.del(`suspended:${userId}`);

  await this.auditService.log({
    action: 'USER_UNSUSPENDED',
    actorId: adminId,
    targetUserId: userId,
    organizationId,
    metadata: {}
  });

  return { message: 'User unsuspended' };
}
```

### JWT Auth Guard Update

```typescript
// In the global JWT auth guard (core-service), add blacklist check:

async canActivate(context: ExecutionContext): Promise<boolean> {
  // ... existing JWT validation ...

  const payload = this.jwtService.verify(token);
  const userId = payload.sub;

  // Check Redis blacklist (fast O(1) check)
  const isSuspended = await this.redis.get(`suspended:${userId}`);
  if (isSuspended) {
    throw new UnauthorizedException({
      code: 'ACCOUNT_SUSPENDED',
      message: 'Your account has been suspended. Contact your administrator.'
    });
  }

  // Check DB status for longer-term suspension (after 15 min blacklist expires)
  // Only do DB check if Redis key is NOT set (Redis expired but user still suspended)
  // This avoids DB hit on every request — only fallback
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { status: true }
  });
  if (user?.status === 'SUSPENDED' || user?.status === 'DEACTIVATED') {
    // Refresh the Redis blacklist (re-add with another 900s)
    await this.redis.setex(`suspended:${userId}`, 900, '1');
    throw new UnauthorizedException({
      code: 'ACCOUNT_SUSPENDED',
      message: 'Your account has been suspended. Contact your administrator.'
    });
  }

  return true;
}
```

**Performance note:** The DB fallback check runs only when Redis key is absent (after 15 min). For all requests within 15 min of suspension, it's a fast Redis GET. Add caching of user status in Redis for 5 minutes to avoid DB hit on every request beyond the blacklist window:

```typescript
// Cache user status check result (5 min TTL)
const cachedStatus = await this.redis.get(`user_status:${userId}`);
if (cachedStatus === 'SUSPENDED' || cachedStatus === 'DEACTIVATED') {
  throw new UnauthorizedException({ code: 'ACCOUNT_SUSPENDED', ... });
}
if (!cachedStatus) {
  const user = await this.prisma.user.findUnique(...);
  await this.redis.setex(`user_status:${userId}`, 300, user.status);
  // ... check and throw if suspended
}
```

### Login Block for Suspended Users

```typescript
// auth.service.ts login() — add before token issuance:
if (user.status === 'SUSPENDED') {
  throw new UnauthorizedException({
    code: 'ACCOUNT_SUSPENDED',
    message: 'Your account has been suspended. Contact your administrator.'
  });
}
if (user.status === 'DEACTIVATED') {
  throw new UnauthorizedException({
    code: 'ACCOUNT_DEACTIVATED',
    message: 'This account has been deactivated.'
  });
}
```

### Frontend Error Handling

```typescript
// In the Axios response interceptor (both dashboards):
// If error response has code: 'ACCOUNT_SUSPENDED', show dedicated message, don't just redirect to login:

if (error.response?.data?.code === 'ACCOUNT_SUSPENDED') {
  clearTokens();
  window.location.href = '/auth/suspended'; // or show modal
  return Promise.reject(error);
}
```

```typescript
// apps/frontend/sales-dashboard/src/app/auth/suspended/page.tsx
// Shows: "Your account has been suspended. Please contact your administrator."
// No retry button — just contact info / logout confirmation
```

## Testing Requirements

### Unit Tests
- `suspendUser()` throws if user is in different org
- `suspendUser()` throws if userId === adminId (self-suspend prevention)
- `suspendUser()` throws if user already suspended
- `suspendUser()` revokes all refresh tokens and sets Redis key
- `unsuspendUser()` throws if user is not suspended
- `unsuspendUser()` clears Redis key
- JWT guard returns 401 when Redis blacklist key exists
- JWT guard falls back to DB check after blacklist TTL expires

### Integration Tests
- Suspend user → user's next API call returns 401 within 1 second (not after 15 min)
- Suspend user → user tries to log in → blocked
- Unsuspend user → user can log in again
- Admin suspending cross-org user → 404 (user not found in their org)
- After suspension + 16 minutes (blacklist expired), user still blocked via DB check

### Edge Cases
- Suspend user who has 0 active sessions → still updates status (future login blocked)
- Suspend user with many sessions (100+) → updateMany handles it, no timeout
- Suspend and immediately unsuspend → Redis key deleted, user can log in
- Multiple admins suspending same user simultaneously → idempotent (second call throws BadRequestException)
