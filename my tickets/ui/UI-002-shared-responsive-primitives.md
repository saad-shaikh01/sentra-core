# UI-002 - Shared Responsive Primitives

| Field | Value |
|---|---|
| Ticket ID | UI-002 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 1 day |
| Depends On | UI-001 |

## Purpose

The dashboard relies on shared primitives for page headers, filter bars, data tables, and pagination. Those primitives currently favor desktop layouts. This ticket creates reusable responsive behavior so later page tickets do not solve the same problem repeatedly.

## User Outcome

- Page headers and actions stack cleanly on mobile.
- Filter controls can be used without crushed fixed-width inputs.
- List views have a consistent mobile treatment instead of unreadable desktop tables.

## Exact Scope

### In Scope

1. `PageHeader` responsiveness.
2. `FilterBar` responsiveness.
3. `DataTable` mobile strategy.
4. `Pagination` responsiveness.
5. Any minimal helper props or utility changes needed to support later page tickets.

### Out Of Scope

1. Route-specific business logic changes.
2. Sheet and dialog system changes.
3. Inbox and leads-specific interaction redesign.

## Target Files

- `apps/frontend/sales-dashboard/src/components/shared/page-header.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/filter-bar.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/data-table.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/pagination.tsx`

## Implementation Tasks

1. Make `PageHeader` stack title, description, and actions cleanly on small screens.
2. Make `FilterBar` support narrow layouts:
   - controls should stack or wrap with predictable spacing
   - common fixed-width inputs should be able to expand to full width on mobile
3. Upgrade `Pagination` so label text and controls wrap without collision.
4. Introduce a consistent mobile strategy for shared tables. Acceptable options:
   - card/list fallback below a breakpoint
   - priority columns with hidden secondary data
   - a configurable responsive row renderer
5. Keep the desktop table experience stable.
6. Avoid hardcoding route-specific labels or business assumptions into shared primitives.

## Acceptance Criteria

1. Shared page headers no longer overflow when actions contain multiple buttons.
2. Shared filter areas remain usable at 360px wide without clipped controls.
3. Shared data tables support a mobile-friendly rendering mode that later tickets can adopt.
4. Shared pagination remains readable and clickable on phones.
5. Existing desktop routes do not regress visually.

## Testing Requirements

1. Smoke-check at least one route that uses each primitive after the changes.
2. Verify `sales`, `clients`, and `invoices` still render correctly on desktop.
3. Verify no console errors from newly added props or conditional rendering.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-002-shared-responsive-primitives.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Upgrade shared header, filter, table, and pagination primitives for responsive behavior.
- Keep changes generic and reusable. Do not solve page-specific layout issues inside shared components unless the API remains clean.
- Do not start drawer, modal, leads, inbox, or route-specific redesign work from later tickets.

Deliverables:
- Responsive shared primitives ready for list-page adoption.
- A clear mobile strategy in `DataTable` that later pages can plug into.

Before finishing:
- Verify `sales`, `clients`, and `invoices` still look correct on desktop.
- Summarize any follow-up changes that must happen in consuming pages.
```
