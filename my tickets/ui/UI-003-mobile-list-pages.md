# UI-003 - Mobile List Pages

| Field | Value |
|---|---|
| Ticket ID | UI-003 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 1.5 days |
| Depends On | UI-002 |

## Purpose

Most main dashboard list pages are only comfortable on desktop today. This ticket applies the shared responsive foundation to the core management routes so the app becomes usable on phones for day-to-day list workflows.

## User Outcome

- Users can filter, scan, and act on brands, clients, invoices, sales, and teams from mobile devices.
- Tables no longer feel like shrunken desktop screens.
- Page-level controls stop relying on fixed-width inputs that break narrow viewports.

## Exact Scope

### In Scope

1. Brands list page.
2. Clients list page.
3. Invoices list page.
4. Sales list page, including summary widgets on that route.
5. Teams list page and team members table surfaces.
6. Page-level adoption of the responsive header, filter, table, and pagination primitives.

### Out Of Scope

1. Leads route.
2. Inbox route.
3. Shared drawer or modal foundation changes.
4. Full sale detail page and global dashboard overview.

## Target Files

- `apps/frontend/sales-dashboard/src/app/dashboard/brands/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/clients/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/invoices/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/_components/revenue-summary-cards.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/_components/invoice-overview-widget.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/teams/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/teams/_components/team-filter-bar.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/teams/_components/team-members-table.tsx`

## Implementation Tasks

1. Convert fixed-width filter controls on list pages into mobile-safe layouts.
2. Ensure page header action groups wrap or stack correctly on small screens.
3. Adopt the new table mobile strategy from UI-002 across brands, clients, invoices, and sales.
4. Make sales summary widgets readable on narrow widths.
5. Refactor teams-specific dense grid/table patterns into a mobile-friendly fallback.
6. Keep route logic, hooks, and permissions intact while changing presentation.

## Acceptance Criteria

1. `/dashboard/brands` is usable on 360px without horizontal page overflow.
2. `/dashboard/clients` is usable on 360px and client rows remain legible.
3. `/dashboard/invoices` keeps filter controls usable and rows readable on phones.
4. `/dashboard/sales` supports filters, widgets, table/list rendering, and action buttons on mobile.
5. `/dashboard/teams` and member lists have a readable mobile pattern instead of dense desktop columns.

## Testing Requirements

1. Manual verification on 360, 390, 768, and 1280 widths for each route in scope.
2. Verify interactive filters still update query state correctly.
3. Verify row click or action button behavior still works after responsive rendering changes.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-003-mobile-list-pages.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Apply the responsive shared primitives from UI-002 to the list-heavy dashboard routes.
- Focus on brands, clients, invoices, sales list, and teams only.
- Keep route logic and API behavior unchanged.
- Do not start drawer/modal foundation work, leads-specific redesign, inbox redesign, or full sale-detail/settings work from later tickets.

Deliverables:
- Mobile-friendly list pages for the routes in scope.
- Summary widgets on the sales list route that still read well on phones.

Before finishing:
- Verify each route in scope on 360, 390, 768, and 1280 widths.
- Summarize any residual issues that belong to UI-004, UI-005, UI-006, or UI-007.
```
