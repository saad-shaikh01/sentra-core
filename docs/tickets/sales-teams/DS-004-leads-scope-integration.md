# DS-004: Leads Service Scope Integration

## Priority: P0
## Estimate: 3-4 hours
## Depends On: DS-002

---

## Summary
Replace the existing ad-hoc role-based filtering in `LeadsService.findAll()` with `ScopeService.getUserScope()` + `UserScope.toLeadFilter()`. This ensures consistent, brand-based data visibility for all roles.

---

## Implementation Details

### Current State (to be replaced)

The current `LeadsService.findAll()` has a **3-tier permission system** (lines 465-495):

```typescript
// Tier 1: Permission-based (from PermissionsService)
if (permissions.includes('sales:leads:view_all'))   → no filter
if (permissions.includes('sales:leads:view_team'))   → assignedToId=userId OR teamId IN userTeamIds
if (permissions.includes('sales:leads:view_own'))    → assignedToId=userId

// Tier 2: Role-based fallback
if (FRONTSELL_AGENT || UPSELL_AGENT) → assignedToId=userId
if (SALES_MANAGER) → assignedToId IN [...memberIds, userId] (via getMemberIds)
else → no filter
```

**Problems:**
- `view_team` uses `getTeamIdsForUser()` which returns teams user is in — but doesn't scope by brand
- `SALES_MANAGER` fallback uses `getMemberIds()` — user-based, not brand-based
- No brand-to-team mapping → manager sees all team members' leads regardless of brand
- `getMemberIds` queries DB every request (no caching)
- Permission system and role fallback can conflict — dual paths hard to maintain
- Inconsistent with how clients/sales will be scoped

### Migration Strategy

**Keep the permission system intact** — `view_all`, `view_team`, `view_own` are already granular.
Replace only the **data resolution** behind each permission with ScopeService:

| Permission | Old behavior | New behavior |
|-----------|-------------|-------------|
| `view_all` | No filter | No filter (unchanged) |
| `view_team` | teamId IN user's teams | brandId IN team brands (via ScopeService) |
| `view_own` | assignedToId = userId | assignedToId = userId (unchanged) |
| Fallback (no perms) | Role-based inline logic | ScopeService.toLeadFilter() |

### New Implementation

```typescript
// apps/backend/core-service/src/modules/leads/leads.service.ts

import { ScopeService } from '../scope/scope.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private scopeService: ScopeService,
    // ... other deps
  ) {}

  async findAll(params: {
    orgId: string;
    userId: string;
    role: UserRole;
    query?: LeadQueryDto;
  }) {
    const { orgId, userId, role, query } = params;

    // 1. Get cached scope
    const scope = await this.scopeService.getUserScope(userId, orgId, role);

    // 2. Build base where from scope
    const scopeWhere = scope.toLeadFilter();

    // 3. Merge with user query filters (search, status, brand, date range, etc.)
    const where: any = {
      ...scopeWhere,
      // User-applied filters layered on top (AND logic)
      ...(query?.status && { status: query.status }),
      ...(query?.brandId && { brandId: query.brandId }),
      ...(query?.assignedToId && { assignedToId: query.assignedToId }),
      ...(query?.search && {
        OR: [
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { contactPerson: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    // 4. Query with pagination
    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip: query?.skip ?? 0,
        take: query?.take ?? 25,
        orderBy: query?.orderBy ?? { createdAt: 'desc' },
        include: {
          brand: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true } },
          // ... other includes
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, meta: { total, page: ..., limit: ..., pages: ... } };
  }
}
```

### Filter Merge Rules

When user applies a filter (e.g., `?brandId=xxx`) AND scope restricts brands:
- If scope says `brandId: { in: [a, b, c] }` and user filters `brandId: d`:
  - Prisma AND logic: both conditions must match → `d` not in `[a,b,c]` → empty result
  - This is correct! User can't see brand `d` if it's not in their scope
- If user filters `brandId: b` (which IS in scope): both match → sees brand `b` data

No special merge logic needed — Prisma's implicit AND handles it.

### Remove Old TeamsService.getMemberIds Usage

The old `getMemberIds` call in leads is replaced by `scope.toLeadFilter()`. The `TeamsService.getMemberIds()` method can remain (used elsewhere) but is no longer called from leads.

---

## Expected Behavior

| Role | Sees | Filter Applied |
|------|------|----------------|
| OWNER | All org leads | `{ organizationId }` |
| ADMIN | All org leads | `{ organizationId }` |
| SALES_MANAGER | Leads under team brands | `{ organizationId, brandId: { in: [...] } }` |
| FRONTSELL_AGENT | Own assigned leads | `{ organizationId, assignedToId: userId }` |
| UPSELL_AGENT | Own assigned leads | `{ organizationId, assignedToId: userId }` |
| PROJECT_MANAGER | No leads | `{ organizationId, assignedToId: '__none__' }` (empty) |

---

## Edge Cases

- **Manager with no team brands**: `brandIds = []` → `brandId: { in: [] }` → empty result. Correct behavior — manager needs at least one brand assigned to their team.
- **Agent reassigned to different team**: Lead.teamId stays the same (historical attribution). Agent can still see their own assigned leads regardless of team.
- **Lead with null brandId**: Doesn't match `brandId: { in: [...] }` → invisible to managers. OWNER/ADMIN can see it. This is correct — leads should always have a brand.
- **Concurrent filter + scope**: Prisma AND merge. No conflicts possible.
- **Scope cache expired mid-pagination**: User gets fresh scope on page 2. Minor inconsistency possible if team changed between pages — acceptable.

---

## Testing Checklist

- [ ] **OWNER sees all org leads** — no scope restriction
- [ ] **ADMIN sees all org leads** — same as OWNER
- [ ] **SALES_MANAGER sees only leads under team brands** — create leads under brand A (in team) and brand B (not in team). Manager sees A only.
- [ ] **FRONTSELL_AGENT sees own assigned leads only** — create 3 leads, assign 1 to agent. Agent sees 1.
- [ ] **UPSELL_AGENT sees own assigned leads only** — same as FRONTSELL
- [ ] **PROJECT_MANAGER sees no leads** — empty list returned
- [ ] **Manager with no brands**: empty result, 200 OK (not error)
- [ ] **User filter + scope intersection**: manager filters by brand not in their scope → empty result
- [ ] **User filter + scope intersection**: manager filters by brand in their scope → sees filtered data
- [ ] **Search filter works within scope**: manager searches "acme" → only matches within their brand scope
- [ ] **Pagination correct with scope**: total count matches scoped data, not all org data
- [ ] **Performance**: scope cache hit → no DB query for scope, single query for leads

---

## Files Modified

- `apps/backend/core-service/src/modules/leads/leads.service.ts` (replace role-check logic)
- `apps/backend/core-service/src/modules/leads/leads.module.ts` (inject ScopeService if not @Global)
