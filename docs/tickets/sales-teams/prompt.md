Good. All 14 tickets are now written and accurate. The ticket pack at docs/tickets/sales-teams/ is complete:

  14 tickets covering the full data scope system:
  - DS-001 through DS-003: Foundation (schema + ScopeService + invalidation)
  - DS-004 through DS-008: Service integration (leads, clients, sales, invoices, auto-assignment)
  - DS-009 through DS-011: Management UI (brand-team assignment, visibility toggle, frontend scoping)
  - DS-012 through DS-014: Ops (backfill, KPI scoping, E2E tests)

  Key updates based on the codebase exploration:
  - DS-004 now documents the existing 3-tier permission system (view_all/view_team/view_own) and the migration strategy to integrate ScopeService with it rather than replacing it
  - DS-006 now accurately describes the current 2-step lead→client→sales pattern being replaced
  - DS-007 confirms invoices currently have NO role filtering at all (security gap)

  Start with DS-001 — run the Prisma migration first, everything else depends on it.