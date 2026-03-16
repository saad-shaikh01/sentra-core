# Sales Module Tickets — Index

## Introduction

This directory contains all implementation tickets for the Sales Module Enhancement Plan. The plan is divided into three phases: Phase 1 covers backend enhancements (schema migrations, business logic, API endpoints), Phase 2 covers the frontend implementation (Next.js pages, components, and API integration), and Phase 3 covers planned client-portal features that are out of scope for current implementation but are documented for forward planning.

Every ticket in this index must be completed in dependency order. No ticket may be marked Done unless its acceptance criteria are fully verified and its tests pass. Any deviation from ticket scope must be documented in the ticket file before the PR is merged.

Total tickets: 24 (15 backend + 9 frontend)

---

## Status Legend

| Symbol | Meaning       |
|--------|---------------|
| `[ ]`  | Not Started   |
| `[~]`  | In Progress   |
| `[x]`  | Done          |
| `[!]`  | Blocked       |

---

## Phase 1 — Backend Enhancements

| Ticket ID   | Title                                              | Status | Depends On              |
|-------------|-----------------------------------------------------|--------|-------------------------|
| SM-BE-001   | Draft Status, Discount Fields & Activity Types Schema Migration | [ ] | — (first) |
| SM-BE-002   | SaleItem Package Linkage                           | [ ]    | SM-BE-001               |
| SM-BE-003   | Status Transition Validation                       | [ ]    | SM-BE-001               |
| SM-BE-004   | Soft-Delete Conversion                             | [ ]    | SM-BE-001               |
| SM-BE-005   | Role Permission Fix (PROJECT_MANAGER / Agents)     | [ ]    | SM-BE-001               |
| SM-BE-006   | Client Collision Detection & Warning Metadata      | [ ]    | SM-BE-001               |
| SM-BE-007   | Activity Logging for All Write Operations          | [ ]    | SM-BE-001, SM-BE-003, SM-BE-004, SM-BE-005 |
| SM-BE-008   | Discount Calculation Logic                         | [ ]    | SM-BE-001               |
| SM-BE-009   | Refund Endpoint                                    | [ ]    | SM-BE-001, SM-BE-007    |
| SM-BE-010   | Chargeback Tracking Endpoint                       | [ ]    | SM-BE-001, SM-BE-007    |
| SM-BE-011   | Authorize.net ARB Webhook Receiver                 | [ ]    | SM-BE-007, SM-BE-009    |
| SM-BE-012   | Phase 1 Internal Notifications                     | [ ]    | SM-BE-011               |
| SM-BE-013   | Invoice Auto-Generation Rules, Sequential Numbering & Payment Token Generation | [ ] | SM-BE-001, SM-BE-007 |
| SM-BE-014   | Public Invoice Detail Endpoint (No Auth, Token-Gated) | [ ] | SM-BE-013               |
| SM-BE-015   | Public Invoice Payment Charge Endpoint (No Auth, Token-Gated, Rate-Limited) | [ ] | SM-BE-013, SM-BE-014, SM-BE-003, SM-BE-007 |

---

## Phase 2 — Frontend Implementation

| Ticket ID   | Title                                              | Status | Depends On              |
|-------------|-----------------------------------------------------|--------|-------------------------|
| SM-FE-001   | Sales List Page                                    | [ ]    | SM-BE-001..SM-BE-008    |
| SM-FE-002   | Revenue Summary Cards                              | [ ]    | SM-FE-001               |
| SM-FE-003   | Invoice Overview Widget                            | [ ]    | SM-FE-001               |
| SM-FE-004   | Sale Detail Page: Header, Client Section, Status Controls | [ ] | SM-FE-001, SM-BE-003 |
| SM-FE-005   | Sale Detail Page: Items, Invoices, Transactions    | [ ]    | SM-FE-004               |
| SM-FE-006   | Sale Detail Page: Subscription & Activity Timeline | [ ]    | SM-FE-005, SM-BE-007    |
| SM-FE-007   | Create / Edit Sale Form                            | [ ]    | SM-FE-001, SM-BE-008, SM-BE-002 |
| SM-FE-008   | Refund Modal & Chargeback Modal                    | [ ]    | SM-FE-004, SM-BE-009, SM-BE-010 |
| SM-FE-009   | Brand-Aware Public Payment Page (No Auth Required) | [ ]    | SM-BE-014, SM-BE-015    |

---

## Phase 3 — Client Portal (Planned, Not Implemented)

The following features are documented for future planning. No tickets are being created for Phase 3 at this time. Implementation will require a separate planning session when Phase 2 is complete.

| Feature                                        | Notes                                          |
|------------------------------------------------|------------------------------------------------|
| Client-facing invoice email delivery           | Requires email template service integration    |
| Payment receipt emails to clients              | Requires email template service integration    |
| Failed payment notification emails to clients  | Phase 2 internal only; client email is Phase 3 |
| Subscription lifecycle emails (renewal, cancel) | Requires Authorize.net event mapping          |
| Client self-service portal (view invoices)     | New portal application or embedded view        |
| Client portal payment method management        | Requires Authorize.net Customer Profile API    |

---

## Implementation Order (Dependency Chain)

The following numbered sequence is the required implementation order accounting for all inter-ticket dependencies:

1. **SM-BE-001** — Must be merged and migration applied before any other ticket begins.
2. **SM-BE-002** — Can start after SM-BE-001 migration is applied.
3. **SM-BE-004** — Can start in parallel with SM-BE-002 after SM-BE-001.
4. **SM-BE-005** — Can start in parallel with SM-BE-002 after SM-BE-001.
5. **SM-BE-006** — Can start in parallel with SM-BE-002 after SM-BE-001.
6. **SM-BE-003** — Requires SM-BE-001 (for DRAFT enum value).
7. **SM-BE-008** — Requires SM-BE-001 (for discount fields on Sale model).
8. **SM-BE-007** — Requires SM-BE-001, SM-BE-003, SM-BE-004, SM-BE-005 (must wrap all prior service changes to log accurately).
9. **SM-BE-009** — Requires SM-BE-001 (for TransactionType.REFUND), SM-BE-007 (for logging).
10. **SM-BE-010** — Requires SM-BE-001 (for TransactionType.CHARGEBACK), SM-BE-007 (for logging).
11. **SM-BE-011** — Requires SM-BE-007 and SM-BE-009 (processes refund webhook events).
12. **SM-BE-012** — Requires SM-BE-011 (subscribes to events from webhook and write operations).
13. **SM-BE-013** — Invoice auto-generation + sequential numbering + payment tokens (depends on: SM-BE-001, SM-BE-007)
14. **SM-BE-014** — Public invoice detail endpoint (depends on: SM-BE-013)
15. **SM-BE-015** — Public payment charge endpoint (depends on: SM-BE-013, SM-BE-014, SM-BE-003, SM-BE-007)
16. **SM-FE-009** — Public payment page (depends on: SM-BE-014, SM-BE-015)
17. **SM-FE-001** — Requires all backend tickets SM-BE-001 through SM-BE-008 for stable API contract.
18. **SM-FE-002** — Requires SM-FE-001 and the `GET /sales/summary` endpoint.
19. **SM-FE-003** — Requires the `GET /invoices/summary` endpoint (defined in SM-FE-003 backend tasks).
20. **SM-FE-004** — Requires SM-FE-001 and SM-BE-003 (status transition UI).
21. **SM-FE-005** — Requires SM-FE-004.
22. **SM-FE-006** — Requires SM-FE-005 and SM-BE-007 (activity timeline data).
23. **SM-FE-007** — Requires SM-FE-001, SM-BE-008, SM-BE-002.
24. **SM-FE-008** — Requires SM-FE-004, SM-BE-009, SM-BE-010.

---

## Testing Protocol

The following rules apply to all tickets in this index. No ticket may be marked Done until all rules are satisfied.

1. **Unit tests are mandatory.** Every new service method must have a corresponding unit test file. Tests must cover: happy path, all validation error paths, and edge cases listed in the ticket.
2. **Integration tests are mandatory for all new endpoints.** Every new controller route must have an integration test that exercises the full HTTP stack (controller → service → Prisma mock or test DB).
3. **No implicit acceptance criteria.** Every numbered AC in a ticket must be verified with a specific test or manual QA step. "Seems to work" is not a verification.
4. **Migration rollback must be tested.** Before merging SM-BE-001 or any migration ticket, the migration must be applied and rolled back successfully on a staging database.
5. **Deviations must be documented.** If an implementer discovers that a ticket's specified approach is technically infeasible or needs adjustment, the deviation must be documented as a comment in the ticket file AND noted in the PR description before merge.
6. **Role-gating tests must include negative cases.** Tests must assert that forbidden roles receive HTTP 403 and that the operation does not mutate data.
7. **All TypeScript must compile.** No ticket may be merged if `npx tsc --noEmit` reports errors in the affected service.
8. **No skipped tests.** Tests must not use `.skip` or `xit` to suppress failures. Failing tests must be fixed, not hidden.
