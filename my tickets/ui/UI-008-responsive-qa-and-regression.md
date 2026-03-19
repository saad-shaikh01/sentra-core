# UI-008 - Responsive QA And Regression

| Field | Value |
|---|---|
| Ticket ID | UI-008 |
| Priority | P1 - High |
| Status | [ ] Not Started |
| Estimate | 1 day |
| Depends On | UI-003, UI-004, UI-005, UI-006, UI-007 |

## Purpose

After all responsive implementation tickets land, the dashboard still needs one consolidation pass for visual consistency, final polish, and regression reduction.

## User Outcome

- The full dashboard feels coherent across mobile and desktop.
- Remaining responsive bugs are caught before the work is declared complete.
- Critical flows gain at least basic regression coverage where justified.

## Exact Scope

### In Scope

1. Full responsive QA sweep across high-value dashboard routes.
2. Small consistency fixes discovered during QA.
3. Updating or adding focused automated coverage for critical responsive regressions where practical.
4. Final issue log of deferred items, if any remain.

### Out Of Scope

1. New product features.
2. Broad visual redesign outside responsive fixes.
3. Reopening earlier tickets for large scope expansion.

## Route Matrix

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

## Implementation Tasks

1. Run the viewport matrix from `my tickets/ui/EXECUTION-ORDER.md` across the route matrix above.
2. Fix remaining overflow, spacing, tap-target, and content-order bugs that are small enough for a cleanup ticket.
3. Standardize any visibly inconsistent mobile spacing or sticky behavior introduced by earlier tickets.
4. Add or update automated coverage only for the most critical responsive regressions if the existing test stack supports it cleanly.
5. Document any intentionally deferred issues with file references and reasons.

## Acceptance Criteria

1. The route matrix passes manual responsive QA across the agreed viewport sizes.
2. No major page-level horizontal overflow remains.
3. Primary create, filter, open-detail, and navigation actions are reachable on mobile.
4. Any automated tests added or changed for this ticket pass locally.
5. Deferred items, if any, are explicitly documented instead of silently skipped.

## Testing Requirements

1. Manual verification on all viewports listed in `my tickets/ui/EXECUTION-ORDER.md`.
2. Run any impacted existing test suites and note what was or was not run.
3. Capture a short route-by-route QA summary before closing the ticket.

## Execution Prompt

```text
Implement only the work described in `my tickets/ui/UI-008-responsive-qa-and-regression.md`.

Repo: sentra-core
Target app: `apps/frontend/sales-dashboard`

Requirements:
- Treat this as a focused QA and cleanup pass after the earlier responsive tickets are done.
- Fix only remaining responsive bugs and small consistency issues.
- Add automated coverage only where it clearly protects a critical regression.
- Do not reopen scope for major redesigns that belong in earlier tickets.

Deliverables:
- Final responsive cleanup.
- QA summary across the route matrix.
- Any added or updated automated coverage, if justified and feasible.

Before finishing:
- List what was verified manually.
- List what tests were run and what could not be run.
- Document any deferred responsive issues explicitly.
```
