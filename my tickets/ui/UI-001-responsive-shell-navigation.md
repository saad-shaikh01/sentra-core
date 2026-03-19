# UI-001 - Responsive Shell Navigation

| Field | Value |
|---|---|
| Ticket ID | UI-001 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 1 day |
| Depends On | None |

## Purpose

The sales dashboard shell is currently desktop-first. This ticket establishes a mobile-safe app frame so every later route inherits correct spacing, scrolling, and navigation behavior.

## User Outcome

- Mobile users can open, close, and navigate the dashboard without the sidebar blocking the app.
- The app shell stops creating page-level horizontal overflow.
- Top navigation remains useful on smaller screens without wasting space.

## Exact Scope

### In Scope

1. Responsive dashboard shell behavior in `apps/frontend/sales-dashboard/src/app/dashboard/layout.tsx`.
2. Mobile sidebar drawer behavior in `apps/frontend/sales-dashboard/src/components/sidebar.tsx`.
3. Mobile top-nav behavior in `apps/frontend/sales-dashboard/src/components/top-nav.tsx`.
4. Sidebar state defaults and breakpoint behavior in `apps/frontend/sales-dashboard/src/stores/ui-store.ts`.
5. Shell spacing updates that affect all dashboard routes.

### Out Of Scope

1. Page-level table, form, or drawer redesign.
2. Leads-specific mobile UX beyond shell behavior.
3. Inbox-specific mobile redesign beyond the shell itself.

## Target Files

- `apps/frontend/sales-dashboard/src/app/dashboard/layout.tsx`
- `apps/frontend/sales-dashboard/src/components/sidebar.tsx`
- `apps/frontend/sales-dashboard/src/components/top-nav.tsx`
- `apps/frontend/sales-dashboard/src/stores/ui-store.ts`

## Implementation Tasks

1. Replace permanent mobile sidebar behavior with an overlay drawer pattern below the desktop breakpoint.
2. Ensure the sidebar defaults to closed on mobile and does not reserve layout width when hidden.
3. Add a clear mobile menu trigger in the top nav.
4. Reduce shell paddings on small screens while preserving current desktop density.
5. Revisit `h-screen` and `overflow-hidden` usage so nested route content can scroll naturally on mobile browsers.
6. Make the top nav adapt on smaller screens:
   - breadcrumb text should truncate or simplify
   - desktop-only search trigger should not consume layout width on mobile
   - action controls should remain reachable and not wrap awkwardly
7. Ensure route changes and backdrop clicks close the mobile drawer.

## Acceptance Criteria

1. On widths below desktop, the sidebar behaves like a modal drawer with backdrop and does not permanently occupy space.
2. On desktop widths, the current expanded and collapsed sidebar behavior still works.
3. The main content container uses mobile-safe horizontal padding and does not force overflow on narrow screens.
4. `dashboard`, `sales`, `leads`, `clients`, `invoices`, and `inbox` all load without shell-level clipping or horizontal page scroll.
5. The top nav remains usable at 360px and 390px widths.

## Testing Requirements

1. Manual verification on 360, 390, 768, and 1280 widths.
2. Verify that opening the sidebar, navigating to a route, and returning does not leave the UI in a broken state.
3. Verify sticky top-nav behavior while scrolling long pages.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-001-responsive-shell-navigation.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Make the dashboard shell responsive first.
- Update only shell/navigation/state files that are directly required for this ticket.
- Keep desktop behavior intact unless the ticket requires a mobile change.
- Do not start page-specific table, modal, leads, or inbox redesign work from later tickets.

Deliverables:
- Responsive dashboard shell with mobile drawer sidebar.
- Mobile-safe top nav and shell spacing.
- Manual verification notes for 360, 390, 768, and 1280 widths.

Before finishing:
- Confirm there is no shell-caused page overflow on `dashboard`, `sales`, `leads`, `clients`, `invoices`, and `inbox`.
- Summarize changed files and any remaining risks that belong to later tickets.
```
