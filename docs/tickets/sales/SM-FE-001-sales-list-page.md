# SM-FE-001 — Sales List Page

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-001                                  |
| Title          | Sales List Page                            |
| Phase          | 2 — Frontend                               |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 8 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The primary entry point for managing sales in the CRM. Staff need a filterable, paginated list of all sales within their organization with quick-access actions. This is the foundation for all other frontend sales views.

---

## User / Business Outcome

- Sales managers can quickly find any sale by client, status, brand, or date range.
- Agents see only their scoped sales (backend-enforced; frontend renders whatever the API returns).
- Project Managers can view the sales list for financial context without create/edit access.

---

## Exact Scope

### In Scope

1. Create the `SalesListPage` component at the appropriate route (`/sales` or `/dashboard/sales` — use whatever routing convention is established in the codebase).
2. Create `SalesTable` component with all required columns.
3. Create `SalesFilters` component with all required filter controls.
4. Create `SaleStatusBadge` reusable component.
5. Create `SalesPagination` component (or reuse existing pagination component if one exists).
6. URL query params must reflect filter state (shareable/bookmarkable URLs).
7. Loading skeleton state.
8. Empty state (no sales matching filters).
9. Error state (API call failed).
10. React Query (TanStack Query) for data fetching and caching.
11. Debounced search input (300ms).

### Out of Scope

- Bulk operations (bulk archive, bulk status change).
- Export to CSV/PDF.
- Inline editing of sale fields.
- Revenue summary cards (SM-FE-002).
- Invoice overview widget (SM-FE-003).

---

## Backend Tasks

None. All backend changes required for the list endpoint are in SM-BE-001 through SM-BE-008. Verify the `GET /sales` endpoint contract before implementing.

---

## Frontend Tasks

### 1. Create Route / Page Component

**File:** Determine the correct path based on the project's routing structure. Common patterns:
- `apps/frontend/app/(dashboard)/sales/page.tsx` (Next.js App Router)
- `apps/frontend/pages/sales/index.tsx` (Next.js Pages Router)

The page component:

```typescript
// SalesListPage — top-level page component
// - Reads query params from URL to initialize filter state
// - Renders: RevenueSummaryCards + InvoiceOverviewWidget + SalesFilters + SalesTable + SalesPagination
// - Provides a "New Sale" button (visible only to non-PM, non-archived roles)
```

### 2. Create `SalesTable` Component

**File:** `apps/frontend/components/sales/SalesTable.tsx`

Table columns:

| Column           | Content                                         | Sortable |
|------------------|-------------------------------------------------|----------|
| Sale ID          | Truncated UUID (first 8 chars), copy-on-click   | No       |
| Client           | Client name, linked to client detail page       | Yes      |
| Brand            | Brand name                                      | No       |
| Status           | `SaleStatusBadge` component                     | Yes      |
| Total Amount     | Formatted currency (e.g., $5,000.00)            | Yes      |
| Discounted Total | Shown only if `discountedTotal` is not null     | No       |
| Payment Plan     | ONE_TIME / INSTALLMENTS / SUBSCRIPTION chip     | No       |
| Created Date     | Formatted date (e.g., Mar 17, 2026)             | Yes      |
| Actions          | Dropdown: View, Edit (role-gated), Archive (role-gated) | No  |

Row click navigates to `/sales/:id`.

### 3. Create `SalesFilters` Component

**File:** `apps/frontend/components/sales/SalesFilters.tsx`

Filter controls:

| Filter        | Control Type                    | Query Param   |
|---------------|---------------------------------|---------------|
| Status        | Multi-select checkbox dropdown  | `status[]`    |
| Brand         | Single select dropdown          | `brandId`     |
| Client        | Search input with autocomplete  | `clientId`    |
| Date From     | Date picker                     | `dateFrom`    |
| Date To       | Date picker                     | `dateTo`      |
| Search        | Text input (debounced 300ms)    | `search`      |

Filter state is persisted in URL query params using `useRouter` and `useSearchParams` (or equivalent). When filters change, the URL updates and the query refetches.

A "Clear Filters" button resets all filter params.

### 4. Create `SaleStatusBadge` Component

**File:** `apps/frontend/components/sales/SaleStatusBadge.tsx`

Color mapping:

| Status    | Badge Color     |
|-----------|-----------------|
| DRAFT     | Gray            |
| PENDING   | Yellow          |
| ACTIVE    | Blue            |
| COMPLETED | Green           |
| ON_HOLD   | Orange          |
| CANCELLED | Red             |
| REFUNDED  | Purple          |

Use the project's existing `Badge` or `Tag` component if one exists. Do not create a new design-system primitive.

### 5. API Integration with React Query

**File:** `apps/frontend/hooks/sales/useSalesList.ts`

```typescript
import { useQuery } from '@tanstack/react-query';

export function useSalesList(params: QuerySalesParams) {
  return useQuery({
    queryKey: ['sales', 'list', params],
    queryFn: () => fetchSalesList(params),
    staleTime: 30_000,
    keepPreviousData: true,  // prevents flash on page change
  });
}
```

The `fetchSalesList()` function calls `GET /api/sales` with the query params serialized. Use the project's existing API client/axios instance.

### 6. Create API Client Function

**File:** `apps/frontend/api/sales.api.ts` (or add to existing API file)

```typescript
export async function fetchSalesList(
  params: QuerySalesParams,
): Promise<PaginatedResponse<ISale>> {
  const queryString = buildQueryString(params);  // serialize with array support for status[]
  const response = await apiClient.get(`/sales?${queryString}`);
  return response.data;
}
```

### 7. Implement Loading Skeleton

Use the project's existing `Skeleton` component. Show skeleton rows (typically 5–10) while the query is loading.

### 8. Implement Empty State

When `data.data.length === 0` and no filters are active: show a centered "No sales yet" message with a "Create your first sale" button (role-gated).

When `data.data.length === 0` and filters are active: show "No sales match the current filters" with a "Clear Filters" button.

### 9. Implement Error State

When the query errors: show an error card with the error message and a "Retry" button that calls `refetch()`.

### 10. Pagination

Show page size selector (10 / 25 / 50) and page navigation (prev/next + page numbers). Page and limit state are stored in URL query params (`page`, `limit`).

---

## Component Tree

```
SalesListPage
├── PageHeader (title "Sales", "New Sale" button)
├── RevenueSummaryCards (SM-FE-002 — rendered here)
├── InvoiceOverviewWidget (SM-FE-003 — rendered here)
├── SalesFilters
│   ├── StatusMultiSelect
│   ├── BrandSelect
│   ├── ClientSearch
│   ├── DateRangePicker
│   └── SearchInput
├── SalesTable
│   ├── TableHeader (with sort controls)
│   ├── TableBody
│   │   └── SaleRow (per sale)
│   │       ├── SaleStatusBadge
│   │       └── ActionsDropdown
│   ├── LoadingSkeleton (conditional)
│   └── EmptyState (conditional)
└── SalesPagination
    ├── PageSizeSelector
    └── PageNavigator
```

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

### `GET /sales` Query Parameters

| Param      | Type       | Description                           |
|------------|------------|---------------------------------------|
| `status`   | string[]   | Filter by one or more statuses        |
| `brandId`  | string     | Filter by brand                       |
| `clientId` | string     | Filter by client                      |
| `dateFrom` | ISO string | Filter by `createdAt >= dateFrom`     |
| `dateTo`   | ISO string | Filter by `createdAt <= dateTo`       |
| `search`   | string     | Search in description and client name |
| `page`     | number     | Page number (1-indexed)               |
| `limit`    | number     | Page size (10, 25, or 50)             |

### `GET /sales` Response

```json
{
  "data": [
    {
      "id": "sale_abc",
      "status": "ACTIVE",
      "totalAmount": 5000.00,
      "discountedTotal": 4500.00,
      "paymentPlan": "ONE_TIME",
      "clientId": "cl_xyz",
      "brandId": "br_123",
      "createdAt": "2026-03-17T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "pages": 5
  }
}
```

---

## Acceptance Criteria

1. Navigating to the sales list route renders the `SalesListPage` without errors.
2. Sales are displayed in the table with all required columns populated.
3. `SaleStatusBadge` shows the correct color for each status.
4. Selecting a status filter updates the URL query param and re-fetches with the status filter applied.
5. Typing in the search input triggers a re-fetch after 300ms debounce.
6. Clearing all filters removes filter query params from the URL and re-fetches the full list.
7. Clicking a row navigates to `/sales/:id`.
8. Page size selector changes the `limit` param and re-fetches.
9. Pagination next/prev buttons update the `page` param.
10. Loading state shows skeleton rows while query is pending.
11. Error state shows an error card with a retry button.
12. Empty state shows appropriate message when no results.
13. The "New Sale" button is visible to OWNER, ADMIN, SALES_MANAGER, FRONTSELL_AGENT, UPSELL_AGENT but NOT to PROJECT_MANAGER.
14. The "Edit" action in the row actions dropdown is hidden for PROJECT_MANAGER.
15. The "Archive" action is hidden for all roles except OWNER and ADMIN.
16. Refreshing the page with filter params in the URL correctly re-applies the filters.
17. `keepPreviousData: true` prevents the table from going blank while paginating.

---

## Edge Cases

1. **Extremely long client name:** Truncate with ellipsis in the Client column.
2. **`discountedTotal` is null:** Hide the Discounted Total column entirely for that row (or show `—`).
3. **Sale with no brand:** Brand column shows `—`.
4. **Large pagination total (e.g., 10,000 sales):** Show abbreviated page count ("... 998 999 1000").
5. **Multiple status filters selected:** URL includes `status[]=DRAFT&status[]=PENDING`. The query serializer must handle arrays correctly.
6. **`dateFrom` after `dateTo`:** Client-side validation must prevent this before submitting.
7. **Browser back button:** Filter state in URL params ensures back navigation works correctly.

---

## Dependencies

- All SM-BE-001 through SM-BE-008 tickets for stable `GET /sales` API.
- Existing design system components (Badge, Skeleton, Pagination, Dropdown).
- Existing API client/axios instance for HTTP calls.
- TanStack Query installed and configured.
- User role available in auth context/store.

---

## Testing Requirements

### Unit Tests

**File:** `apps/frontend/components/sales/__tests__/SaleStatusBadge.test.tsx`

- Test each status renders the correct color class.

**File:** `apps/frontend/components/sales/__tests__/SalesFilters.test.tsx`

- Test that selecting a status option updates the URL query param.
- Test that the search input is debounced (advance timers by 300ms in test).
- Test "Clear Filters" resets all params.

**File:** `apps/frontend/hooks/sales/__tests__/useSalesList.test.ts`

- Test that the query key includes all filter params.
- Test that `keepPreviousData` is enabled.

### Integration / E2E Tests

- Load the sales list page. Verify table renders with data from mocked API.
- Apply a status filter. Verify the API is called with the `status` param.
- Clear filters. Verify the API is called without filter params.
- Click a row. Verify navigation to `/sales/:id`.

### Manual QA Checks

- [ ] Open the sales list page. Confirm data loads and all columns are present.
- [ ] Apply each filter type and confirm the API request includes the correct params.
- [ ] Confirm the URL updates when filters change.
- [ ] Paste a filtered URL into a new tab and confirm filters are applied.
- [ ] Log in as PROJECT_MANAGER. Confirm "New Sale" button is not visible.
- [ ] Log in as FRONTSELL_AGENT. Confirm the agent sees only their scoped sales.
- [ ] Test pagination at page size 10, 25, and 50.
- [ ] Test empty state by filtering with a non-matching search term.

---

## Verification Steps

- [ ] `SalesListPage` component exists at correct route.
- [ ] `SalesTable` renders all required columns.
- [ ] `SalesFilters` persists filter state in URL query params.
- [ ] `SaleStatusBadge` renders correct color per status.
- [ ] Search input is debounced 300ms.
- [ ] Loading skeleton renders while query is pending.
- [ ] Empty state renders when no results.
- [ ] Error state renders when query fails.
- [ ] Pagination controls update URL params.
- [ ] Role-based action visibility correct (New Sale, Edit, Archive).
- [ ] All unit tests pass.
- [ ] No TypeScript errors.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No backend changes.** Rollback is simply reverting the frontend component files.
- **Risk: URL state management conflicts.** If the project uses a global state manager (Redux, Zustand) AND URL params for the same filter state, there may be sync conflicts. Prefer URL params as the single source of truth for filter state.
