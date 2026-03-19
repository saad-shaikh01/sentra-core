# DS-002: ScopeService + UserScope Class

## Priority: P0 (core of data scope system)
## Estimate: 4-5 hours
## Depends On: DS-001

---

## Summary
Build the `ScopeService` that computes a `UserScope` object per user, caches it in Redis (15 min TTL), and provides `toXxxFilter()` methods that generate Prisma `WHERE` clauses for leads, clients, sales, and invoices.

---

## Implementation Details

### 1. File Structure

```
apps/backend/core-service/src/modules/scope/
├── scope.module.ts
├── scope.service.ts
├── user-scope.class.ts
└── scope.types.ts
```

### 2. scope.types.ts

```typescript
export interface ScopeData {
  userId: string;
  orgId: string;
  role: UserRole;
  teamIds: string[];           // teams user belongs to (as member or manager)
  managedTeamIds: string[];    // teams user manages
  brandIds: string[];          // brands accessible via teams (resolved from TeamBrand)
  memberVisibleTeamIds: string[]; // teams with allowMemberVisibility=true
}

export interface LeadFilter {
  organizationId: string;
  AND?: any[];
  OR?: any[];
  assignedToId?: string;
  teamId?: { in: string[] };
  brandId?: { in: string[] };
}

export interface ClientFilter {
  organizationId: string;
  AND?: any[];
  OR?: any[];
  brandId?: { in: string[] };
  upsellAgentId?: string;
}

export interface SaleFilter {
  organizationId: string;
  AND?: any[];
  OR?: any[];
  brandId?: { in: string[] };
  assignedToId?: string;
  clientId?: { in: string[] };
}

export interface InvoiceFilter {
  sale?: SaleFilter;
}
```

### 3. user-scope.class.ts

```typescript
import { UserRole } from '@sentra-core/types';
import { ScopeData, LeadFilter, ClientFilter, SaleFilter, InvoiceFilter } from './scope.types';

export class UserScope {
  constructor(private data: ScopeData) {}

  get isFullAccess(): boolean {
    return [UserRole.OWNER, UserRole.ADMIN].includes(this.data.role);
  }

  get isManager(): boolean {
    return this.data.role === UserRole.SALES_MANAGER;
  }

  /**
   * Leads visibility:
   * - OWNER/ADMIN: all org leads
   * - SALES_MANAGER: leads where brandId in team brands
   * - FRONTSELL_AGENT: own assigned leads only
   * - UPSELL_AGENT: own assigned leads only
   * - PROJECT_MANAGER: none (empty result)
   */
  toLeadFilter(): LeadFilter {
    const base: LeadFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      if (this.data.brandIds.length === 0) {
        // Manager with no brands assigned → see nothing
        return { ...base, brandId: { in: [] } };
      }
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    // FRONTSELL_AGENT, UPSELL_AGENT: own leads only
    if ([UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT].includes(this.data.role)) {
      return { ...base, assignedToId: this.data.userId };
    }

    // PROJECT_MANAGER: no lead access
    return { ...base, assignedToId: '__none__' };
  }

  /**
   * Clients visibility:
   * - OWNER/ADMIN: all org clients
   * - SALES_MANAGER: clients where brandId in team brands
   * - FRONTSELL_AGENT: clients from team brands IF allowMemberVisibility is on,
   *                     else only clients linked to own leads
   * - UPSELL_AGENT: own assigned clients (upsellAgentId)
   * - PROJECT_MANAGER: own assigned clients (projectManagerId)
   */
  toClientFilter(): ClientFilter {
    const base: ClientFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      if (this.data.brandIds.length === 0) {
        return { ...base, brandId: { in: [] } };
      }
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.role === UserRole.FRONTSELL_AGENT) {
      if (this.data.memberVisibleTeamIds.length > 0 && this.data.brandIds.length > 0) {
        // Team visibility ON: see all clients under team brands
        return { ...base, brandId: { in: this.data.brandIds } };
      }
      // No team visibility: no direct client access
      // (caller should handle this — typically show empty or filter via lead relationship)
      return { ...base, brandId: { in: [] } };
    }

    if (this.data.role === UserRole.UPSELL_AGENT) {
      return { ...base, upsellAgentId: this.data.userId };
    }

    // PROJECT_MANAGER: assigned clients only (projectManagerId on Client model)
    return { ...base, OR: [{ projectManagerId: this.data.userId }] };
  }

  /**
   * Sales visibility:
   * - OWNER/ADMIN: all org sales
   * - SALES_MANAGER: sales where brandId in team brands
   * - FRONTSELL_AGENT: team brand sales if visibility on, else own sales
   * - UPSELL_AGENT: own assigned sales
   * - PROJECT_MANAGER: none
   */
  toSaleFilter(): SaleFilter {
    const base: SaleFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      if (this.data.brandIds.length === 0) {
        return { ...base, brandId: { in: [] } };
      }
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.role === UserRole.FRONTSELL_AGENT) {
      if (this.data.memberVisibleTeamIds.length > 0 && this.data.brandIds.length > 0) {
        return { ...base, brandId: { in: this.data.brandIds } };
      }
      return { ...base, assignedToId: this.data.userId };
    }

    if (this.data.role === UserRole.UPSELL_AGENT) {
      return { ...base, assignedToId: this.data.userId };
    }

    return { ...base, assignedToId: '__none__' };
  }

  /**
   * Invoices: derived from sale scope (invoice joins through sale)
   */
  toInvoiceFilter(): InvoiceFilter & { organizationId?: string } {
    if (this.isFullAccess) {
      return {};  // No additional sale filter needed, org filter applied at invoice level
    }

    const saleFilter = this.toSaleFilter();
    // Remove organizationId from sale filter since invoice has its own org filter
    const { organizationId, ...saleWhere } = saleFilter;
    return { sale: saleWhere as SaleFilter };
  }

  /** Serialize for Redis storage */
  toJSON(): ScopeData {
    return { ...this.data };
  }

  /** Deserialize from Redis */
  static fromJSON(data: ScopeData): UserScope {
    return new UserScope(data);
  }
}
```

### 4. scope.service.ts

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../../common/cache/cache.service';
import { UserRole } from '@sentra-core/types';
import { UserScope } from './user-scope.class';
import { ScopeData } from './scope.types';

const SCOPE_TTL = 900; // 15 minutes — matches access token lifetime
const SCOPE_KEY_PREFIX = 'scope:';

@Injectable()
export class ScopeService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Get or compute user scope. Cached in Redis for 15 min.
   * Call this at the start of any scoped query.
   */
  async getUserScope(userId: string, orgId: string, role: UserRole): Promise<UserScope> {
    const cacheKey = `${SCOPE_KEY_PREFIX}${orgId}:${userId}`;

    // 1. Try cache
    const cached = await this.cache.get<ScopeData>(cacheKey);
    if (cached) {
      return UserScope.fromJSON(cached);
    }

    // 2. Compute from DB
    const scopeData = await this.computeScope(userId, orgId, role);
    const scope = new UserScope(scopeData);

    // 3. Cache
    await this.cache.set(cacheKey, scope.toJSON(), SCOPE_TTL);

    return scope;
  }

  /**
   * Invalidate scope for a specific user (call when team/brand membership changes).
   */
  async invalidateUser(userId: string, orgId: string): Promise<void> {
    const cacheKey = `${SCOPE_KEY_PREFIX}${orgId}:${userId}`;
    await this.cache.del(cacheKey);
  }

  /**
   * Invalidate scope for all members of a team (call when team-brand mapping changes).
   */
  async invalidateTeam(teamId: string, orgId: string): Promise<void> {
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { managerId: true },
    });

    const userIds = new Set(members.map(m => m.userId));
    if (team?.managerId) userIds.add(team.managerId);

    await Promise.all(
      [...userIds].map(uid => this.invalidateUser(uid, orgId)),
    );
  }

  /**
   * Compute scope from database — called on cache miss.
   * Single query batch: 2 parallel queries, ~2-5ms on indexed tables.
   */
  private async computeScope(userId: string, orgId: string, role: UserRole): Promise<ScopeData> {
    // OWNER/ADMIN: full access, no need to query teams
    if ([UserRole.OWNER, UserRole.ADMIN].includes(role)) {
      return {
        userId, orgId, role,
        teamIds: [],
        managedTeamIds: [],
        brandIds: [],
        memberVisibleTeamIds: [],
      };
    }

    // Query teams + brands in parallel
    const [memberTeams, managedTeams] = await Promise.all([
      // Teams where user is a member
      this.prisma.teamMember.findMany({
        where: { userId, team: { organizationId: orgId, deletedAt: null, isActive: true } },
        select: {
          teamId: true,
          team: {
            select: {
              id: true,
              allowMemberVisibility: true,
              teamBrands: { select: { brandId: true } },
            },
          },
        },
      }),
      // Teams where user is manager
      this.prisma.team.findMany({
        where: { managerId: userId, organizationId: orgId, deletedAt: null, isActive: true },
        select: {
          id: true,
          allowMemberVisibility: true,
          teamBrands: { select: { brandId: true } },
        },
      }),
    ]);

    // Collect unique IDs
    const teamIds = new Set<string>();
    const managedTeamIds = new Set<string>();
    const brandIds = new Set<string>();
    const memberVisibleTeamIds = new Set<string>();

    for (const m of memberTeams) {
      teamIds.add(m.teamId);
      if (m.team.allowMemberVisibility) {
        memberVisibleTeamIds.add(m.teamId);
      }
      for (const tb of m.team.teamBrands) {
        brandIds.add(tb.brandId);
      }
    }

    for (const t of managedTeams) {
      teamIds.add(t.id);
      managedTeamIds.add(t.id);
      if (t.allowMemberVisibility) {
        memberVisibleTeamIds.add(t.id);
      }
      for (const tb of t.teamBrands) {
        brandIds.add(tb.brandId);
      }
    }

    return {
      userId,
      orgId,
      role,
      teamIds: [...teamIds],
      managedTeamIds: [...managedTeamIds],
      brandIds: [...brandIds],
      memberVisibleTeamIds: [...memberVisibleTeamIds],
    };
  }
}
```

### 5. scope.module.ts

```typescript
import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';

@Global()  // Available everywhere — services inject ScopeService directly
@Module({
  providers: [ScopeService],
  exports: [ScopeService],
})
export class ScopeModule {}
```

### 6. Register in AppModule

Add `ScopeModule` to `app.module.ts` imports (after CacheModule).

---

## Expected Behavior

1. **First request** for a user: DB query (~2 parallel queries), computes scope, caches in Redis
2. **Subsequent requests** (within 15 min): scope loaded from Redis, zero DB queries
3. **OWNER/ADMIN**: `isFullAccess = true`, no team queries needed, filters return org-wide data
4. **SALES_MANAGER**: brand-scoped — sees data for all brands assigned to their teams
5. **FRONTSELL_AGENT**: own assigned leads; clients/sales depend on `allowMemberVisibility`
6. **UPSELL_AGENT**: own assigned data only
7. **PROJECT_MANAGER**: limited client access (projectManagerId), no lead/sale/invoice access
8. **User in 2 teams**: union of both teams' brands → `brandIds` contains all brands from both teams

---

## Performance

- Cache hit: 0 DB queries, ~1ms Redis GET
- Cache miss: 2 parallel Prisma queries (teamMember + team), indexed, ~2-5ms
- Memory: ~200-500 bytes per cached scope (JSON of arrays of cuid strings)
- Redis keys: `scope:{orgId}:{userId}`, auto-expire at 15 min

---

## Edge Cases

- **User not in any team**: `brandIds = []`, `teamIds = []` → agent roles see only own assigned data, manager sees nothing
- **User is both member AND manager of same team**: team appears in both `teamIds` and `managedTeamIds`, brands deduplicated via Set
- **Team with no brands**: team appears in `teamIds` but contributes no `brandIds` → behaves as if no brand access
- **User removed from team mid-session**: cached scope still has old teams until TTL expires or explicit invalidation
- **Redis down**: CacheService should handle this gracefully (return null on get, no-op on set) — service falls back to DB compute every request

---

## Testing Checklist

- [ ] **Unit: UserScope.toLeadFilter()** — returns correct WHERE for each role
- [ ] **Unit: UserScope.toClientFilter()** — FRONTSELL with/without visibility toggle
- [ ] **Unit: UserScope.toSaleFilter()** — manager brand scoping
- [ ] **Unit: UserScope.toInvoiceFilter()** — nested sale filter
- [ ] **Integration: ScopeService.getUserScope()** — cache miss → DB query → cache set
- [ ] **Integration: ScopeService.getUserScope()** — cache hit → no DB query
- [ ] **Integration: ScopeService.invalidateUser()** — cache key deleted, next call re-computes
- [ ] **Integration: ScopeService.invalidateTeam()** — all team members' caches cleared
- [ ] **Edge: OWNER scope** — no team queries, full access filter
- [ ] **Edge: User in 0 teams** — empty brandIds, agent sees own data only
- [ ] **Edge: User in 2 teams** — union of brands from both teams
- [ ] **Edge: Team with 0 brands** — no brandIds contributed

---

## Files Created/Modified

- `apps/backend/core-service/src/modules/scope/scope.module.ts` (NEW)
- `apps/backend/core-service/src/modules/scope/scope.service.ts` (NEW)
- `apps/backend/core-service/src/modules/scope/user-scope.class.ts` (NEW)
- `apps/backend/core-service/src/modules/scope/scope.types.ts` (NEW)
- `apps/backend/core-service/src/app/app.module.ts` (add ScopeModule import)
