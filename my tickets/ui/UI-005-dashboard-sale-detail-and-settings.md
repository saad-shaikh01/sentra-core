# UI-005 - Dashboard Sale Detail And Settings

| Field | Value |
|---|---|
| Ticket ID | UI-005 |
| Priority | P1 - High |
| Status | [ ] Not Started |
| Estimate | 1.5 days |
| Depends On | UI-003, UI-004 |

## Purpose

After the shell, shared primitives, lists, and overlays are responsive, the remaining high-traffic dashboard surfaces still need targeted polish. This ticket covers the analytics dashboard, full sale detail page, settings pages, and small global UI items that still carry desktop assumptions.

## User Outcome

- The dashboard overview remains readable on phones and tablets.
- Sale detail pages become usable without desktop-only column assumptions.
- Settings pages stop breaking due to hardcoded grids and fixed widths.

## Exact Scope

### In Scope

1. Dashboard overview page.
2. Full sale detail page and its major sections.
3. Settings pages under `dashboard/settings`.
4. Small global responsive polish items such as app switcher and toast placement.

### Out Of Scope

1. Leads main route and kanban behavior.
2. Inbox route redesign.
3. Shared list/table foundation changes that belong to earlier tickets.

## Target Files

- `apps/frontend/sales-dashboard/src/app/dashboard/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/[id]/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/[id]/_components/*`
- `apps/frontend/sales-dashboard/src/app/dashboard/settings/**/*.tsx`
- `apps/frontend/sales-dashboard/src/components/app-switcher.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/toaster.tsx`
- `apps/frontend/sales-dashboard/src/components/ui/toast.tsx`

## Implementation Tasks

1. Make dashboard KPI cards, charts, and summary sections stack and scale well on mobile.
2. Refactor full sale detail page columns so side panels and main content reorder or stack correctly.
3. Ensure sale detail tables and financial sub-sections remain readable on narrow widths.
4. Audit settings pages for hardcoded `grid-cols-2`, `sm:grid-cols-3`, fixed widths, and oversized containers.
5. Make app switcher and toast placement adapt cleanly to small screens.
6. Keep desktop information density intact where practical.

## Acceptance Criteria

1. `/dashboard` works cleanly at 360, 390, 768, and desktop widths.
2. `/dashboard/sales/[id]` stacks or reflows intelligently and does not trap content off-screen.
3. `dashboard/settings` routes in active use remain readable and actionable on mobile.
4. Small global components in scope do not create viewport collisions on phones.

## Testing Requirements

1. Manual verification on `dashboard`, one real sale detail page, and each settings area touched.
2. Verify charts, status panels, and tables remain readable at 390px width.
3. Verify toast and app switcher do not overlap other controls on small screens.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-005-dashboard-sale-detail-and-settings.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Focus on dashboard overview, full sale-detail page, settings pages, and the small global polish items listed in the ticket.
- Preserve current desktop hierarchy while making mobile layouts intentional and readable.
- Do not start leads-specific or inbox-specific redesign work from later tickets.

Deliverables:
- Responsive dashboard overview.
- Responsive full sale-detail route.
- Responsive settings pages and small global polish items in scope.

Before finishing:
- Verify touched routes on 360, 390, 768, and 1280 widths.
- Summarize any remaining route-specific issues that belong to UI-006 or UI-007.
```
