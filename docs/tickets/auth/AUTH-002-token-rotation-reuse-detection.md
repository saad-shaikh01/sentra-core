# AUTH-002: Token Rotation + Reuse Detection + Multi-Device Logout Control

## Overview
Build on AUTH-001 to add token reuse detection (stolen token protection), proper per-device logout, and a "logout all devices" option. If an already-rotated refresh token is presented again, it indicates token theft — the entire token family must be revoked.

## Background / Context
With the session table in place, the rotation logic needs hardening:
- Rotation is already done in AUTH-001, but reuse detection is not yet implemented
- A stolen refresh token (e.g., copied from localStorage) could be used after rotation — currently this would succeed because the old token check is basic
- Logout should only revoke the calling session, not all sessions
- A "logout from all devices" option should revoke all sessions for the user

## Acceptance Criteria
- [ ] If a refresh token is presented that was already rotated (`revokedReason = 'ROTATED'`), the entire `familyId` group is revoked and a 401 is returned
- [ ] Logout endpoint revokes only the current session (identified by jti from access token)
- [ ] `POST /auth/logout-all` revokes all active RefreshToken rows for the user across all apps
- [ ] Admin-initiated revoke all (AUTH-005) uses same logic as logout-all
- [ ] `deviceInfo` is parsed from User-Agent on every login and stored on the RefreshToken row
- [ ] `lastUsedAt` is updated on every successful refresh

## Technical Specification

### Reuse Detection in refresh()
Add this block after step 3 (check revocation) in AUTH-001's refresh():

```typescript
// If token is found but already rotated → REUSE DETECTED → revoke entire family
if (storedToken.revokedAt && storedToken.revokedReason === 'ROTATED') {
  await this.prisma.refreshToken.updateMany({
    where: {
      familyId: storedToken.familyId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'REUSE_DETECTED'
    }
  });

  // Audit log the reuse event
  await this.auditService.log({
    action: 'REFRESH_TOKEN_REUSE_DETECTED',
    userId: storedToken.userId,
    metadata: {
      familyId: storedToken.familyId,
      tokenId: storedToken.id,
      ip: currentIp
    }
  });

  throw new UnauthorizedException('Security event: session invalidated');
}
```

### Logout (single session)
```typescript
// auth.controller.ts: POST /auth/logout
// The jti is extracted from the CURRENT access token in the Authorization header

async logout(req: Request) {
  const jti = req.user.jti; // from JWT payload (set in AUTH-001)
  await this.authService.logout(jti);
  return { message: 'Logged out successfully' };
}
```

### Logout All Devices
```typescript
// auth.controller.ts: POST /auth/logout-all
async logoutAll(req: Request) {
  const userId = req.user.sub;
  await this.authService.logoutAllSessions(userId);
  return { message: 'All sessions revoked' };
}

// auth.service.ts
async logoutAllSessions(userId: string, reason: string = 'LOGOUT') {
  const result = await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  });
  return { revokedCount: result.count };
}
```

### Update lastUsedAt on Refresh
```typescript
// In refresh(), after successful validation, before issuing new token:
await this.prisma.refreshToken.update({
  where: { id: decoded.jti },
  data: { lastUsedAt: new Date() }
});
```

### Device Info Parsing
```typescript
// Install: npm install ua-parser-js @types/ua-parser-js
import { UAParser } from 'ua-parser-js';

function parseDeviceInfo(userAgentString: string): object {
  const parser = new UAParser(userAgentString);
  return {
    browser: parser.getBrowser().name,     // "Chrome"
    browserVersion: parser.getBrowser().version, // "121.0"
    os: parser.getOS().name,               // "Windows"
    osVersion: parser.getOS().version,     // "10"
    deviceType: parser.getDevice().type || 'desktop', // "mobile" | "tablet" | "desktop"
    userAgent: userAgentString.substring(0, 200) // truncate for storage
  };
}
```

### API Endpoints Summary
```
POST /auth/logout         → revoke current session only (requires valid access token)
POST /auth/logout-all     → revoke all sessions for user (requires valid access token)
```

## Testing Requirements

### Unit Tests
- Reuse of a rotated token revokes entire family, not just the presented token
- Reuse detection creates an audit log entry
- `logout()` only sets revokedAt on the jti from the access token, not other sessions
- `logoutAll()` sets revokedAt on all non-revoked rows for the userId
- `lastUsedAt` is updated on successful refresh

### Integration / Scenario Tests
**Scenario: Token theft simulation**
1. User logs in → gets refresh token RT1 (familyId: F1)
2. RT1 is used → gets RT2 (RT1 marked ROTATED, same familyId F1)
3. Attacker presents old RT1 again
4. Expected: entire family F1 revoked → RT2 also revoked → user must re-login

**Scenario: Multi-device independent sessions**
1. User logs in on laptop → session S1
2. User logs in on phone → session S2
3. User logs out on laptop → only S1 revoked
4. Phone refresh still works with S2's token

**Scenario: Logout all**
1. User has 3 active sessions
2. Calls POST /auth/logout-all
3. All 3 sessions revoked
4. Each session's next refresh returns 401

### Edge Cases
- `logoutAll()` called when user has no active sessions → succeeds silently (0 rows updated is OK)
- Reuse detection on a non-ROTATED revoked token (e.g., LOGOUT) → just return 401, do not revoke family (only ROTATED tokens indicate potential theft)
- `familyId` must never be null in DB — if null somehow, log error and reject
