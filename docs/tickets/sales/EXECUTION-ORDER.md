# Sales Module — Strict Execution Order

**DO NOT skip steps. DO NOT start a ticket until all its dependencies are verified. Every ticket must pass its own verification checklist before the next one begins.**

---

## Rules for Implementation Agents

1. Read the ticket file fully before writing any code.
2. Complete ALL backend tasks listed in the ticket — do not partial-implement.
3. Run the verification steps at the bottom of every ticket before marking it done.
4. If a schema/migration is part of the ticket: run `npx prisma migrate dev` AND `npx prisma generate` before writing service code.
5. If the plan deviates from a ticket's spec: document why in a comment at the top of the ticket file and flag it before continuing.
6. Tests are not optional. Every ticket with testing requirements must have passing tests before the next ticket starts.

---

## Phase 1 — Backend (SM-BE-001 → SM-BE-015)

### STEP 1 — SM-BE-001
**File:** `docs/tickets/sales/SM-BE-001-draft-status-schema-migration.md`
**Do:** Add `DRAFT` to `SaleStatus` enum. Add `DiscountType` enum. Add `discountType`, `discountValue`, `discountedTotal` to `Sale`. Add `INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT` to `SaleActivityType`. Verify `REFUND` and `CHARGEBACK` in `TransactionType`.
**Run:** `npx prisma migrate dev --name add_draft_status_and_discount_fields` → `npx prisma generate`
**Gate:** Migration applies cleanly. `npx tsc --noEmit` passes. Proceed only after both pass.

---

### STEP 2 — SM-BE-002
**File:** `docs/tickets/sales/SM-BE-002-sale-item-package-linkage.md`
**Depends on:** STEP 1 complete
**Do:** Add `packageId String?` and `packageName String?` to `SaleItem`. Update `SaleItemDto`, `CreateSaleDto`, `ISaleItem`, `mapToISale`.
**Run:** `npx prisma migrate dev --name add_sale_item_package_linkage` → `npx prisma generate`
**Gate:** Migration applies. Fields present in Prisma client types.

---

### STEP 3 — SM-BE-004
**File:** `docs/tickets/sales/SM-BE-004-soft-delete-conversion.md`
**Depends on:** STEP 1 complete
**Do:** Convert `SalesService.remove()` to soft-delete (`deletedAt = new Date()`). Add `deletedAt: null` filter to `findAll()` and `findOne()`. Restrict to OWNER/ADMIN only. Log activity.
**Gate:** `DELETE /sales/:id` sets `deletedAt`, does NOT issue SQL DELETE. `findAll` no longer returns archived sales.

---

### STEP 4 — SM-BE-005
**File:** `docs/tickets/sales/SM-BE-005-role-permission-fix.md`
**Depends on:** STEP 1 complete
**Do:** Remove `PROJECT_MANAGER` from `@Roles` on POST/PATCH. Add `FRONTSELL_AGENT`, `UPSELL_AGENT` to POST with scoped validation. Add PM to GET (read-only). Block agents from updating financial fields.
**Gate:** PM receives 403 on POST/PATCH. Agents receive 403 if clientId outside their scope. PM can read sales list.

---

### STEP 5 — SM-BE-003
**File:** `docs/tickets/sales/SM-BE-003-status-transition-validation.md`
**Depends on:** STEP 1 complete (needs `DRAFT` enum value)
**Do:** Implement `ALLOWED_TRANSITIONS` map and `TRANSITION_ROLE_REQUIREMENTS` map in `SalesService`. Throw 422 for invalid transitions. Throw 403 for unauthorized transitions. Pass `actorId` and `actorRole` through `update()`.
**Gate:** All invalid transitions return 422. REFUNDED by non-owner returns 403. Full transition matrix tested.

---

### STEP 6 — SM-BE-006
**File:** `docs/tickets/sales/SM-BE-006-client-collision-detection.md`
**Depends on:** STEP 1 complete
**Do:** Update `resolveClientIdFromLead()` to return collision metadata. Update `create()` return type to include optional `collisionWarning`. No default behavior change — just add warning.
**Gate:** Creating a sale from a lead whose email matches an existing client returns `collisionWarning` in response.

---

### STEP 7 — SM-BE-007
**File:** `docs/tickets/sales/SM-BE-007-activity-logging.md`
**Depends on:** STEP 1 complete (needs new `SaleActivityType` values), STEPS 3–6 ideally done first so logging covers all prior changes
**Do:** Add `logActivity()` private helper. Add logging calls to: `create()`, `generateInvoices()`, `update()` (status/discount changes), `charge()`, `subscribe()`, `cancelSubscription()`, `remove()`. Add `POST /sales/:id/note` endpoint. Thread `actorId`/`userId` through all affected methods.
**Gate:** Every write operation creates at least one `SaleActivity` record. Note endpoint works.

---

### STEP 8 — SM-BE-008
**File:** `docs/tickets/sales/SM-BE-008-discount-logic.md`
**Depends on:** STEP 1 complete (needs discount columns), STEP 7 done (logging)
**Do:** Add `discountType`, `discountValue` to `CreateSaleDto` and `UpdateSaleDto`. Implement `computeDiscountedTotal()` in service. Validate discount rules. Store `discountedTotal`. Use `discountedTotal` as invoice base amount. Block discount changes on ACTIVE/COMPLETED sales.
**Gate:** PERCENTAGE discount computes correctly. FIXED_AMOUNT discount computes correctly. Discount > totalAmount throws 400. Changing discount on ACTIVE sale throws 422.

---

### STEP 9 — SM-BE-009
**File:** `docs/tickets/sales/SM-BE-009-refund-endpoint.md`
**Depends on:** STEP 5 (transition validation for REFUNDED), STEP 7 (logging)
**Do:** Add `POST /sales/:id/refund` endpoint with `CreateRefundDto`. Implement FULL/PARTIAL gateway refund + MANUAL mark-as-refunded. Update sale status to REFUNDED on full/manual. Log `REFUND_ISSUED`.
**Gate:** Full refund marks sale REFUNDED. Partial refund creates FAILED transaction on gateway decline. Manual refund requires note. REFUND_ISSUED activity logged.

---

### STEP 10 — SM-BE-010
**File:** `docs/tickets/sales/SM-BE-010-chargeback-tracking.md`
**Depends on:** STEP 7 (logging)
**Do:** Add `POST /sales/:id/chargeback` endpoint with `CreateChargebackDto`. Create `PaymentTransaction` with type CHARGEBACK. Log `CHARGEBACK_FILED`. Do NOT change sale status automatically.
**Gate:** Chargeback created. `CHARGEBACK_FILED` activity logged. Sale status unchanged.

---

### STEP 11 — SM-BE-011
**File:** `docs/tickets/sales/SM-BE-011-arb-webhook-receiver.md`
**Depends on:** STEP 7 (logging), STEP 9 (refund event handling)
**Do:** Create `WebhooksModule`. Add `POST /webhooks/authorize-net`. Implement HMAC-SHA512 signature verification. Handle 6 Authorize.net event types. Create PaymentTransaction, update Invoice, update Sale status. Configure raw body middleware.
**Gate:** Valid webhook payload processed correctly. Invalid/tampered signature returns 401. `PAYMENT_RECEIVED` and `PAYMENT_FAILED` activities logged correctly.

---

### STEP 12 — SM-BE-012
**File:** `docs/tickets/sales/SM-BE-012-internal-notifications.md`
**Depends on:** STEP 11 (events source)
**Do:** Check for existing notification mechanism. Create `SalesNotificationService`. Trigger on: payment failures, overdue invoices, status changes, chargebacks. Internal only (no client emails).
**Gate:** Payment failure triggers notification to sales manager. Chargeback triggers notification to OWNER/ADMIN.

---

### STEP 13 — SM-BE-013
**File:** `docs/tickets/sales/SM-BE-013-invoice-autogeneration-payment-tokens.md`
**Depends on:** STEP 1 (activity types), STEP 7 (logging)
**Do:** Add `paymentToken String? @unique` to `Invoice`. Run migration. Write backfill script. Update `generateInvoices()` to use `InvoiceSequence` for invoice numbers and generate `paymentToken` via `crypto.randomBytes(32).toString('hex')`. Add `POST /invoices/:id/regenerate-token` (admin). Add unit tests for `generateInvoices()`.
**Run:** `npx prisma migrate dev --name add_invoice_payment_token` → `npx prisma generate` → run backfill script on staging
**Gate:** ONE_TIME sale → 1 invoice with non-null `paymentToken` and `INV-YYYY-NNNN` format. INSTALLMENTS(3) → 3 invoices. SUBSCRIPTION → 0 invoices. Unit tests pass.

---

### STEP 14 — SM-BE-014
**File:** `docs/tickets/sales/SM-BE-014-public-invoice-detail-endpoint.md`
**Depends on:** STEP 13 (paymentToken on Invoice)
**Do:** Create `PublicPaymentsModule`. Add `GET /public/invoice/:token`. Return `PublicInvoiceDto` (safe — no internal IDs). No auth guard. Register module in AppModule.
**Gate:** Valid token returns invoice summary with brand. Unknown token returns 404. Response body contains no `id`, `saleId`, `clientId`, `organizationId`.

---

### STEP 15 — SM-BE-015
**File:** `docs/tickets/sales/SM-BE-015-public-payment-charge-endpoint.md`
**Depends on:** STEP 13 (paymentToken), STEP 14 (PublicPaymentsModule), STEP 5 (transition guard), STEP 7 (logging)
**Do:** Add `POST /public/invoice/:token/pay` to `PublicPaymentsController`. Rate-limit 5/min. Implement idempotency (already-paid check). Charge via Authorize.net. Mark invoice PAID. Update sale PENDING→ACTIVE if applicable. Log `PAYMENT_RECEIVED` + `STATUS_CHANGE`. Sanitize error messages.
**Gate:** Valid payment marks invoice PAID and creates PaymentTransaction. PENDING sale moves to ACTIVE. Already-paid returns `{ alreadyPaid: true }` with no charge. Unknown token returns 404. 6th request in 60s returns 429. Response never contains `saleId`/`clientId`/`organizationId`.

---

## Phase 2 — Frontend (SM-FE-001 → SM-FE-009)

> All Phase 1 backend tickets must be merged and stable before beginning frontend work.

---

### STEP 16 — SM-FE-001
**File:** `docs/tickets/sales/SM-FE-001-sales-list-page.md`
**Do:** Sales list page with filters (status, brand, client, date range, search), pagination, role-aware display. Filters in URL query params.

---

### STEP 17 — SM-FE-002
**File:** `docs/tickets/sales/SM-FE-002-revenue-summary-cards.md`
**Depends on:** SM-FE-001 and `GET /sales/summary` backend endpoint (add in this ticket if missing)

---

### STEP 18 — SM-FE-003
**File:** `docs/tickets/sales/SM-FE-003-invoice-overview-widget.md`
**Depends on:** `GET /invoices/summary` backend endpoint (add in this ticket if missing)

---

### STEP 19 — SM-FE-004
**File:** `docs/tickets/sales/SM-FE-004-sale-detail-page.md`
**Depends on:** SM-FE-001, SM-BE-003 (transition validation stable)
**Do:** Sale detail page: header, client/lead section, status controls panel with allowed transitions.

---

### STEP 20 — SM-FE-005
**File:** `docs/tickets/sales/SM-FE-005-sale-detail-items-invoices.md`
**Depends on:** SM-FE-004
**Do:** Items/pricing section with discount row. Invoices list. Transactions list.

---

### STEP 21 — SM-FE-006
**File:** `docs/tickets/sales/SM-FE-006-sale-detail-activity-subscription.md`
**Depends on:** SM-FE-005, SM-BE-007 (note endpoint)
**Do:** Subscription section. Activity timeline. Add Note modal.

---

### STEP 22 — SM-FE-007
**File:** `docs/tickets/sales/SM-FE-007-create-edit-sale-form.md`
**Depends on:** SM-FE-001, SM-BE-008 (discount), SM-BE-002 (package linkage)
**Do:** Create/edit form with client/lead selector, items editor (catalog + free-form), discount section, live total, payment plan.

---

### STEP 23 — SM-FE-008
**File:** `docs/tickets/sales/SM-FE-008-refund-chargeback-modals.md`
**Depends on:** SM-FE-004, SM-BE-009, SM-BE-010
**Do:** Refund modal (FULL/PARTIAL/MANUAL). Chargeback modal. Both role-restricted. Two-step confirmation.

---

### STEP 24 — SM-FE-009
**File:** `docs/tickets/sales/SM-FE-009-public-payment-page.md`
**Depends on:** SM-BE-014, SM-BE-015
**Do:** `/payment/[paymentToken]` page. Standalone layout (no auth). Accept.js integration. Brand-aware. Success / failure / already-paid states. Mobile-first. Add `/payment/*` to public routes in middleware.
**Env vars needed:** `NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID`, `NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY`, `NEXT_PUBLIC_AUTHORIZE_NET_ENV`

---

## Summary Table

| Step | Ticket | Type | Depends On |
|------|--------|------|------------|
| 1 | SM-BE-001 | Schema | — |
| 2 | SM-BE-002 | Schema | SM-BE-001 |
| 3 | SM-BE-004 | Service | SM-BE-001 |
| 4 | SM-BE-005 | Service | SM-BE-001 |
| 5 | SM-BE-003 | Service | SM-BE-001 |
| 6 | SM-BE-006 | Service | SM-BE-001 |
| 7 | SM-BE-007 | Service | SM-BE-001, 3–6 done |
| 8 | SM-BE-008 | Service | SM-BE-001, SM-BE-007 |
| 9 | SM-BE-009 | Endpoint | SM-BE-003, SM-BE-007 |
| 10 | SM-BE-010 | Endpoint | SM-BE-007 |
| 11 | SM-BE-011 | Webhook | SM-BE-007, SM-BE-009 |
| 12 | SM-BE-012 | Notifications | SM-BE-011 |
| 13 | SM-BE-013 | Schema+Service | SM-BE-001, SM-BE-007 |
| 14 | SM-BE-014 | Endpoint | SM-BE-013 |
| 15 | SM-BE-015 | Endpoint | SM-BE-013, SM-BE-014, SM-BE-003, SM-BE-007 |
| 16 | SM-FE-001 | Frontend | All BE done |
| 17 | SM-FE-002 | Frontend | SM-FE-001 |
| 18 | SM-FE-003 | Frontend | BE summary endpoint |
| 19 | SM-FE-004 | Frontend | SM-FE-001, SM-BE-003 |
| 20 | SM-FE-005 | Frontend | SM-FE-004 |
| 21 | SM-FE-006 | Frontend | SM-FE-005, SM-BE-007 |
| 22 | SM-FE-007 | Frontend | SM-FE-001, SM-BE-008, SM-BE-002 |
| 23 | SM-FE-008 | Frontend | SM-FE-004, SM-BE-009, SM-BE-010 |
| 24 | SM-FE-009 | Frontend | SM-BE-014, SM-BE-015 |
