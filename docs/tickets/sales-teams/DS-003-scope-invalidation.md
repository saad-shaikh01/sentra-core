# DS-003: Scope Invalidation (Redis Cache-Busting)

## Priority: P0 (data correctness)
## Estimate: 2-3 hours
## Depends On: DS-002

---

## Summary
Ensure that when team membership, team-brand mapping, or team settings change, the affected users' cached scopes are invalidated immediately. Without this, users would see stale data for up to 15 minutes.

---

## Implementation Details

### Invalidation Triggers

| Event | Who to Invalidate | Where to Hook |
|-------|-------------------|---------------|
| User added to team | That user | TeamsService (HRMS) |
| User removed from team | That user | TeamsService (HRMS) |
| Team manager changed | Old manager + new manager | TeamsService (HRMS) |
| Brand assigned to team | All team members + manager | TeamBrandService (DS-009) |
| Brand unassigned from team | All team members + manager | TeamBrandService (DS-009) |
| Team.allowMemberVisibility changed | All team members + manager | TeamsService (HRMS) |
| Team deleted/deactivated | All team members + manager | TeamsService (HRMS) |
| User role changed | That user | RBAC service |

### 1. Add Invalidation Hook to Core-Service

Since HRMS manages teams, we need a way for HRMS team changes to trigger scope invalidation in core-service. Two approaches:

**Option A (Recommended): Internal HTTP webhook**
HRMS calls core-service on team changes.

```typescript
// apps/backend/core-service/src/modules/scope/scope.controller.ts
@Controller('internal/scope')
export class ScopeController {
  constructor(private scopeService: ScopeService) {}

  @Post('invalidate/user')
  @UseGuards(InternalServiceGuard)  // verify INTERNAL_SERVICE_SECRET
  async invalidateUser(@Body() body: { userId: string; orgId: string }) {
    await this.scopeService.invalidateUser(body.userId, body.orgId);
    return { ok: true };
  }

  @Post('invalidate/team')
  @UseGuards(InternalServiceGuard)
  async invalidateTeam(@Body() body: { teamId: string; orgId: string }) {
    await this.scopeService.invalidateTeam(body.teamId, body.orgId);
    return { ok: true };
  }
}
```

**Option B: Shared Redis pub/sub**
HRMS publishes event, core-service subscribes. More complex, overkill for M1.

### 2. HRMS-Side: Fire Invalidation on Team Changes

```typescript
// apps/backend/hrms-service/src/modules/teams/teams.service.ts
// After any team mutation (addMember, removeMember, updateManager, etc.)

private async notifyScopeInvalidation(type: 'user' | 'team', payload: any) {
  const coreUrl = this.configService.get('CORE_SERVICE_URL') || 'http://localhost:3001';
  const secret = this.configService.get('INTERNAL_SERVICE_SECRET');
  try {
    await this.httpService.axiosRef.post(
      `${coreUrl}/api/internal/scope/invalidate/${type}`,
      payload,
      { headers: { 'x-internal-secret': secret }, timeout: 3000 },
    );
  } catch (err) {
    // Log warning but don't fail the team operation — worst case scope is stale for 15 min
    this.logger.warn(`Scope invalidation failed: ${err.message}`);
  }
}
```

Hook into existing team mutations:
- `addMember()` → `notifyScopeInvalidation('user', { userId, orgId })`
- `removeMember()` → `notifyScopeInvalidation('user', { userId, orgId })`
- `updateTeam()` (if manager changes) → `notifyScopeInvalidation('team', { teamId, orgId })`
- `deleteTeam()` → `notifyScopeInvalidation('team', { teamId, orgId })`

### 3. Core-Service Internal: Direct Invalidation

For changes happening inside core-service (TeamBrand CRUD, role changes):

```typescript
// In TeamBrandService (DS-009)
async assignBrand(teamId: string, brandId: string, orgId: string) {
  const result = await this.prisma.teamBrand.create({ ... });
  await this.scopeService.invalidateTeam(teamId, orgId);
  return result;
}

// In RBAC service — after role change
async updateUserRole(userId: string, newRole: UserRole, orgId: string) {
  // ... existing role update logic ...
  await this.scopeService.invalidateUser(userId, orgId);
}
```

### 4. InternalServiceGuard

```typescript
// apps/backend/core-service/src/common/guards/internal-service.guard.ts
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-internal-secret'];
    const expected = this.config.get('INTERNAL_SERVICE_SECRET');
    if (!expected || !secret || secret !== expected) {
      throw new UnauthorizedException('Invalid internal service secret');
    }
    return true;
  }
}
```

---

## Expected Behavior

1. User added to a team → their scope cache is deleted → next API call recomputes scope with new team
2. Brand assigned to team → all team members' scopes cleared → they see new brand's data on next request
3. Team manager changed → old and new manager scopes cleared
4. HRMS service down → scope invalidation webhook fails silently → scope auto-expires in 15 min (degraded but safe)
5. Core-service internal changes (TeamBrand) → direct invalidation, no HTTP call

---

## Edge Cases

- **HRMS can't reach core-service**: Webhook fails, logged as warning, team operation succeeds. User sees stale scope for up to 15 min. Acceptable trade-off.
- **Bulk team operation (e.g., import 50 members)**: Each add triggers invalidation. Consider batching if performance is an issue — for now, individual invalidation is fine (50 Redis DEL operations < 10ms).
- **Race condition: user request in-flight during invalidation**: User gets old scope for that request. Next request gets fresh scope. Acceptable — not a security hole since scope is additive (worst case: user sees slightly more than they should for one request).
- **Redis down**: Invalidation DEL fails → no-op. Next request can't read cache either → recomputes from DB. System self-heals.

---

## Testing Checklist

- [ ] **Integration: Webhook endpoint** — POST /internal/scope/invalidate/user clears cache
- [ ] **Integration: Webhook endpoint** — POST /internal/scope/invalidate/team clears all members
- [ ] **Integration: InternalServiceGuard** — rejects missing/wrong secret
- [ ] **Integration: InternalServiceGuard** — accepts correct secret
- [ ] **E2E: Add user to team** → user's scope refreshed on next request
- [ ] **E2E: Assign brand to team** → all members see new brand's data
- [ ] **E2E: Change team manager** → old manager loses team scope, new manager gains it
- [ ] **Edge: HRMS webhook fails** — team operation still succeeds, log warning
- [ ] **Edge: Redis down** — invalidation no-ops, next request recomputes

---

## Files Created/Modified

- `apps/backend/core-service/src/modules/scope/scope.controller.ts` (NEW)
- `apps/backend/core-service/src/common/guards/internal-service.guard.ts` (NEW or update existing)
- `apps/backend/core-service/src/modules/scope/scope.module.ts` (add controller)
- `apps/backend/hrms-service/src/modules/teams/teams.service.ts` (add webhook calls)
- `apps/backend/core-service/src/modules/rbac/rbac.service.ts` (add invalidation after role change)

---

## Env Vars Required

- `INTERNAL_SERVICE_SECRET` — shared secret between HRMS and core-service (already in .env)
- `CORE_SERVICE_URL` — HRMS needs to know core-service URL (already in .env: `http://localhost:3001`)
