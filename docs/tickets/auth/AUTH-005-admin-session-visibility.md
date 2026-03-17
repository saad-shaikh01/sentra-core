# AUTH-005: Admin Session Visibility and Remote Session Revocation

## Overview
Give org admins (and platform super-admins) visibility into active sessions per user, with the ability to revoke individual sessions or all sessions for a user. This is exposed via API and displayed in the user management UI.

## Background / Context
Currently there is no way for an admin to see where a user is logged in or force-logout a user. This is needed for:
- Security incidents (suspicious login from unknown IP)
- Offboarding (ensure ex-employee access is revoked)
- Compliance / audit purposes

## Acceptance Criteria
- [ ] `GET /admin/users/:userId/sessions` returns all active sessions with device info, app, last active, IP
- [ ] `DELETE /admin/users/:userId/sessions/:sessionId` revokes a specific session
- [ ] `DELETE /admin/users/:userId/sessions` revokes ALL sessions for a user
- [ ] Both endpoints require admin-level permission (`hrms:users:manage_sessions` or `platform:admin`)
- [ ] Revocation creates an audit log entry with adminId and reason
- [ ] Revoked sessions appear in the list with `revokedAt` and are filtered out of "active" count
- [ ] Frontend (HRMS dashboard, user detail page) shows session list with revoke buttons
- [ ] Session list is paginated (default limit 20)

## Technical Specification

### API Endpoints

```typescript
// GET /admin/users/:userId/sessions
// Query: ?status=active|all (default: active)
// Returns: paginated list of sessions

interface SessionDto {
  id: string;                    // jti
  appCode: string;               // "SALES" | "PM" | "HRMS"
  appLabel: string;              // "Sales Dashboard" | "PM Dashboard" | "HRMS"
  deviceInfo: {
    browser: string;             // "Chrome"
    browserVersion: string;      // "121.0"
    os: string;                  // "Windows"
    deviceType: string;          // "desktop" | "mobile" | "tablet"
  };
  ipAddress: string;
  lastUsedAt: string | null;     // ISO date
  createdAt: string;             // ISO date (login time)
  expiresAt: string;             // ISO date
  revokedAt: string | null;
  revokedReason: string | null;
  isActive: boolean;             // !revokedAt && expiresAt > now
}

interface SessionsResponse {
  data: SessionDto[];
  meta: {
    total: number;
    active: number;              // count of non-revoked, non-expired
    page: number;
    limit: number;
    pages: number;
  };
}
```

```typescript
// admin-sessions.controller.ts

@Controller('admin/users/:userId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminSessionsController {

  @Get('sessions')
  @Permissions('hrms:users:manage_sessions')
  async getSessions(
    @Param('userId') userId: string,
    @Query('status') status: 'active' | 'all' = 'active',
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @OrgContext() { organizationId }: OrgContextDto
  ): Promise<SessionsResponse> {
    return this.sessionsService.getUserSessions(userId, organizationId, status, page, limit);
  }

  @Delete('sessions/:sessionId')
  @Permissions('hrms:users:manage_sessions')
  async revokeSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
    @OrgContext() ctx: OrgContextDto
  ) {
    await this.sessionsService.revokeSession(sessionId, userId, ctx.userId, body.reason);
    return { message: 'Session revoked' };
  }

  @Delete('sessions')
  @Permissions('hrms:users:manage_sessions')
  async revokeAllSessions(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
    @OrgContext() ctx: OrgContextDto
  ) {
    const result = await this.sessionsService.revokeAllUserSessions(userId, ctx.userId, body.reason);
    return { message: `${result.count} sessions revoked` };
  }
}
```

```typescript
// sessions.service.ts

async revokeSession(sessionId: string, userId: string, adminId: string, reason?: string) {
  const session = await this.prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
  if (session.revokedAt) throw new BadRequestException('Session already revoked');

  await this.prisma.refreshToken.update({
    where: { id: sessionId },
    data: {
      revokedAt: new Date(),
      revokedReason: 'ADMIN_REVOKED'
    }
  });

  await this.auditService.log({
    action: 'ADMIN_SESSION_REVOKED',
    actorId: adminId,
    targetUserId: userId,
    metadata: { sessionId, reason: reason || 'Admin revoked' }
  });
}

async revokeAllUserSessions(userId: string, adminId: string, reason?: string) {
  const result = await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: 'ADMIN_REVOKED'
    }
  });

  await this.auditService.log({
    action: 'ADMIN_ALL_SESSIONS_REVOKED',
    actorId: adminId,
    targetUserId: userId,
    metadata: { count: result.count, reason: reason || 'Admin revoked all' }
  });

  return { count: result.count };
}
```

### Frontend: Sessions Panel (User Detail Page in HRMS)

```
┌─────────────────────────────────────────────────────────────────┐
│  Active Sessions (3)                        [Revoke All Sessions]│
├──────────────────┬──────────┬──────────────┬────────────────────┤
│  Device          │  App     │  Last Active │  IP          │      │
├──────────────────┼──────────┼──────────────┼──────────────┼──────┤
│ Chrome / Windows │  Sales   │  2 mins ago  │ 192.168.1.10 │ [✕] │
│ Safari / iPhone  │  Sales   │  3 hours ago │ 203.45.67.89 │ [✕] │
│ Chrome / Mac     │  PM      │  1 day ago   │ 192.168.1.11 │ [✕] │
└──────────────────┴──────────┴──────────────┴──────────────┴──────┘
```

UX Details:
- "Revoke All Sessions" button shows confirmation dialog: "This will immediately log out [User Name] from all devices. Continue?"
- Individual [✕] revoke button shows inline confirmation tooltip: "Revoke this session?"
- After revocation, the row shows "Revoked" badge with timestamp instead of disappearing immediately
- `lastUsedAt` shows relative time (e.g., "2 mins ago") with full timestamp on hover
- Sessions are sorted: active first, then by lastUsedAt descending
- "No active sessions" empty state if user has no sessions

## Testing Requirements

### Unit Tests
- `getUserSessions()` with `status=active` filters out revoked and expired tokens
- `getUserSessions()` with `status=all` returns all tokens including revoked
- `revokeSession()` throws NotFoundException if sessionId belongs to different user
- `revokeSession()` throws BadRequestException if already revoked
- `revokeAllUserSessions()` returns correct count

### Integration Tests
- Admin can see sessions of users in their organization only (not cross-org)
- Platform super admin can see any user's sessions
- After revoking a session, the corresponding refresh token returns 401 when used
- After revoking all sessions, all refresh tokens for user return 401

### Security Tests
- Admin of Org A cannot revoke sessions of user in Org B
- Regular user cannot access /admin/users endpoints (403)
- Revoked session ID cannot be double-revoked (idempotent or error, not silent wrong state)

### Edge Cases
- `lastUsedAt` is null for sessions that were never used to refresh (fresh login, not yet refreshed)
- Expired sessions (expiresAt < now, not revoked) should show as "expired" in the list, not "active"
- Pagination: 0 sessions → empty array, not 404
