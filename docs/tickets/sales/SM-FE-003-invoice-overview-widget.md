# SM-FE-003 — Invoice Overview Widget

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-003                                  |
| Title          | Invoice Overview Widget                    |
| Phase          | 2 — Frontend                               |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 5 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The invoice overview widget gives collections and finance staff an instant snapshot of outstanding receivables without navigating into individual sale records. Overdue invoices are highlighted to drive urgency.

---

## User / Business Outcome

- Finance staff see how much is outstanding (unpaid + overdue) at a glance.
- Clicking "overdue" highlights or filters to overdue invoices for immediate action.
- "Paid this month" and "upcoming due" give cash flow visibility.

---

## Exact Scope

### In Scope

1. Implement `InvoiceOverviewWidget` component.
2. Implement the backend `GET /invoices/summary` endpoint (backend task).
3. Implement `InvoicesController` and `InvoicesService` in core-service if not already present.
4. Wire the widget to the summary API using React Query.
5. Clicking the overdue section filters the sales list by overdue invoices (or navigates to an invoice list if one exists).
6. Loading skeleton.
7. Error state (show "—").

### Out of Scope

- Full invoice list page (future ticket).
- Marking invoices as paid from the widget.
- Export invoices.

---

## Backend Tasks

### Step 0: Check if `GET /invoices/summary` Exists

Search `apps/backend/core-service/src/` for an `InvoicesController` or `invoices/summary` route. If found, use it. If not, implement the following.

### Step 1: Create `InvoicesModule`

**File:** `apps/backend/core-service/src/modules/invoices/invoices.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
```

Register in `AppModule`.

### Step 2: Create `InvoicesService.getSummary()`

**File:** `apps/backend/core-service/src/modules/invoices/invoices.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

export interface IInvoiceSummary {
  unpaid: { count: number; total: number };
  overdue: { count: number; total: number };
  paidThisMonth: { count: number; total: number };
  upcomingDue: { count: number; total: number };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    organizationId: string,
    brandId?: string,
  ): Promise<IInvoiceSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Base filter: join through Sale to get organizationId + brandId scope
    const saleWhere = {
      organizationId,
      deletedAt: null,
      ...(brandId ? { brandId } : {}),
    };

    const [unpaidAgg, overdueAgg, paidThisMonthAgg, upcomingDueAgg] =
      await Promise.all([
        // Unpaid invoices (not yet overdue)
        this.prisma.invoice.aggregate({
          where: {
            status: InvoiceStatus.UNPAID,
            dueDate: { gte: now },  // not yet past due
            sale: { ...saleWhere },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),

        // Overdue invoices (UNPAID and past due OR status already OVERDUE)
        this.prisma.invoice.aggregate({
          where: {
            OR: [
              { status: InvoiceStatus.OVERDUE },
              { status: InvoiceStatus.UNPAID, dueDate: { lt: now } },
            ],
            sale: { ...saleWhere },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),

        // Paid this month
        this.prisma.invoice.aggregate({
          where: {
            status: InvoiceStatus.PAID,
            updatedAt: { gte: startOfMonth, lte: endOfMonth },
            sale: { ...saleWhere },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),

        // Upcoming due in next 7 days (unpaid, not yet overdue)
        this.prisma.invoice.aggregate({
          where: {
            status: InvoiceStatus.UNPAID,
            dueDate: { gte: now, lte: sevenDaysFromNow },
            sale: { ...saleWhere },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
      ]);

    return {
      unpaid: {
        count: unpaidAgg._count.id,
        total: Number(unpaidAgg._sum.amount ?? 0),
      },
      overdue: {
        count: overdueAgg._count.id,
        total: Number(overdueAgg._sum.amount ?? 0),
      },
      paidThisMonth: {
        count: paidThisMonthAgg._count.id,
        total: Number(paidThisMonthAgg._sum.amount ?? 0),
      },
      upcomingDue: {
        count: upcomingDueAgg._count.id,
        total: Number(upcomingDueAgg._sum.amount ?? 0),
      },
    };
  }
}
```

**Note:** The `sale: { ...saleWhere }` filter in the Invoice aggregation assumes Prisma can filter through the relation. Adjust if the Prisma version or schema requires a different pattern (e.g., `saleId: { in: [...] }` via a subquery).

### Step 3: Create `InvoicesController`

**File:** `apps/backend/core-service/src/modules/invoices/invoices.controller.ts`

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('summary')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.PROJECT_MANAGER,
  )
  async getSummary(
    @OrgContext() { organizationId }: IOrgContext,
    @Query('brandId') brandId?: string,
  ) {
    const result = await this.invoicesService.getSummary(organizationId, brandId);
    return CommApiResponse.success(result);
  }
}
```

---

## Frontend Tasks

### 1. Create `InvoiceOverviewWidget` Component

**File:** `apps/frontend/components/sales/InvoiceOverviewWidget.tsx`

Layout: A card with 4 sections side by side (or stacked on mobile):

| Section         | Data                              | Highlight Color |
|-----------------|-----------------------------------|-----------------|
| Unpaid          | count + total                     | Yellow          |
| Overdue         | count + total (clickable)         | Red             |
| Paid This Month | count + total                     | Green           |
| Upcoming Due    | count + total (next 7 days)       | Orange          |

The "Overdue" section should be visually prominent (larger text, red border, or warning icon).

Clicking the Overdue section: Navigate to `/sales?invoiceStatus=OVERDUE` OR open a filtered modal showing overdue invoices. For Phase 1, simply navigate with query param. Backend support for filtering by `invoiceStatus` may need to be added — check if `GET /sales` supports this filter. If not, this click behavior is a soft link that does not yet filter (show a tooltip: "Full invoice list coming soon").

### 2. Create `useInvoiceSummary` Hook

**File:** `apps/frontend/hooks/sales/useInvoiceSummary.ts`

```typescript
export function useInvoiceSummary(params: { brandId?: string }) {
  return useQuery({
    queryKey: ['invoices', 'summary', params],
    queryFn: () => fetchInvoiceSummary(params),
    staleTime: 60_000,
  });
}
```

Add `fetchInvoiceSummary()` to `apps/frontend/api/invoices.api.ts` (create file).

### 3. Integrate Widget in `SalesListPage`

In `SalesListPage`, render `InvoiceOverviewWidget` below `RevenueSummaryCards` and above `SalesFilters`. Pass `brandId` from the active filter.

---

## Schema / Migration Impact

None. `Invoice` model already exists. `InvoicesModule` is a new module but requires no schema changes.

---

## API / Contracts Affected

### New Endpoint: `GET /invoices/summary`

**Query Parameters:** `brandId?`

**Response:**
```json
{
  "data": {
    "unpaid": { "count": 7, "total": 14500.00 },
    "overdue": { "count": 3, "total": 6200.00 },
    "paidThisMonth": { "count": 12, "total": 28400.00 },
    "upcomingDue": { "count": 5, "total": 9750.00 }
  }
}
```

---

## Acceptance Criteria

1. The `InvoiceOverviewWidget` renders below revenue cards on the `/sales` page with all 4 sections.
2. Overdue count and total accurately reflect invoices with `dueDate < today AND status ∈ {UNPAID, OVERDUE}`.
3. Unpaid count excludes overdue invoices (unpaid + future due only).
4. Paid this month count reflects invoices with `status: PAID` and `updatedAt` within the current calendar month.
5. Upcoming due count reflects invoices with `status: UNPAID` and `dueDate` within the next 7 days.
6. Clicking the Overdue section navigates or filters appropriately.
7. Loading skeleton shown while data is fetching.
8. If API fails, all sections show "—" without crashing the page.
9. `GET /invoices/summary` with `brandId` returns brand-scoped totals.
10. `GET /invoices/summary` accessible to OWNER, ADMIN, SALES_MANAGER, PROJECT_MANAGER; returns 403 for FRONTSELL_AGENT / UPSELL_AGENT.

---

## Edge Cases

1. **Invoice marked PAID via webhook at the exact moment the widget loads:** The overdue count may be slightly stale. The 60-second stale time means it will refresh within a minute. This is acceptable.
2. **Invoice with `dueDate: null`:** Exclude from overdue and upcoming-due calculations. `NULL` dueDate invoices are neither upcoming nor overdue.
3. **Invoice counted in both "upcoming due" and "unpaid":** An invoice due in 3 days IS both unpaid AND upcoming. This is correct — these are different aggregate queries measuring different dimensions.

---

## Dependencies

- **SM-FE-001** — Widget is rendered within `SalesListPage`.
- Backend `GET /invoices/summary` endpoint (this ticket's backend tasks).

---

## Testing Requirements

### Unit Tests

- `InvoiceOverviewWidget` renders all 4 sections with mocked data.
- Each section shows correct count and total.
- Loading skeleton renders when `isLoading` is true.
- Error state shows "—" values.

### Integration Tests (Backend)

**File:** `apps/backend/core-service/src/modules/invoices/__tests__/invoices.service.spec.ts`

- `getSummary()` returns correct overdue count for invoices with `dueDate < now`.
- `getSummary()` returns 0 for all when no invoices exist.
- `getSummary()` with `brandId` only includes invoices for sales under that brand.

### Manual QA Checks

- [ ] Create invoices with various statuses and due dates. Load the widget. Verify counts match.
- [ ] Verify overdue count matches `SELECT COUNT(*) FROM "Invoice" WHERE "status" = 'UNPAID' AND "dueDate" < NOW();` (plus OVERDUE status).
- [ ] Log in as FRONTSELL_AGENT. Confirm widget either shows 403-handled "—" or is hidden.
- [ ] Apply a brand filter on the sales page. Confirm widget totals update.

---

## Verification Steps

- [ ] `InvoicesModule` registered in `AppModule`.
- [ ] `GET /invoices/summary` route exists in `InvoicesController`.
- [ ] `InvoicesService.getSummary()` implemented with correct date logic.
- [ ] `InvoiceOverviewWidget` component renders 4 sections.
- [ ] `useInvoiceSummary` hook created.
- [ ] Widget integrated in `SalesListPage` below revenue cards.
- [ ] Loading and error states implemented.
- [ ] All backend unit tests pass.
- [ ] All frontend unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration.** All queries are on existing tables.
- **Risk: Prisma nested filter on relation.** The `sale: { organizationId, deletedAt: null }` filter inside `Invoice.aggregate()` works in Prisma 4+ with nested relation filters. Verify Prisma version supports this. If not, use a raw query or a two-step approach (get sale IDs first, then aggregate by `saleId: { in: [...] }`).
