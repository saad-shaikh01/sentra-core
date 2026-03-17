# AUTH-001: Replace Single RefreshToken Field with Session Table

## Overview
Replace the single `refreshToken` nullable field on the `User` model with a dedicated `RefreshToken` table. This is the foundational fix that enables multi-device sessions, per-session logout, admin session visibility, and reuse detection.

## Background / Context
Currently `User.refreshToken` stores one token per user account. Any login or refresh overwrites it. This means:
- Logging out on one device logs out all devices
- Refreshing in one tab invalidates the other tab's token
- Sales and PM dashboards (separate browser origins) cannot both stay logged in simultaneously
- There is no audit trail of active sessions

This ticket lays the DB and service foundation. All subsequent auth tickets (AUTH-002 through AUTH-006) depend on this.

## Acceptance Criteria
- [ ] `RefreshToken` table exists in Prisma schema with all required fields
- [ ] `User.refreshToken` field removed from schema
- [ ] `auth.service.ts` login creates a new `RefreshToken` row instead of updating User
- [ ] `auth.service.ts` refresh reads from `RefreshToken` table by jti, validates hash
- [ ] `auth.service.ts` logout revokes only the calling session (sets `revokedAt`)
- [ ] Old tokens with `revokedAt != null` or `expiresAt < now` are rejected
- [ ] JWT `jti` claim is set to `RefreshToken.id` on every issued token pair
- [ ] Prisma migration runs cleanly without data loss on existing users
- [ ] All existing auth tests pass after refactor

## Technical Specification

### Database Schema

```prisma
// libs/backend/prisma-client/prisma/schema.prisma

model RefreshToken {
  id             String    @id @default(cuid())   // used as jti
  userId         String
  organizationId String?                           // null for platform-level users
  appCode        String                            // "SALES" | "PM" | "HRMS" | "ADMIN" | "COMM"
  tokenHash      String                            // SHA-256 of the raw token, never store plain
  deviceInfo     Json?                             // { userAgent: string, os: string, browser: string, deviceType: string }
  ipAddress      String?
  lastUsedAt     DateTime?
  expiresAt      DateTime
  revokedAt      DateTime?
  revokedReason  String?                           // "LOGOUT" | "USER_SUSPENDED" | "ADMIN_REVOKED" | "REUSE_DETECTED" | "PASSWORD_CHANGED"
  familyId       String                            // groups tokens from the same login session for reuse detection
  createdAt      DateTime  @default(now())

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
}

// On User model: REMOVE the field below
// refreshToken  String?   ← DELETE THIS FIELD
```

### Token Hashing
```typescript
// Use SHA-256, not bcrypt — refresh tokens are long random strings, no need for slow hash
import { createHash } from 'crypto';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
```

### JWT Payload Update
```typescript
// access token payload
interface AccessTokenPayload {
  sub: string;          // userId
  organizationId: string;
  appCode: string;
  role: string;         // legacy, kept for backward compat during migration
  jti: string;          // = RefreshToken.id of the corresponding refresh token
  iat: number;
  exp: number;
}

// refresh token payload
interface RefreshTokenPayload {
  sub: string;          // userId
  jti: string;          // = RefreshToken.id
  familyId: string;
  iat: number;
  exp: number;
}
```

### auth.service.ts Changes

#### login()
```typescript
async login(userId: string, organizationId: string, appCode: string, deviceInfo: object, ip: string) {
  const familyId = randomUUID(); // new family per login
  const jti = cuid();

  const rawRefreshToken = this.jwtService.sign(
    { sub: userId, jti, familyId },
    { secret: process.env.JWT_REFRESH_SECRET, expiresIn: 604800 } // 7 days
  );

  await this.prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      organizationId,
      appCode,
      tokenHash: hashToken(rawRefreshToken),
      deviceInfo,
      ipAddress: ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      familyId,
    }
  });

  const accessToken = this.jwtService.sign(
    { sub: userId, organizationId, appCode, role: user.role, jti },
    { secret: process.env.JWT_SECRET, expiresIn: 900 }
  );

  return { accessToken, refreshToken: rawRefreshToken };
}
```

#### refresh()
```typescript
async refresh(rawRefreshToken: string, ip: string) {
  // 1. Decode without verification to get jti
  const decoded = this.jwtService.decode(rawRefreshToken) as RefreshTokenPayload;
  if (!decoded?.jti) throw new UnauthorizedException('Invalid token');

  // 2. Load from DB
  const storedToken = await this.prisma.refreshToken.findUnique({ where: { id: decoded.jti } });
  if (!storedToken) throw new UnauthorizedException('Session not found');

  // 3. Check revocation
  if (storedToken.revokedAt) throw new UnauthorizedException('Session revoked');

  // 4. Check expiry
  if (storedToken.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

  // 5. Verify hash matches (prevents token substitution)
  if (storedToken.tokenHash !== hashToken(rawRefreshToken)) {
    throw new UnauthorizedException('Token mismatch');
  }

  // 6. Verify JWT signature
  this.jwtService.verify(rawRefreshToken, { secret: process.env.JWT_REFRESH_SECRET });

  // 7. Revoke old token
  await this.prisma.refreshToken.update({
    where: { id: decoded.jti },
    data: { revokedAt: new Date(), revokedReason: 'ROTATED' }
  });

  // 8. Issue new token pair (same familyId)
  return this.issueTokenPair(storedToken.userId, storedToken.organizationId, storedToken.appCode, storedToken.deviceInfo, ip, storedToken.familyId);
}
```

#### logout()
```typescript
async logout(jti: string) {
  // Revoke only this specific session — other devices unaffected
  await this.prisma.refreshToken.updateMany({
    where: { id: jti, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'LOGOUT' }
  });
}
```

### Migration
```sql
-- Migration must:
-- 1. Add RefreshToken table
-- 2. Migrate existing users with non-null refreshToken to RefreshToken rows (best effort, expires in 7 days)
-- 3. Remove User.refreshToken column
```

## Testing Requirements

### Unit Tests (auth.service.spec.ts)
- `login()` creates a RefreshToken row with correct hash and familyId
- `refresh()` rejects a revoked token
- `refresh()` rejects an expired token
- `refresh()` rejects a token with wrong hash
- `refresh()` revokes old token and creates new one with same familyId
- `logout()` sets revokedAt only on the specified jti, does not affect other rows for same user

### Integration Tests
- Full login → refresh → logout flow
- Two concurrent logins for same user produce two independent RefreshToken rows
- Logout on session A does not invalidate session B

### Edge Cases
- Token decoded successfully but not found in DB → 401
- Token found but hash mismatch → 401 (do not reveal reason to client)
- Database down during refresh → 503, do not issue new token
- `familyId` must not change across rotation chain

## Notes
- Never log or return raw refresh tokens in error responses
- `deviceInfo` should be parsed from `User-Agent` header using a parser library (e.g., `ua-parser-js`)
- `appCode` must be validated against a fixed enum — reject unknown app codes
