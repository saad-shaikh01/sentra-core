# SM-FE-002 — Revenue Summary Cards

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-002                                  |
| Title          | Revenue Summary Cards                      |
| Phase          | 2 — Frontend                               |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 5 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

Leadership and sales managers need a high-level revenue snapshot at the top of the sales section. Static cards showing total revenue by status provide instant orientation without requiring the user to aggregate data manually from the sales list.

---

## User / Business Outcome

- Management can see total recognized revenue (COMPLETED sales) at a glance.
- Pipeline revenue (ACTIVE + PENDING + DRAFT) is visible for forecasting.
- Cancelled and refunded totals are visible for loss tracking.

---

## Exact Scope

### In Scope

1. Implement `RevenueSummaryCards` container component.
2. Implement `RevenueCard` individual card component.
3. Implement the backend `GET /sales/summary` endpoint (backend task — see section below).
4. Wire cards to the summary API using a separate React Query key.
5. Cards respond to the `brandId` and date range filters from the parent `SalesListPage`.
6. Loading skeleton for each card while data fetches.
7. Error state (silent — show "—" in card amounts rather than a full error page).

### Out of Scope

- Historical trend lines or charts (future analytics phase).
- Drill-down from a card to a filtered list (Phase 2 enhancement).
- Export revenue data.

---

## Backend Tasks

### Check if `GET /sales/summary` exists

Before implementing the frontend, check if a summary endpoint already exists in `sales.controller.ts`. If it exists, use it. If not, implement it as described below.

### Implement `GET /sales/summary`

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

Add a new route BEFORE the `GET /sales/:id` route (to avoid NestJS treating "summary" as an ID):

```typescript
@Get('summary')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
async getSummary(
  @OrgContext() { organizationId }: IOrgContext,
  @Query() query: SalesSummaryQueryDto,
): Promise<CommApiResponse<ISalesSummary>> {
  const result = await this.salesService.getSummary(organizationId, query);
  return CommApiResponse.success(result);
}
```

**File:** `apps/backend/core-service/src/modules/sales/dto/sales-summary-query.dto.ts`

```typescript
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SalesSummaryQueryDto {
  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
```

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add `getSummary()` method:

```typescript
async getSummary(
  organizationId: string,
  query: SalesSummaryQueryDto,
): Promise<ISalesSummary> {
  const { brandId, dateFrom, dateTo } = query;

  const baseWhere: Prisma.SaleWhereInput = {
    organizationId,
    deletedAt: null,
    ...(brandId ? { brandId } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [completedAgg, activeAgg, pendingDraftAgg, cancelledAgg, refundedAgg] =
    await Promise.all([
      this.prisma.sale.aggregate({
        where: { ...baseWhere, status: SaleStatus.COMPLETED },
        _sum: { discountedTotal: true, totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.sale.aggregate({
        where: { ...baseWhere, status: SaleStatus.ACTIVE },
        _sum: { discountedTotal: true, totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.sale.aggregate({
        where: {
          ...baseWhere,
          status: { in: [SaleStatus.PENDING, SaleStatus.DRAFT] },
        },
        _sum: { discountedTotal: true, totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.sale.aggregate({
        where: { ...baseWhere, status: SaleStatus.CANCELLED },
        _sum: { discountedTotal: true, totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.sale.aggregate({
        where: { ...baseWhere, status: SaleStatus.REFUNDED },
        _sum: { discountedTotal: true, totalAmount: true },
        _count: { id: true },
      }),
    ]);

  const resolveAmount = (agg: typeof completedAgg) =>
    Number(agg._sum.discountedTotal ?? agg._sum.totalAmount ?? 0);

  return {
    totalRevenue: resolveAmount(completedAgg),
    totalRevenueCount: completedAgg._count.id,
    activeRevenue: resolveAmount(activeAgg),
    activeRevenueCount: activeAgg._count.id,
    pendingRevenue: resolveAmount(pendingDraftAgg),
    pendingRevenueCount: pendingDraftAgg._count.id,
    cancelledRevenue: resolveAmount(cancelledAgg),
    cancelledCount: cancelledAgg._count.id,
    refundedRevenue: resolveAmount(refundedAgg),
    refundedCount: refundedAgg._count.id,
  };
}
```

Define `ISalesSummary` interface:

```typescript
export interface ISalesSummary {
  totalRevenue: number;
  totalRevenueCount: number;
  activeRevenue: number;
  activeRevenueCount: number;
  pendingRevenue: number;
  pendingRevenueCount: number;
  cancelledRevenue: number;
  cancelledCount: number;
  refundedRevenue: number;
  refundedCount: number;
}
```

---

## Frontend Tasks

### 1. Create `RevenueSummaryCards` Container

**File:** `apps/frontend/components/sales/RevenueSummaryCards.tsx`

```typescript
// Renders 4 RevenueCard components in a responsive grid
// Receives brandId and date range from the parent SalesListPage filters
// Uses useSalesSummary() hook
```

Renders:
- Card 1: **Total Revenue** — `totalRevenue` (COMPLETED sales amount) + `totalRevenueCount` count
- Card 2: **Active Pipeline** — `activeRevenue` + `activeRevenueCount`
- Card 3: **Pending Revenue** — `pendingRevenue` + `pendingRevenueCount` (DRAFT + PENDING)
- Card 4: **Cancelled / Refunded** — `cancelledRevenue + refundedRevenue` combined, with `cancelledCount + refundedCount`

### 2. Create `RevenueCard` Component

**File:** `apps/frontend/components/sales/RevenueCard.tsx`

Props:
```typescript
interface RevenueCardProps {
  label: string;
  amount: number;
  count: number;
  color: 'green' | 'blue' | 'yellow' | 'red';
  isLoading: boolean;
}
```

Layout:
- Label at top
- Large formatted currency amount (e.g., "$12,450.00")
- Smaller count below (e.g., "14 sales")
- Colored left border or icon indicator
- Loading skeleton when `isLoading` is true

### 3. Create `useSalesSummary` Hook

**File:** `apps/frontend/hooks/sales/useSalesSummary.ts`

```typescript
export function useSalesSummary(params: { brandId?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['sales', 'summary', params],
    queryFn: () => fetchSalesSummary(params),
    staleTime: 60_000,  // summary can be slightly stale
  });
}
```

Add `fetchSalesSummary()` to `apps/frontend/api/sales.api.ts`.

### 4. Wire Filters to Summary Query

In `SalesListPage`, the `brandId`, `dateFrom`, `dateTo` filter values from URL params must be passed to both `useSalesList()` and `useSalesSummary()`. When these filters change, both queries re-fetch.

Note: `status` and `clientId` filters affect the list but NOT the summary (the summary aggregates across all statuses).

---

## Schema / Migration Impact

None for frontend. The backend `getSummary()` method uses existing Prisma aggregate queries — no schema changes.

---

## API / Contracts Affected

### New Endpoint: `GET /sales/summary`

**Query Parameters:** `brandId?`, `dateFrom?`, `dateTo?`

**Response:**
```json
{
  "data": {
    "totalRevenue": 125000.00,
    "totalRevenueCount": 23,
    "activeRevenue": 47500.00,
    "activeRevenueCount": 12,
    "pendingRevenue": 18000.00,
    "pendingRevenueCount": 8,
    "cancelledRevenue": 5000.00,
    "cancelledCount": 3,
    "refundedRevenue": 2500.00,
    "refundedCount": 1
  }
}
```

---

## Acceptance Criteria

1. Four revenue cards render above the sales list table on the `/sales` page.
2. Each card shows the correct label, amount (formatted as currency), and count.
3. Card amounts reflect only the correct sales statuses per their definition.
4. When `brandId` filter changes, the summary cards re-fetch and update.
5. When date range changes, the summary cards re-fetch and update.
6. While the summary is loading, each card shows a skeleton.
7. If the summary API fails, cards show "—" (no full-page error).
8. `GET /sales/summary` with `brandId` param returns amounts filtered to that brand only.
9. `GET /sales/summary` without params returns org-wide totals.
10. `GET /sales/summary` is NOT accessible to `FRONTSELL_AGENT` or `UPSELL_AGENT` (403).
11. Summary query key is independent from the list query key — filtering by status on the list does NOT re-fetch the summary.

---

## Edge Cases

1. **No sales exist:** All amounts are 0 and all counts are 0. Cards show "$0.00" and "0 sales".
2. **Sales with no `discountedTotal` (no discount applied):** Use `totalAmount` as fallback in `resolveAmount()`.
3. **Large amounts:** Currency formatting must handle numbers > $1,000,000 (use `Intl.NumberFormat` with `currency` option).
4. **Summary includes ON_HOLD sales:** ON_HOLD is not represented in the 4 cards. Decide whether ON_HOLD is grouped with ACTIVE or excluded. Document the decision. (Recommended: include ON_HOLD in ACTIVE pipeline card.)

---

## Dependencies

- **SM-FE-001** — Revenue cards are rendered within the `SalesListPage`.
- Backend `GET /sales/summary` endpoint (this ticket includes the backend task).

---

## Testing Requirements

### Unit Tests

- `RevenueCard` renders correct amount and label props.
- `RevenueCard` shows skeleton when `isLoading` is true.
- `useSalesSummary` hook uses correct query key.

### Integration Tests

- `RevenueSummaryCards` renders with mocked API response showing correct values.
- Changing `brandId` filter triggers summary re-fetch.

### Manual QA Checks

- [ ] Load the sales list. Confirm 4 revenue cards appear.
- [ ] Confirm amounts match expected totals (verify against DB query).
- [ ] Apply a brand filter. Confirm card amounts update.
- [ ] Apply a date range. Confirm card amounts update.
- [ ] Log in as FRONTSELL_AGENT. Confirm summary cards are either hidden or show 403-handled gracefully.

---

## Verification Steps

- [ ] `RevenueSummaryCards` component renders 4 cards.
- [ ] `RevenueCard` displays formatted currency amounts.
- [ ] `useSalesSummary` React Query hook created with correct query key.
- [ ] `GET /sales/summary` backend endpoint implemented and tested.
- [ ] `ISalesSummary` interface defined.
- [ ] Summary updates when brand/date filters change.
- [ ] Loading skeleton shown while fetching.
- [ ] Error handled gracefully (shows "—", no crash).
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **Backend risk:** The new `GET /sales/summary` route must be placed BEFORE `GET /sales/:id` in the controller to avoid the "summary" string being matched as an ID. Verify route ordering.
- **No data mutation.** This ticket is read-only aggregation.
