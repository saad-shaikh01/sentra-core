# Sales Module CRUD Stabilization Plan

## Review Notes

- `Simple Sale` modal already has client/brand required validation in the current codebase. Treat any related ticket as verification/tightening, not net-new feature work.
- The original plan uses Unix-style commands like `grep` and `head`. In this workspace, prefer PowerShell-native commands or `rg` when executing the plan.

## Expected Output After Completion

- `Simple Sale` create and edit flows will work end-to-end.
- `Quick Sale` create flow will work end-to-end, including optional contract upload.
- Sales list and sale detail views will stay stable after subscribe/cancel actions.
- Cancel subscription will hit the correct backend route and refresh the detail state correctly.
- Delete attempts on invoiced sales will show a clear, user-friendly error instead of a vague failure.
- Charge action will only be shown when the sale actually has usable payment profiles.
- Role-based frontend gating will match backend permissions for create, edit, delete, charge, subscribe, and cancel-subscription actions.
- Sales-related TypeScript build issues will be assessed and resolved for sales paths only.
- A shared `ISaleWithRelations` type will exist for the sale detail response.
- Sales module will have frontend Playwright coverage and backend integration coverage.

## Claude Plan

### 1. Scope Definition

#### In-Scope

- Create sale via `Simple Sale` (modal form)
- Create sale via `Quick Sale` (multi-step wizard with line items, payment plan, optional contract upload)
- Read sales list (table with filters: status, client, brand, date range)
- Read sale detail (sheet with transactions, invoices, payment profile status)
- Update/edit sale via `Simple Sale` modal
- Delete sale (with correct error handling when invoices block deletion)
- Contract upload fix (broken `Content-Type` in `api.fetch`)
- Cancel subscription fix (API contract mismatch: `DELETE` vs `POST`)
- Subscribe cache fix (`setQueryData` with wrong shape)
- Cancel subscription cache fix (`setQueryData` with wrong shape)
- Charge flow containment (gate behind payment profile existence, no `opaqueData` implementation)
- Frontend role-based permission gating
- Build health for sales-related files
- `ISaleWithRelations` type definition
- Automated test coverage (Playwright e2e + backend integration)

#### How Simple Sale and Quick Sale Are Treated

- `Simple Sale`: First-class. Covers create and edit. Edit is currently broken (`clientId`/`brandId` rejection). Must be fixed.
- `Quick Sale`: First-class for create only. No edit path exists or is planned. Contract upload within Quick Sale is broken and must be fixed.

#### Out-of-Scope

- Authorize.Net `opaqueData` collection / first-time payment profile setup
- Full payment gateway integration beyond what already exists
- Invoice management module (invoice list, invoice edit, PDF generation)
- Refund flow
- Transaction history detail view
- Subscription plan changes (only cancel is in scope)
- ARB webhook handling
- Role management UI
- Multi-currency configuration

#### Adjacent Workflows Deferred Unless Blocking

- Full charge flow with `opaqueData`
- Invoice PDF download
- Overdue invoice escalation
- Subscription renewal tracking

### 2. Current-State Assessment

- `Create via Simple Sale`: Implemented but incomplete
  - Form collects `clientId`, `brandId`, `totalAmount`, `currency`, `description`; mutations fire correctly.
  - Review note: current code already includes client/brand required validation, so this point should be re-verified against the repo before implementation.
- `Create via Quick Sale`: Implemented but broken
  - Wizard logic and line items work.
  - Contract upload is broken because `api.fetch` forces `Content-Type: application/json` even for `FormData`.
- `Read sales list`: Implemented and working
  - `useSales`, table, and filters are present.
  - Role-based visibility scoping exists in backend service.
- `Read sale detail`: Implemented and working
  - `useSale` reads client, invoices, transactions, and items.
  - `ISaleWithRelations` exists only informally in the detail sheet.
- `Update/edit sale`: Implemented but broken
  - Edit form sends `clientId` and `brandId` in `PATCH`.
  - Backend `UpdateSaleDto` forbids these fields and global validation rejects them.
- `Delete sale`: Implemented but misleading
  - Backend correctly blocks delete when invoices exist.
  - `ONE_TIME` and `INSTALLMENT` sales auto-generate invoices, so many sales are immediately undeletable.
  - Frontend confirm/error messaging is not specific enough.
- `Contract upload`: Implemented but broken
  - `useUploadContract` passes `FormData` into `api.fetch`, which forces JSON `Content-Type`.
- `Charge`: Implemented but incomplete
  - Backend requires existing payment profiles or `opaqueData`.
  - Current charge modal does not collect `opaqueData`.
- `Subscribe`: Implemented but cache-corrupt
  - Success handler writes partial `{ subscriptionId }` into sale detail cache.
- `Cancel subscription`: Implemented but broken in two ways
  - Frontend calls the wrong route.
  - Success handler writes partial `{ message }` into sale detail cache.
- `Permission gating`: Missing
  - Users can currently see restricted actions without frontend role checks.
- `Automated tests`: Missing
  - No sales-specific frontend or backend tests.

### 3. Execution Strategy

#### Phase 0 - Build Health

- `SALE-000` assesses.
- `SALE-001` and `SALE-002` fix.
- No implementation ticket may begin until sales-path build health is clear.

Stop gate:

- `tsc --noEmit` produces zero errors in sales module paths in both workspaces.

#### Phase 1 - Data Contract

- `SALE-003` defines `ISaleWithRelations`.
- Required before `SALE-009` and `SALE-010`.

#### Phase 2 - Core CRUD Fixes

- `SALE-004`: Fix edit form payload and edit-mode client/brand rendering
- `SALE-005`: Fix cancel-subscription API mismatch
- `SALE-006`: Fix contract upload `Content-Type`
- `SALE-007`: Fix subscribe/cancel cache corruption

Stop gate for Phase 3:

- `PATCH /sales/:id` returns `200` for edit.
- `POST /sales/:id/cancel-subscription` routes correctly.
- Contract upload sends a valid multipart request.

#### Phase 3 - Exposed-Adjacent Flow Containment

- `SALE-008`: Delete UX alignment
- `SALE-009`: Gate charge behind payment profile existence

#### Phase 4 - Permission Gating

- `SALE-010`: Frontend role-based gating for create, edit, delete, charge, subscribe, cancel-subscription

#### Phase 5 - Tests

- `SALE-011`: Playwright e2e tests
- `SALE-012`: Backend integration tests

### 4. Ticket Backlog

#### [SALE-000] Assess TypeScript build state for sales module files

- Objective: Determine exactly which TypeScript errors exist in sales-related files in both backend and frontend. Produce a written findings report. Make no code changes.
- Why this exists: Backend Prisma mismatches around `contractUrl`, `items`, and `installmentCount` have been reported and need confirmation.
- Scope: Run `tsc --noEmit` in both workspaces, filter to sales-related paths, document findings, no code changes.
- Out of scope: Any code edits; non-sales errors.
- Depends on: Nothing.
- Output artifact: `docs/sales-dashboard/sales-build-assessment.md`

#### [SALE-001] Fix backend sales module TypeScript and Prisma type errors

- Objective: Resolve all TypeScript errors in backend sales files identified by `SALE-000`.
- Scope: Only backend sales module files. If Prisma client is stale, run `prisma generate`.
- Out of scope: Non-sales backend errors, frontend, DB schema migrations.
- Depends on: `SALE-000`

#### [SALE-002] Fix frontend sales module TypeScript errors

- Objective: Resolve all TypeScript errors in sales-related frontend files identified by `SALE-000`.
- Scope: Sales page/components and `use-sales.ts`.
- Out of scope: Non-sales frontend errors and backend changes.
- Depends on: `SALE-000`

#### [SALE-003] Define `ISaleWithRelations` shared type

- Objective: Create a shared type for the `GET /sales/:id` response including `client`, `invoices`, `transactions`, and `items`.
- Scope: Shared types file, `useSale` return type, and sale detail sheet type usage.
- Out of scope: API response changes or rendering changes.
- Depends on: `SALE-001`, `SALE-002`

#### [SALE-004] Fix edit sale payload and edit-mode form rendering

- Objective: Stop edit mode from sending `clientId` and `brandId` in `PATCH`, and make those fields read-only in edit mode.
- Why this exists: Current edit flow fails with `400` because backend validation rejects those fields.
- Scope: `sale-form-modal.tsx` only.
- Out of scope: Backend DTO changes.
- Depends on: `SALE-001`, `SALE-002`

#### [SALE-005] Fix cancel-subscription API contract mismatch

- Objective: Update frontend to call `POST /sales/:id/cancel-subscription`.
- Scope: `api.ts` cancelSubscription method only.
- Out of scope: Cache behavior and backend changes.
- Depends on: `SALE-001`, `SALE-002`

#### [SALE-006] Fix contract upload `Content-Type` handling in `api.fetch`

- Objective: Omit JSON `Content-Type` for `FormData` requests so the browser can send multipart boundaries correctly.
- Scope: `api.fetch` in `api.ts`.
- Out of scope: Hook changes and backend upload changes.
- Depends on: `SALE-001`, `SALE-002`

#### [SALE-007] Fix cache corruption in subscribe/cancel hooks

- Objective: Replace `setQueryData` with proper `invalidateQueries` in `useCreateSubscription` and `useCancelSubscription`.
- Scope: `use-sales.ts` only.
- Out of scope: Charge mutation logic and UI changes.
- Depends on: `SALE-005`

#### [SALE-008] Align delete UX with backend invoice restriction

- Objective: Surface the invoice-block error clearly and update the delete confirm dialog copy.
- Scope: `useDeleteSale` error handling and sales page delete confirm text.
- Out of scope: Backend delete behavior changes.
- Depends on: `SALE-001`, `SALE-002`

#### [SALE-009] Gate "Charge Now" behind payment profile existence

- Objective: Only render the charge action when both `customerProfileId` and `paymentProfileId` exist.
- Scope: `sale-detail-sheet.tsx`
- Out of scope: `opaqueData` collection and full payment gateway implementation.
- Depends on: `SALE-003`

#### [SALE-010] Add frontend role-based gating for restricted sales actions

- Objective: Hide restricted controls from roles that backend would reject.
- Scope:
  - Sales page create/edit/delete controls
  - Sale detail charge/subscribe/cancel controls
- Out of scope: Backend auth changes and read-only views.
- Depends on: `SALE-003`, `SALE-009`

#### [SALE-011] Add Playwright e2e tests for Sales CRUD and permission gating

- Objective: Add end-to-end coverage for sales create/read/update/delete, Quick Sale create, and permission gating.
- Scope: New frontend test file.
- Out of scope: Backend unit tests and full payment gateway flows.
- Depends on: `SALE-004` through `SALE-010`

#### [SALE-012] Add backend integration tests for invoice generation, delete restrictions, and DTO validation

- Objective: Cover auto-invoice generation, invoice-blocked deletion, and update DTO rejection behavior.
- Scope: New backend sales service spec.
- Out of scope: Controller HTTP tests and gateway integration tests.
- Depends on: `SALE-001`

### 5. Module Exit Criteria

- `tsc --noEmit` produces zero errors in sales-related backend and frontend paths.
- `Simple Sale` create works with required fields and creates a visible sale row.
- `Simple Sale` edit works, shows client/brand as read-only, and sends no `clientId`/`brandId` in `PATCH`.
- Delete on invoiced sales shows a clear actionable error; delete on allowed sales succeeds.
- `Quick Sale` create works with line items and optional contract upload.
- Contract upload sends multipart request and returns `{ url }`.
- Cancel subscription uses the correct route and refetches correct detail data.
- Subscribe/cancel no longer corrupt sale detail cache.
- Charge button only renders when payment profiles exist.
- Frontend permissions match backend restrictions for all gated actions.
- Sales Playwright suite passes.
- Backend sales integration suite passes.

### 6. Risks and Open Questions

- Charge remains intentionally gated for first-time-payment-profile cases because `opaqueData` collection is out of scope.
- Subscribe should likely be gated by payment profile existence as well, not just role. This should be explicitly included when implementing `SALE-010`.
- Quick Sale contract upload is a two-step flow, so an uploaded file can become orphaned if sale creation fails afterward.
- Backend TypeScript errors may require only Prisma client regeneration, or may reveal deeper schema drift.
- Open question: whether sale `status` should be editable in the UI, since `UpdateSaleDto` allows it but the current edit form does not expose it.
