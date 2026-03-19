# DS-006: Sales Service Scope Integration

## Priority: P0
## Estimate: 3-4 hours
## Depends On: DS-002

---

## Summary
Replace the existing ad-hoc role filtering in `SalesService.findAll()` with `ScopeService` + `UserScope.toSaleFilter()`. Sales are brand-scoped for managers and visibility-dependent for agents.

---

## Implementation Details

### Current State (to be replaced)

```typescript
// Current pattern (lines 538-608):
// FRONTSELL_AGENT/UPSELL_AGENT:
//   1. Fetch own assigned leads (converted ones)
//   2. Get clientIds from those leads
//   3. Filter sales: where.clientId = { in: clientIds }
// SALES_MANAGER:
//   1. Get team member IDs via teams.getMemberIds()
//   2. Fetch those members' assigned leads
//   3. Get clientIds → filter sales
// Others: no filter
```

**Problems:**
- Two-step query pattern: leads → clients → sales (N+1 potential)
- No direct brand-based scoping
- Manager scope chains through member IDs, not brands
- Every request queries leads table first (no caching)
- Sale model already HAS `brandId` — should filter directly on it

### New Implementation

```typescript
// apps/backend/core-service/src/modules/sales/sales.service.ts

async findAll(params: {
  orgId: string;
  userId: string;
  role: UserRole;
  query?: SaleQueryDto;
}) {
  const { orgId, userId, role, query } = params;

  const scope = await this.scopeService.getUserScope(userId, orgId, role);
  const scopeWhere = scope.toSaleFilter();

  const where: any = {
    ...scopeWhere,
    ...(query?.brandId && { brandId: query.brandId }),
    ...(query?.clientId && { clientId: query.clientId }),
    ...(query?.status && { status: query.status }),
    ...(query?.search && {
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { client: { companyName: { contains: query.search, mode: 'insensitive' } } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    this.prisma.sale.findMany({
      where,
      skip: query?.skip ?? 0,
      take: query?.take ?? 25,
      orderBy: query?.orderBy ?? { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true } },
        client: { select: { id: true, companyName: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { invoices: true, saleItems: true } },
      },
    }),
    this.prisma.sale.count({ where }),
  ]);

  return { data, meta: { total, ... } };
}
```

---

## Expected Behavior

| Role | Sees | Filter |
|------|------|--------|
| OWNER | All org sales | `{ organizationId }` |
| ADMIN | All org sales | `{ organizationId }` |
| SALES_MANAGER | Sales under team brands | `{ organizationId, brandId: { in: [...] } }` |
| FRONTSELL_AGENT (visibility ON) | Sales under team brands | `{ organizationId, brandId: { in: [...] } }` |
| FRONTSELL_AGENT (visibility OFF) | Own assigned sales | `{ organizationId, assignedToId: userId }` |
| UPSELL_AGENT | Own assigned sales | `{ organizationId, assignedToId: userId }` |
| PROJECT_MANAGER | No sales | empty result |

### Key Change: Single Query

Old approach: 2 queries (leads → client IDs → sales)
New approach: 1 query with brand-based WHERE clause
**Performance improvement**: eliminates N+1 pattern entirely

---

## Edge Cases

- **Sale with no brand**: Only visible to OWNER/ADMIN. Should not happen in practice — sales inherit brand from client/lead.
- **Sale.assignedToId is null**: Not matched by agent `assignedToId: userId` filter → invisible to agents unless brand-scoped. Correct.
- **FRONTSELL creates sale but visibility is OFF**: They still see their own (assignedToId match). If sale was created by someone else, they don't see it.
- **Sale crosses brands** (client from brand A, sale recorded under brand B): Scope uses Sale.brandId. Ensure sale creation always sets brandId correctly.

---

## Testing Checklist

- [ ] **OWNER/ADMIN sees all org sales**
- [ ] **SALES_MANAGER sees only sales under team brands**
- [ ] **FRONTSELL (visibility ON) sees brand-scoped sales**
- [ ] **FRONTSELL (visibility OFF) sees only own assigned sales**
- [ ] **UPSELL_AGENT sees only own assigned sales**
- [ ] **PROJECT_MANAGER sees no sales** — empty result
- [ ] **Single query performance** — no two-step lead→client join
- [ ] **Brand filter + scope intersection** — correct results
- [ ] **Search within scope** — only scoped matches
- [ ] **Pagination reflects scoped total**

---

## Files Modified

- `apps/backend/core-service/src/modules/sales/sales.service.ts`
- `apps/backend/core-service/src/modules/sales/sales.module.ts` (if needed)
