# UI Responsive - Execution Order

Do not start a later ticket until the current ticket is verified. Each ticket already contains a copy-paste execution prompt for Gemini in its own `## Execution Prompt` section.

## Rules For Implementation Agents

1. Read the full ticket before editing code.
2. Implement one ticket at a time. Do not bundle multiple tickets into one pass.
3. Preserve current desktop behavior unless the ticket explicitly allows redesign.
4. Reuse existing components, hooks, and styling patterns where possible.
5. Run route-specific manual viewport checks before closing the ticket.
6. Record any scope deviation inside the ticket file before continuing.

## Viewport Matrix

Check every ticket on these widths unless the ticket says otherwise:

- 320
- 360
- 375
- 390
- 430
- 768
- 1024
- 1280

## Step 1 - UI-001

**File:** `my tickets/ui/UI-001-responsive-shell-navigation.md`
**Do:** Make the dashboard shell, sidebar, and top nav mobile-safe first.
**Why first:** Every route depends on shell spacing, overflow behavior, and mobile navigation.
**Gate:** No page-level horizontal overflow caused by the shell on `dashboard`, `sales`, `leads`, `clients`, `invoices`, and `inbox`.

## Step 2 - UI-002

**File:** `my tickets/ui/UI-002-shared-responsive-primitives.md`
**Depends on:** UI-001
**Do:** Upgrade shared header, filter, table, and pagination primitives so page-level work can reuse them.
**Gate:** Shared primitives support mobile layouts without route-specific hacks for every page.

## Step 3 - UI-003

**File:** `my tickets/ui/UI-003-mobile-list-pages.md`
**Depends on:** UI-002
**Do:** Apply the new primitives to brands, clients, invoices, sales list, teams, and team-members surfaces.
**Gate:** All list pages remain usable on phones without relying on unreadable dense desktop tables.

## Step 4 - UI-004

**File:** `my tickets/ui/UI-004-responsive-sheets-and-modals.md`
**Depends on:** UI-002
**Do:** Make shared dialogs, sheets, and read-only detail panels responsive.
**Gate:** Sheets and dialogs are fully usable on small screens, including headers, close actions, tabs, and scroll regions.

## Step 5 - UI-005

**File:** `my tickets/ui/UI-005-dashboard-sale-detail-and-settings.md`
**Depends on:** UI-003, UI-004
**Do:** Finish dashboard overview, sale detail page, settings pages, and small global polish items.
**Gate:** Analytics, sale detail, and settings routes all pass the viewport matrix without clipped content.

## Step 6 - UI-006

**File:** `my tickets/ui/UI-006-leads-mobile-experience.md`
**Depends on:** UI-001, UI-002, UI-004
**Do:** Give leads its own mobile interaction model, including filters, forms, and kanban fallback.
**Gate:** Leads page feels intentionally mobile-friendly, not just shrunken desktop UI.

## Step 7 - UI-007

**File:** `my tickets/ui/UI-007-inbox-mobile-experience.md`
**Depends on:** UI-001, UI-002, UI-004
**Do:** Convert inbox into a mobile master-detail flow and make compose/reply usable on phones.
**Gate:** Inbox can be fully used on a 390px-wide viewport for search, read, reply, and compose.

## Step 8 - UI-008

**File:** `my tickets/ui/UI-008-responsive-qa-and-regression.md`
**Depends on:** UI-003 through UI-007
**Do:** Run a responsive QA sweep, fix remaining inconsistencies, and add or update regression coverage where justified.
**Gate:** The full route matrix passes manual verification, and any automated coverage added for critical responsive regressions passes.

## Ticket Index

1. `my tickets/ui/UI-001-responsive-shell-navigation.md`
2. `my tickets/ui/UI-002-shared-responsive-primitives.md`
3. `my tickets/ui/UI-003-mobile-list-pages.md`
4. `my tickets/ui/UI-004-responsive-sheets-and-modals.md`
5. `my tickets/ui/UI-005-dashboard-sale-detail-and-settings.md`
6. `my tickets/ui/UI-006-leads-mobile-experience.md`
7. `my tickets/ui/UI-007-inbox-mobile-experience.md`
8. `my tickets/ui/UI-008-responsive-qa-and-regression.md`
