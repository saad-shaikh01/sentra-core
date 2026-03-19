# UI Responsive — UI-001 through UI-008

You are implementing mobile responsiveness for `apps/frontend/sales-dashboard` across 8 sequential
tickets. Each ticket must be fully completed and verified before the next begins.

## Global Rules (apply to every subagent)

1. READ the full ticket file before writing a single line of code.
2. Preserve all existing desktop behavior — only add mobile behavior unless a ticket explicitly allows redesign.
3. Reuse existing components, hooks, and styling. Do not invent parallel patterns.
4. Keep business logic, permissions, API calls, and query keys untouched.
5. After finishing each ticket run: `cd apps/frontend/sales-dashboard && npx tsc --noEmit`
6. If tsc fails, fix it before reporting done.

## Viewport Matrix (manual check required per ticket)

320 / 360 / 375 / 390 / 430 / 768 / 1024 / 1280

---

## SUBAGENT 1 — UI-001: Responsive Shell Navigation

READ `my tickets/ui/UI-001-responsive-shell-navigation.md` fully first.

### Target files
- `src/app/dashboard/layout.tsx`
- `src/components/sidebar.tsx`
- `src/components/top-nav.tsx`
- `src/stores/ui-store.ts`

### What to do
1. Replace permanent sidebar with an overlay drawer below the desktop breakpoint (e.g., `lg:`).
   The sidebar must NOT reserve layout width when hidden on mobile.
2. Default sidebar state to closed on mobile (`ui-store.ts`).
3. Add a hamburger/menu button in top-nav that opens the mobile drawer.
4. Add a backdrop behind the mobile drawer; clicking it closes the drawer.
5. Route changes must also close the mobile drawer.
6. Reduce shell padding on small screens while keeping current desktop padding.
7. Fix `h-screen` / `overflow-hidden` so nested route content can scroll naturally on mobile browsers.
8. Top nav at 360px: breadcrumb truncates, search trigger hidden or icon-only, action buttons stay reachable and don't wrap.

### Acceptance gate
- Sidebar behaves as modal drawer on mobile, unchanged collapsed/expanded behavior on desktop.
- `dashboard`, `sales`, `leads`, `clients`, `invoices`, `inbox` — no horizontal page scroll caused by the shell.
- Top nav usable at 360 and 390.

### Report
  ✅ UI-001 COMPLETE
  - Changed files: <list>
  - tsc --noEmit passes ✓
  - Manual check notes for 360 / 390 / 768 / 1280
  - Deviations: <list or "none">

---

## SUBAGENT 2 — UI-002: Shared Responsive Primitives

**Depends on UI-001 being done.**

READ `my tickets/ui/UI-002-shared-responsive-primitives.md` fully first.

### Target files
- `src/components/shared/page-header.tsx`
- `src/components/shared/filter-bar.tsx`
- `src/components/shared/data-table.tsx`
- `src/components/shared/pagination.tsx`

### What to do
1. `PageHeader`: title, description, and action buttons stack cleanly on small screens. Action groups
   should not overflow or require horizontal scroll.
2. `FilterBar`: controls wrap or stack with predictable spacing. Fixed-width inputs must be able to
   expand to full width on mobile.
3. `DataTable`: introduce a consistent mobile strategy. Pick one of:
   - Card/list fallback below a breakpoint (recommended)
   - Priority columns with hidden secondary columns below breakpoint
   - Configurable responsive row renderer prop
   Keep the desktop table layout completely stable.
4. `Pagination`: labels and page controls wrap without collision on narrow widths.
5. Do NOT hardcode route-specific labels or business data into shared primitives.
6. Avoid breaking any existing prop APIs — only add new optional props if needed.

### Acceptance gate
- Shared page headers do not overflow when actions contain multiple buttons.
- Shared filter areas usable at 360px.
- DataTable has a working mobile mode that later tickets can adopt.
- Pagination readable and clickable on phones.
- `sales`, `clients`, `invoices` still render correctly on desktop (smoke check).

### Report
  ✅ UI-002 COMPLETE
  - Changed files: <list>
  - DataTable mobile strategy chosen: <describe>
  - tsc --noEmit passes ✓
  - Deviations: <list or "none">

---

## SUBAGENT 3 — UI-003: Mobile List Pages

**Depends on UI-002 being done.**

READ `my tickets/ui/UI-003-mobile-list-pages.md` fully first.

### Target files
- `src/app/dashboard/brands/page.tsx`
- `src/app/dashboard/clients/page.tsx`
- `src/app/dashboard/invoices/page.tsx`
- `src/app/dashboard/sales/page.tsx`
- `src/app/dashboard/sales/_components/revenue-summary-cards.tsx`
- `src/app/dashboard/sales/_components/invoice-overview-widget.tsx`
- `src/app/dashboard/teams/page.tsx`
- `src/app/dashboard/teams/_components/team-filter-bar.tsx`
- `src/app/dashboard/teams/_components/team-members-table.tsx`

### What to do
1. Brands, clients, invoices, sales list, teams pages: adopt the responsive `PageHeader`, `FilterBar`,
   and `DataTable` mobile strategy from UI-002. Convert any inline fixed-width filter controls.
2. Sales summary widgets (`revenue-summary-cards`, `invoice-overview-widget`): stack/reflow on narrow
   widths. Numbers and labels must remain legible at 360px.
3. Teams filter bar and members table: replace dense desktop columns with the mobile table strategy.
4. Page-level action groups: wrap or stack correctly without overflowing.
5. Keep all query state, hooks, permissions, and row click/action behavior exactly as-is.

### Do NOT touch
- Leads route (UI-006)
- Inbox route (UI-007)
- Shared drawer/modal foundation (UI-004)
- Full sale detail page (UI-005)

### Acceptance gate
Each route usable at 360px with no horizontal page overflow:
- `/dashboard/brands` ✓
- `/dashboard/clients` ✓
- `/dashboard/invoices` ✓
- `/dashboard/sales` ✓
- `/dashboard/teams` ✓

### Report
  ✅ UI-003 COMPLETE
  - Changed files: <list>
  - tsc --noEmit passes ✓
  - Manual check notes for 360 / 390 / 768 / 1280 on each route
  - Deviations: <list or "none">

---

## SUBAGENT 4 — UI-004: Responsive Sheets and Modals

**Depends on UI-002 being done.**

READ `my tickets/ui/UI-004-responsive-sheets-and-modals.md` fully first.

### Target files
- `src/components/shared/detail-sheet.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/shared/form-modal.tsx`
- `src/components/shared/confirm-modal.tsx`
- `src/app/dashboard/sales/_components/sale-detail-sheet.tsx`
- `src/app/dashboard/clients/_components/client-detail-sheet.tsx`
- `src/app/dashboard/leads/_components/lead-detail-sheet.tsx`
- `src/app/dashboard/invoices/_components/invoice-detail-sheet.tsx`
- `src/components/my-sessions-modal.tsx`

### What to do
1. `DetailSheet`: full-width or near-full-width on small screens. Safe scroll padding, header always
   visible, close button always reachable. Tab rows inside sheets wrap or scroll horizontally without
   clipping. Grid-cols-2 detail sections stack on mobile.
2. `dialog.tsx` (Radix): viewport-safe max-height, mobile-friendly width + padding, long content
   scrolls inside the dialog (not the page).
3. `form-modal.tsx` / `confirm-modal.tsx`: readable and actionable on both mobile and desktop.
4. Detail sheets (sale, client, lead, invoice): fix any dense column grids, clipped metadata rows,
   or floating actions that go off-screen on narrow widths.
5. `my-sessions-modal.tsx`: ensure it fits the viewport on phones.

### Do NOT touch
- Route-specific create/edit form field redesign beyond what is needed for modal safety.
- Leads kanban and leads page layout.
- Inbox route.

### Acceptance gate
- Sales, clients, leads, invoice detail sheets fully usable at 360px and 390px.
- Dialogs no longer overflow the viewport on phones.
- Backdrop click, keyboard close, and scroll-inside behavior all still work.

### Report
  ✅ UI-004 COMPLETE
  - Changed files: <list>
  - tsc --noEmit passes ✓
  - Manual check notes for 360 / 390 / 768 / 1280
  - Deviations: <list or "none">

---

## SUBAGENT 5 — UI-005: Dashboard, Sale Detail, and Settings

**Depends on UI-003 AND UI-004 being done.**

READ `my tickets/ui/UI-005-dashboard-sale-detail-and-settings.md` fully first.

### Target files
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/sales/[id]/page.tsx`
- `src/app/dashboard/sales/[id]/_components/*` (all components in this folder)
- `src/app/dashboard/settings/**/*.tsx` (all settings pages)
- `src/components/app-switcher.tsx`
- `src/components/shared/toaster.tsx`
- `src/components/ui/toast.tsx`

### What to do
1. Dashboard overview (`page.tsx`): KPI cards, charts, and summary sections stack/scale cleanly at
   mobile widths. No clipped charts or overflowing stat rows.
2. Sale detail page (`sales/[id]`): side panels and main content reorder or stack. Sub-tables and
   financial sections (items, invoices, transactions, subscriptions) remain readable at 360px.
3. Settings pages: audit for hardcoded `grid-cols-2`, `sm:grid-cols-3`, fixed widths, and oversized
   containers. All active settings pages must be readable and actionable on phones.
4. `app-switcher.tsx`: adapts to small screens, no viewport collision.
5. Toast: positioned correctly and not covering key controls on phones.

### Do NOT touch
- Leads route.
- Inbox route.
- Shared list/table foundation already handled in earlier tickets.

### Acceptance gate
- `/dashboard` works at 360 / 390 / 768 / 1280.
- `/dashboard/sales/[id]` stacks/reflows without trapping content off-screen.
- Settings pages readable and actionable on mobile.

### Report
  ✅ UI-005 COMPLETE
  - Changed files: <list>
  - tsc --noEmit passes ✓
  - Manual check notes for 360 / 390 / 768 / 1280
  - Deviations: <list or "none">

---

## SUBAGENT 6 — UI-006: Leads Mobile Experience

**Depends on UI-001, UI-002, UI-004 being done.**

READ `my tickets/ui/UI-006-leads-mobile-experience.md` fully first.

### Target files
- `src/app/dashboard/leads/page.tsx`
- `src/app/dashboard/leads/_components/leads-table.tsx`
- `src/app/dashboard/leads/_components/leads-kanban.tsx`
- `src/app/dashboard/leads/_components/leads-kanban-card.tsx`
- `src/app/dashboard/leads/_components/lead-form-modal.tsx`
- `src/app/dashboard/leads/_components/lead-import-modal.tsx`
- `src/app/dashboard/leads/_components/convert-lead-modal.tsx`
- `src/app/dashboard/leads/_components/lead-detail-sheet.tsx`

### What to do
1. Leads page header and view toggle: action cluster wraps or reorganizes on mobile without overflow.
2. Filters: replace the dense fixed-width filter row with a mobile-safe pattern. Acceptable options:
   - Stacked controls below a breakpoint
   - Collapsible filter tray (toggle button reveals filters)
   Keep desktop filter row unchanged.
3. Leads table: adopt the DataTable mobile strategy from UI-002.
4. Kanban on mobile — choose a deliberate model (NOT just 6 squashed columns):
   - Horizontally swipeable columns with snap behavior, OR
   - One-column view with a lane selector at the top
   Desktop kanban must remain completely intact.
5. Lead form modal, import modal, convert modal: stack fields/sections, keep primary CTA visible,
   no overflow at 390px.
6. Lead detail sheet: verify the UI-004 sheet changes apply correctly; fix any leads-specific layout
   issues (floating action panels, status buttons, dense grids).

### Do NOT touch
- Inbox route.
- Shared sheet foundation (already done in UI-004).
- Non-leads pages.

### Acceptance gate
- `/dashboard/leads` fully usable at 390px: search, filter, view toggle, open detail, create lead.
- Kanban intentionally usable on mobile (not a shrunken desktop).
- Lead create, edit, import, convert flows are practical on narrow screens.

### Report
  ✅ UI-006 COMPLETE
  - Changed files: <list>
  - Kanban mobile model chosen: <describe>
  - tsc --noEmit passes ✓
  - Manual check notes for 360 / 390 / 768 / 1280
  - Deviations: <list or "none">

---

## SUBAGENT 7 — UI-007: Inbox Mobile Experience

**Depends on UI-001, UI-002, UI-004 being done.**

READ `my tickets/ui/UI-007-inbox-mobile-experience.md` fully first.

### Target files
- `src/app/dashboard/inbox/page.tsx`
- `src/components/shared/comm/compose-drawer.tsx`
- `src/components/shared/comm/thread-view-drawer.tsx`
- `src/components/shared/comm/entity-email-timeline.tsx` (only if directly impacted)

### What to do
1. Inbox layout: replace the desktop split-pane assumption with a mobile master-detail flow.
   On mobile: thread list visible by default → tap thread → thread detail slides in or replaces.
   On desktop: preserve the existing split-pane productivity layout.
2. Thread list on mobile: search and filters compact, rows legible.
3. Thread detail: metadata rows wrap correctly, no clipped content.
4. Compose drawer: full-screen or near-full-screen on mobile. Reply controls, attachment chips, and
   action buttons must be reachable.
5. Forward and reply flows: same mobile-safe treatment.

### Do NOT touch
- Non-inbox dashboard routes.
- Generic shell (done in UI-001).
- Leads route.

### Acceptance gate
- `/dashboard/inbox` usable at 390px for: browse threads, open thread, reply, compose.
- No viewport overflow in compose or forward flows.
- Desktop split-pane behavior preserved.

### Report
  ✅ UI-007 COMPLETE
  - Changed files: <list>
  - Mobile master-detail strategy: <describe>
  - tsc --noEmit passes ✓
  - Manual check notes for 390 / 768 / 1280
  - Deviations: <list or "none">

---

## SUBAGENT 8 — UI-008: Responsive QA and Regression

**Depends on UI-003 through UI-007 all being done.**

READ `my tickets/ui/UI-008-responsive-qa-and-regression.md` fully first.

### Route matrix to verify
- `/dashboard`
- `/dashboard/brands`
- `/dashboard/clients`
- `/dashboard/invoices`
- `/dashboard/sales`
- `/dashboard/sales/[id]`
- `/dashboard/leads`
- `/dashboard/teams`
- `/dashboard/inbox`
- active `dashboard/settings/*` routes

### Viewports: 320 / 360 / 375 / 390 / 430 / 768 / 1024 / 1280

### What to do
1. Run every route in the route matrix through the full viewport list above.
2. Fix remaining small overflow, spacing, tap-target, and content-order bugs that are self-contained.
3. Standardize any visibly inconsistent mobile spacing or sticky behavior introduced by earlier tickets.
4. Add focused automated coverage only if the existing test setup clearly supports it and the
   regression being protected is critical.
5. Document explicitly (as deviations) any intentionally deferred issues.

### Do NOT do
- New product features.
- Broad visual redesign.
- Reopening earlier tickets for large scope changes.

### Acceptance gate
- No major horizontal page overflow on any route in the matrix.
- Primary actions (create, filter, open-detail, navigate) reachable on mobile for each route.
- Any automated tests added/changed pass locally.

### Final report
  ✅ UI-008 COMPLETE — ALL RESPONSIVE WORK DONE
  - QA summary table (route × viewport: pass/fail/note)
  - Small fixes applied: <list of file:line>
  - tsc --noEmit passes ✓
  - Deferred items: <list with file refs and reasons, or "none">
  - Tests run: <list>

---

## Start

Spawn SUBAGENT 1 (UI-001) now.
Wait for its completion report before spawning SUBAGENT 2.
Continue sequentially through all 8 subagents.
