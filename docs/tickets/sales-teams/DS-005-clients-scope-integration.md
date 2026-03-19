# DS-005: Clients Service Scope Integration

## Priority: P0
## Estimate: 3-4 hours
## Depends On: DS-002

---

## Summary
Replace the existing ad-hoc role filtering in `ClientsService.findAll()` with `ScopeService` + `UserScope.toClientFilter()`. Clients are brand-scoped for managers and visibility-dependent for agents.

---

## Implementation Details

### Current State (to be replaced)

```typescript
// Current approximate pattern:
if (role === 'UPSELL_AGENT') {
  where.upsellAgentId = userId;
}
// No brand scoping, no team visibility check
```

### New Implementation

```typescript
// apps/backend/core-service/src/modules/clients/clients.service.ts

async findAll(params: {
  orgId: string;
  userId: string;
  role: UserRole;
  query?: ClientQueryDto;
}) {
  const { orgId, userId, role, query } = params;

  // 1. Get cached scope
  const scope = await this.scopeService.getUserScope(userId, orgId, role);

  // 2. Build where from scope
  const scopeWhere = scope.toClientFilter();

  // 3. Merge with user query filters
  const where: any = {
    ...scopeWhere,
    ...(query?.brandId && { brandId: query.brandId }),
    ...(query?.search && {
      OR: [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    this.prisma.client.findMany({
      where,
      skip: query?.skip ?? 0,
      take: query?.take ?? 25,
      orderBy: query?.orderBy ?? { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true } },
        upsellAgent: { select: { id: true, name: true } },
        projectManager: { select: { id: true, name: true } },
      },
    }),
    this.prisma.client.count({ where }),
  ]);

  return { data, meta: { total, ... } };
}
```

---

## Expected Behavior

| Role | Sees | Filter |
|------|------|--------|
| OWNER | All org clients | `{ organizationId }` |
| ADMIN | All org clients | `{ organizationId }` |
| SALES_MANAGER | Clients under team brands | `{ organizationId, brandId: { in: [...] } }` |
| FRONTSELL_AGENT (visibility ON) | Clients under team brands | `{ organizationId, brandId: { in: [...] } }` |
| FRONTSELL_AGENT (visibility OFF) | No clients | `{ organizationId, brandId: { in: [] } }` |
| UPSELL_AGENT | Own assigned clients | `{ organizationId, upsellAgentId: userId }` |
| PROJECT_MANAGER | Own assigned clients | `{ organizationId, projectManagerId: userId }` |

### FRONTSELL_AGENT Visibility Logic

- Team has `allowMemberVisibility = true`: agent sees all clients under team brands (can view team data)
- Team has `allowMemberVisibility = false`: agent sees NO clients (they work on leads, not clients)
- This is intentional: FRONTSELL agents primarily work with leads. Client visibility is a team-level privilege.

---

## Edge Cases

- **Client with no brand**: Not visible to brand-scoped roles (manager, frontsell). OWNER/ADMIN can see it. Clients should always have a brand.
- **UPSELL_AGENT with no assigned clients**: Empty result, 200 OK
- **FRONTSELL_AGENT in 2 teams, one with visibility ON**: `memberVisibleTeamIds` has at least one → visibility ON → sees brands from ALL their teams (union)
- **Client created after brand-team mapping**: If client's brand is mapped to a team, team members see it immediately (after scope refresh)

---

## Testing Checklist

- [ ] **OWNER/ADMIN sees all org clients**
- [ ] **SALES_MANAGER sees only clients under team brands**
- [ ] **FRONTSELL (visibility ON) sees clients under team brands**
- [ ] **FRONTSELL (visibility OFF) sees no clients**
- [ ] **UPSELL_AGENT sees only own assigned clients**
- [ ] **PROJECT_MANAGER sees only own assigned clients**
- [ ] **Brand filter + scope intersection works correctly**
- [ ] **Search within scope** — manager searches, only scoped results returned
- [ ] **Pagination count matches scope** — total reflects scoped count
- [ ] **Empty scope (no brands)** → empty result, not error

---

## Files Modified

- `apps/backend/core-service/src/modules/clients/clients.service.ts`
- `apps/backend/core-service/src/modules/clients/clients.module.ts` (if ScopeService not @Global)
