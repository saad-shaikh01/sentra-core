# UI-004 - Responsive Sheets And Modals

| Field | Value |
|---|---|
| Ticket ID | UI-004 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 1.5 days |
| Depends On | UI-002 |

## Purpose

The shared drawer and modal system currently assumes desktop screen sizes. This ticket makes detail sheets, dialogs, and supporting overlays fully usable on mobile before route-specific form work continues.

## User Outcome

- Detail sheets open cleanly on phones without clipped headers or unreachable close buttons.
- Tabs and content regions remain scrollable and readable inside sheets.
- Dialogs fit the viewport and handle long content safely.

## Exact Scope

### In Scope

1. Shared `DetailSheet` behavior.
2. Shared Radix dialog content sizing and viewport safety.
3. Shared form and confirm modal wrappers.
4. Read-only detail sheet layouts for sales, clients, leads, and invoices.
5. Small modal consumers that obviously break due to shared foundation issues.

### Out Of Scope

1. Route-specific create/edit form field redesign beyond what is needed for modal safety.
2. Leads kanban and leads page layout changes.
3. Inbox route redesign.

## Target Files

- `apps/frontend/sales-dashboard/src/components/shared/detail-sheet.tsx`
- `apps/frontend/sales-dashboard/src/components/ui/dialog.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/form-modal.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/confirm-modal.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/_components/sale-detail-sheet.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/clients/_components/client-detail-sheet.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx`
- `apps/frontend/sales-dashboard/src/app/dashboard/invoices/_components/invoice-detail-sheet.tsx`
- `apps/frontend/sales-dashboard/src/components/my-sessions-modal.tsx`

## Implementation Tasks

1. Make `DetailSheet` become full-width or near-full-width on small screens with safe padding and natural scrolling.
2. Ensure sheet headers remain visible and close actions stay reachable.
3. Make tab rows inside detail sheets wrap or horizontally scroll without clipping.
4. Fix dense `grid-cols-2` detail summaries inside the sheets so they stack correctly on mobile.
5. Update dialog content sizing:
   - viewport-safe max height
   - mobile-friendly width and padding
   - long content scroll handling
6. Fix obvious floating-position issues such as lead detail sheet overlay actions that do not adapt to mobile.

## Acceptance Criteria

1. Sales, clients, leads, and invoice detail sheets are fully usable at 360px and 390px widths.
2. Shared dialogs no longer overflow the viewport on phones.
3. Confirm and form modals remain readable and actionable on both mobile and desktop.
4. No sheet or dialog in scope traps important actions off-screen.

## Testing Requirements

1. Manual verification on 360, 390, 768, and 1280 widths.
2. Verify scroll inside sheets and dialogs works independently from the page behind them.
3. Verify backdrop click and keyboard dismissal behavior still works where supported.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-004-responsive-sheets-and-modals.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Focus on shared drawer/modal foundations and read-only detail sheet layouts.
- Make sheets and dialogs truly mobile-safe, not just slightly narrower desktop panels.
- Do not start broader list-page work, leads kanban redesign, inbox redesign, or transactional form refactors beyond what this ticket explicitly needs.

Deliverables:
- Responsive shared sheet and dialog foundation.
- Mobile-safe sales, clients, leads, and invoice detail sheet layouts.

Before finishing:
- Verify open, scroll, close, and nested content behavior on 360 and 390 widths.
- Summarize any form-specific follow-up work that belongs to later tickets.
```
