# UI-007 - Inbox Mobile Experience

| Field | Value |
|---|---|
| Ticket ID | UI-007 |
| Priority | P0 - Critical |
| Status | [ ] Not Started |
| Estimate | 2 days |
| Depends On | UI-001, UI-002, UI-004 |

## Purpose

The inbox route currently depends on a desktop split-pane layout and fixed-width compose surfaces. This ticket converts it into a mobile-friendly master-detail experience.

## User Outcome

- Users can search, browse, open, read, and reply to email on phones.
- Compose and reply surfaces no longer overflow or feel cramped.
- Inbox becomes usable without a desktop viewport.

## Exact Scope

### In Scope

1. Inbox route layout and pane behavior.
2. Thread list filters and search behavior on mobile.
3. Thread detail view responsiveness.
4. Compose drawer responsiveness.
5. Reply area responsiveness.
6. Thread-view drawer or related comm components directly needed by the inbox mobile flow.

### Out Of Scope

1. Non-inbox dashboard routes.
2. Generic shell work already covered in UI-001.
3. Leads route.

## Target Files

- `apps/frontend/sales-dashboard/src/app/dashboard/inbox/page.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/comm/compose-drawer.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/comm/thread-view-drawer.tsx`
- `apps/frontend/sales-dashboard/src/components/shared/comm/entity-email-timeline.tsx` if directly impacted

## Implementation Tasks

1. Replace the fixed desktop split-pane assumption with a mobile master-detail flow.
2. Make the thread list usable on narrow screens:
   - search and filters should not consume excessive vertical space
   - rows should remain legible
3. Make thread detail content wrap correctly and avoid clipped metadata rows.
4. Turn compose and forward flows into mobile-safe full-screen or near-full-screen experiences.
5. Ensure reply controls, attachment chips, and action buttons remain reachable on phones.
6. Keep desktop inbox productivity intact.

## Acceptance Criteria

1. `/dashboard/inbox` is usable on 390px width for browsing threads, opening a thread, and replying.
2. Compose works on mobile without overflowing the viewport.
3. Message metadata, content, and attachments remain readable on small screens.
4. Desktop split-pane productivity is preserved or improved.

## Testing Requirements

1. Manual verification on 390, 768, and desktop widths.
2. Verify search, thread selection, reply, reply-all, forward, and compose flows.
3. Verify one attachment upload and one attachment removal flow in the reply composer if the backend/dev setup permits it.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-007-inbox-mobile-experience.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Focus only on the inbox and directly related comm UI pieces listed in the ticket.
- Convert the route from desktop split-pane assumptions into a mobile-friendly master-detail experience.
- Keep desktop productivity behavior intact.
- Do not start unrelated responsive cleanup outside inbox.

Deliverables:
- Responsive inbox route.
- Mobile-safe compose, forward, and reply experiences.

Before finishing:
- Verify the route on 390, 768, and desktop widths.
- Summarize any backend or environment limitations that blocked full verification.
```
