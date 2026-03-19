# UI-006 - Leads Mobile Experience

| Field | Value |
|---|---|
| Ticket ID | UI-006 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 2 days |
| Depends On | UI-001, UI-002, UI-004 |

## Purpose

The leads area is one of the heaviest workflow screens in the sales dashboard. It currently behaves like a compressed desktop experience, especially in kanban mode. This ticket gives leads a dedicated mobile interaction model.

## User Outcome

- Leads can be filtered, viewed, and acted on comfortably from phones.
- Kanban no longer requires six desktop columns visible at once.
- Lead forms and import flows are practical on smaller screens.

## Exact Scope

### In Scope

1. Leads page header and action group.
2. Leads filters and view toggle behavior.
3. Leads table mobile rendering.
4. Leads kanban mobile interaction model.
5. Lead create/edit form modal.
6. Lead import modal.
7. Convert lead modal and related small dialogs.
8. Any leads-specific integration with the responsive detail sheet foundation from UI-004.

### Out Of Scope

1. Shared sheet foundation work already covered in UI-004.
2. Inbox route.
3. Non-leads pages.

## Target Files

- `apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-table.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-kanban.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/leads-kanban-card.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-form-modal.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-import-modal.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/convert-lead-modal.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx`

## Implementation Tasks

1. Make the leads page action cluster wrap or reorganize cleanly on mobile.
2. Replace the current dense filter row with a mobile-safe pattern:
   - stacked controls
   - collapsible filter tray
   - or another clear equivalent
3. Give kanban an actual mobile model. Acceptable options:
   - horizontally swipeable columns with snap behavior
   - one-column active-lane selector
   - another deliberate mobile-first pattern
4. Keep desktop kanban intact while improving mobile behavior.
5. Ensure lead form, import, and convert flows stack correctly and keep primary actions visible.
6. Recheck detail sheet integration after the shared sheet changes from UI-004.

## Acceptance Criteria

1. `/dashboard/leads` is fully usable on a 390px-wide viewport.
2. Mobile users can switch views, search, filter, open detail, and create a lead without layout breakage.
3. Kanban is intentionally usable on mobile and not just six squashed columns.
4. Lead import preview and lead forms remain readable and actionable on narrow screens.

## Testing Requirements

1. Manual verification on 360, 390, 768, and 1280 widths.
2. Verify at least one edit/create flow and one import flow on mobile width.
3. Verify one kanban drag or status-change flow still works after the responsive redesign.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-006-leads-mobile-experience.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Focus only on the leads experience.
- Give leads a deliberate mobile UX, especially for filters, actions, and kanban.
- Preserve existing business logic and permissions.
- Reuse the shared responsive work from earlier tickets instead of inventing parallel patterns.

Deliverables:
- Responsive leads page.
- Mobile-friendly leads kanban strategy.
- Responsive lead form, import, and convert flows.

Before finishing:
- Verify create, edit, import, filter, and detail flows on 390px width.
- Summarize any risks left in leads-specific business behavior, not layout.
```
