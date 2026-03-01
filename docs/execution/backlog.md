# Execution Backlog

Last reviewed: February 28, 2026

| ID | Title | Area | Priority | Status | Owner | Branch | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENG-001 | Repair token refresh flow | Auth | P0 | Ready | Unassigned | - | The refresh route is implemented, but the current global access guard setup likely rejects refresh-token-only requests. |
| ENG-002 | Align password reset flow and frontend auth defaults | Auth | P0 | Ready | Unassigned | - | Fix the `newPassword` payload mismatch, remove or replace the undeclared `sonner` import, and use one sane default API base URL. |
| ENG-003 | Add payment profile onboarding | Payments | P0 | Ready | Unassigned | - | No current endpoint or UI creates `customerProfileId` / `paymentProfileId`, so charge/pay/subscribe paths are not usable for new sales. |
| ENG-004 | Normalize payment endpoints and mutation cache writes | Payments | P1 | Ready | Unassigned | - | Fix the cancel-subscription route mismatch and stop writing partial mutation payloads into sale/invoice detail caches. |
| ENG-005 | Enforce tenant ownership on related IDs | Backend | P1 | Ready | Unassigned | - | Validate `brandId`, `assignedToId`, and other foreign keys against the caller's organization before writing records. |
| ENG-006 | Replace dashboard placeholder metrics with real analytics | Frontend | P1 | Ready | Unassigned | - | The dashboard shell exists, but its KPI cards are currently hardcoded placeholders. |
| ENG-007 | Fix stale or broken automated tests | Testing | P1 | Ready | Unassigned | - | Current coverage is thin; at least one shared-types spec is broken by inspection, and Playwright uses a hardcoded Linux workspace path. |
| ENG-008 | Implement or remove schema-only brand access/email/outbox claims | Auth / Platform | P2 | Ready | Unassigned | - | `BrandAccess`, email aliasing, and outbox models exist in Prisma, but runtime behavior is missing. |
| ENG-009 | Decide and implement API gateway scope | Platform | P2 | Blocked | Unassigned | - | The gateway app is still a starter service and should not be treated as part of the live product path yet. |
| ENG-010 | Decide and implement comm-service and client-portal scope | Platform | P2 | Blocked | Unassigned | - | Both areas are mostly scaffolds today; either activate them with real work or keep them explicitly out of current delivery scope. |
