# Sales Module Enhancement Plan

## Document Metadata

| Field       | Value                      |
|-------------|----------------------------|
| Version     | 1.1.0                      |
| Date        | 2026-03-17                 |
| Author      | Engineering / Product      |
| Status      | Approved for Implementation |

---

## 1. Overview & Goals

This plan governs the full enhancement of the Sales module inside `core-service`. The existing module provides a minimal CRUD skeleton with Authorize.net charging and ARB subscription creation. It does not enforce status lifecycle rules, does not log audit activity, lacks discount support, uses hard-delete, exposes incorrect role permissions, and has no webhook receiver for asynchronous payment events.

**Goals of this plan:**

1. Introduce a `DRAFT` status so sales can be staged before being submitted for processing.
2. Enforce a strict, role-gated status transition lifecycle that mirrors the business process.
3. Replace hard-delete with soft-delete using the existing `deletedAt` column on `Sale`.
4. Implement sale-level discounts (percentage and fixed-amount) with snapshot storage.
5. Enable package/catalog linkage on `SaleItem` while preserving free-form item entry.
6. Fix role-permission mismatches: restrict `PROJECT_MANAGER`, grant scoped access to agents.
7. Add collision detection when resolving a client from a lead (email-match warning).
8. Implement complete `SaleActivity` audit logging for every write operation.
9. Add a full/partial/manual refund endpoint backed by Authorize.net gateway calls.
10. Add manual chargeback tracking (Phase 1 — no gateway automation).
11. Build an Authorize.net ARB webhook receiver for asynchronous subscription/payment events.
12. Implement Phase 1 internal notifications (payment failures, overdue invoices, status changes, chargebacks).
13. Deliver a complete frontend (Next.js) for the Sales section: list page, summary cards, invoice widget, detail page, create/edit form, refund/chargeback modals.
14. Auto-generate invoice records from sale creation based on payment plan (ONE_TIME, INSTALLMENTS, SUBSCRIPTION) — no manual invoice creation required.
15. Enable public, token-gated invoice payment for clients and leads via branded payment links — no authentication session required.
16. Handle first-payment PENDING→ACTIVE sale status transition automatically via the public payment flow.

---

## 2. Current State Assumptions

The following gaps were identified through codebase analysis. All numbered items are addressed by at least one ticket in this plan.

1. **No DRAFT status.** `SaleStatus` enum is `PENDING | ACTIVE | COMPLETED | CANCELLED | ON_HOLD | REFUNDED`. There is no `DRAFT` state for staging a sale before submission.
2. **Hard-delete in `remove()`.** `SalesService.remove()` issues a `prisma.sale.delete()` call. The `deletedAt` column already exists on the `Sale` model but is never written.
3. **No status transition validation.** `SalesService.update()` accepts any `status` field value in the DTO and writes it directly with no guard on allowed transitions or required roles.
4. **Zero activity logging.** `SaleActivity` schema exists with `SaleActivityType` enum, but no `prisma.saleActivity.create()` call exists anywhere in `sales.service.ts`.
5. **`CHARGEBACK_FILED` enum value exists but no endpoint.** The enum value is declared but there is no controller route or service method for chargeback recording.
6. **No refund endpoint.** No `POST /sales/:id/refund` route or service method exists.
7. **No Authorize.net ARB webhook receiver.** There is no route to receive asynchronous payment notifications from Authorize.net. Subscription payment confirmations are never processed server-side.
8. **No discount fields on `Sale`.** There are no `discountType`, `discountValue`, or `discountedTotal` columns on the `Sale` model.
9. **No package linkage on `SaleItem`.** `SaleItem` has no `packageId` or `packageName` fields. All items are free-form.
10. **`PROJECT_MANAGER` can create/update sales.** The `@Roles()` decorators on `POST /sales` and `PATCH /sales/:id` include `PROJECT_MANAGER`, which is incorrect per business rules.
11. **Agents cannot create sales.** `FRONTSELL_AGENT` and `UPSELL_AGENT` are absent from the `@Roles()` decorator on `POST /sales`. Agents need scoped create access.
12. **No client-overlap warning.** `resolveClientIdFromLead()` silently reuses an email-matched client with no warning returned to the caller.
13. **`INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT` missing from `SaleActivityType`.** These activity types are needed for full audit coverage but are absent from the enum.
14. **`REFUND` may be missing from `TransactionType`.** Needs verification; if absent it must be added before the refund endpoint can be implemented.
15. **`CHARGEBACK` may be missing from `TransactionType`.** Same as above.
16. **No summary/analytics endpoint.** There is no `GET /sales/summary` endpoint for revenue aggregation cards in the frontend.
17. **No invoice summary endpoint.** There is no `GET /invoices/summary` endpoint for the invoice overview widget.
18. **No `POST /sales/:id/note` endpoint.** The activity timeline needs a user-facing note endpoint that does not currently exist.
19. **Invoice numbers use `Date.now()` (fragile).** `generateInvoices()` uses `INV-${Date.now()}` which can collide under concurrent requests. `InvoiceSequence` model exists and must be used instead.
20. **No `paymentToken` on `Invoice`.** Invoices have no public-facing token for payment link generation. A `paymentToken` field is needed.
21. **No public payment API.** There is no unauthenticated endpoint for clients to pay invoices. The existing `POST /sales/:id/charge` is admin-only.
22. **Invoice auto-generation exists but has no test coverage or documented business rules.** `generateInvoices()` is untested and not documented as a canonical rule.

---

## 3. Scope

### Phase 1 — Backend Enhancements (SM-BE-001 through SM-BE-015)

- Schema migrations: DRAFT status, discount fields, SaleItem package linkage, new SaleActivityType values, TransactionType values.
- Status transition validation with role-gating.
- Soft-delete conversion.
- Role-permission fixes (PROJECT_MANAGER, agents).
- Client collision detection with warning metadata.
- Complete SaleActivity audit logging for all writes.
- Discount calculation logic (sale-level, PERCENTAGE and FIXED_AMOUNT).
- Refund endpoint (FULL / PARTIAL / MANUAL) backed by Authorize.net.
- Chargeback tracking endpoint (manual, Phase 1).
- Authorize.net ARB webhook receiver with HMAC-SHA512 signature verification.
- Phase 1 internal notifications (payment failures, overdue, status changes, chargebacks).
- Invoice auto-generation rules, sequential invoice numbering via InvoiceSequence, and paymentToken generation on every invoice. (SM-BE-013)
- Public payment API: GET /public/invoice/:token and POST /public/invoice/:token/pay — unauthenticated, token-gated, rate-limited. (SM-BE-014, SM-BE-015)

### Phase 2 — Frontend (SM-FE-001 through SM-FE-009)

- Sales list page with filters, pagination, role-aware display.
- Revenue summary cards (total, active, pending, cancelled/refunded).
- Invoice overview widget (unpaid, overdue, paid this month, upcoming due).
- Sale detail page: header, client/lead section, status controls.
- Sale detail page: items/pricing, invoices, transactions.
- Sale detail page: subscription section, activity timeline, add-note.
- Create/edit sale form with catalog picker, discount, live total.
- Refund modal and chargeback modal (role-restricted).
- Brand-aware public payment page with Authorize.net Accept.js card tokenization. (SM-FE-009)

### Phase 3 — Client Portal (Planned, Not Implemented)

- Client-facing invoice email delivery.
- Payment receipt emails.
- Failed payment notification emails to clients.
- Subscription lifecycle emails.
- Client self-service portal for viewing invoices and payment history.

---

## 4. Out of Scope

The following items are explicitly excluded from this implementation plan:

- **Tax support.** No tax calculation, tax rates, or tax line items at any phase.
- **`LOST` or `EXPIRED` sale status.** Not part of the agreed lifecycle.
- **Item-level discounts (Phase 1).** Discounts apply only at the sale level. Individual `SaleItem` discount fields are deferred to a future phase.
- **Auto-charging (Phase 1).** One-time and installment payments are charged manually by staff. No scheduled auto-charge job.
- **Client portal (Phase 1 and Phase 2).** All client-facing features are Phase 3.
- **Direct gateway chargeback automation.** Chargeback filing with Authorize.net's dispute API is not implemented. Phase 1 is manual record-keeping only.
- **Multi-currency conversion.** The `currency` field is stored but no conversion logic is added.
- **Bulk operations.** No bulk status update, bulk archive, or bulk charge endpoints.
- **PDF generation for invoices (Phase 1).** The `pdfUrl` field exists on `Invoice` but PDF generation is a separate concern.
- **Manual invoice creation.** Invoices are always derived from sale creation. There is no `POST /invoices` endpoint for manually creating standalone invoices outside of a sale.
- **Invoice payment token expiry (Phase 1).** Tokens do not expire in Phase 1. Token revocation is handled by regenerating a new token via an internal admin endpoint.

---

## 5. Data Model Changes

All changes are additive and non-breaking (new columns with defaults or nullable, new enum values appended).

### 5.1 Add `DRAFT` to `SaleStatus`

```prisma
enum SaleStatus {
  DRAFT       // NEW
  PENDING
  ACTIVE
  COMPLETED
  CANCELLED
  ON_HOLD
  REFUNDED
}
```

### 5.2 Add `DiscountType` Enum (New)

```prisma
enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}
```

### 5.3 Add Discount Fields to `Sale`

```prisma
model Sale {
  // ... existing fields ...
  discountType      DiscountType?
  discountValue     Decimal?      @db.Decimal(10, 2)
  discountedTotal   Decimal?      @db.Decimal(10, 2)
}
```

### 5.4 Add Package Linkage Fields to `SaleItem`

```prisma
model SaleItem {
  // ... existing fields ...
  packageId    String?
  packageName  String?
}
```

`packageId` is a soft reference only — no `@relation` directive. This is intentional to preserve historical data if the package catalog entry is later deleted or renamed.

### 5.5 Add New Values to `SaleActivityType`

```prisma
enum SaleActivityType {
  CREATED
  STATUS_CHANGE
  INVOICE_CREATED      // NEW
  INVOICE_UPDATED      // NEW
  PAYMENT_RECEIVED
  PAYMENT_FAILED
  REFUND_ISSUED
  CHARGEBACK_FILED
  NOTE
  MANUAL_ADJUSTMENT    // NEW
  DISCOUNT_APPLIED     // NEW
}
```

### 5.6 Add Values to `TransactionType` (if missing)

```prisma
enum TransactionType {
  // existing values preserved
  REFUND      // add if not present
  CHARGEBACK  // add if not present
}
```

### 5.7 Migration Notes

- All enum additions in PostgreSQL require `ALTER TYPE ... ADD VALUE` statements.
- New nullable columns on `Sale` and `SaleItem` require `ALTER TABLE ... ADD COLUMN` with no default constraint issues.
- Prisma migration will be generated with `npx prisma migrate dev --name sales_module_enhancement`.
- Existing data is unaffected. All new columns are `NULL` on existing rows.

### 5.8 Add `paymentToken` to `Invoice`

```prisma
model Invoice {
  // ... existing fields ...
  paymentToken  String?  @unique  // 64-char cryptographic hex token for public payment link
}
```

- Token is generated automatically by `generateInvoices()` using `crypto.randomBytes(32).toString('hex')`.
- Token is `@unique` to prevent collisions.
- Token is nullable to allow safe migration of existing invoice rows.
- Token does NOT expire in Phase 1.
- Token can be regenerated via `POST /invoices/:id/regenerate-token` (internal, admin-only).

### 5.9 Fix Invoice Number Generation

`InvoiceSequence` already exists in the schema. `generateInvoices()` must be updated to use it:
- Format: `INV-{YYYY}-{brandId[:4].toUpperCase()}-{NNNN}` (zero-padded to 4 digits per brand per year)
- `InvoiceSequence` is upserted per `brandId` + `year` inside the same transaction as invoice creation
- This replaces the fragile `INV-${Date.now()}` pattern

---

## 6. Status Transition Matrix

| From \ To     | DRAFT | PENDING | ACTIVE | COMPLETED | ON_HOLD | CANCELLED | REFUNDED |
|---------------|-------|---------|--------|-----------|---------|-----------|----------|
| **DRAFT**     | —     | ✅ [1]  | ❌     | ❌        | ❌      | ❌        | ❌       |
| **PENDING**   | ❌    | —       | ✅ [2] | ❌        | ❌      | ✅ [3]    | ❌       |
| **ACTIVE**    | ❌    | ❌      | —      | ✅ [4]    | ✅ [5]  | ✅ [3]    | ✅ [6]   |
| **COMPLETED** | ❌    | ❌      | ❌     | —         | ❌      | ❌        | ✅ [6]   |
| **ON_HOLD**   | ❌    | ❌      | ✅ [4] | ❌        | —       | ✅ [3]    | ❌       |
| **CANCELLED** | ❌    | ❌      | ❌     | ❌        | ❌      | —         | ❌       |
| **REFUNDED**  | ❌    | ❌      | ❌     | ❌        | ❌      | ❌        | —        |

**Legend:**
- [1] Manual. Allowed roles: OWNER, ADMIN, SALES_MANAGER, FRONTSELL_AGENT (scoped), UPSELL_AGENT (scoped).
- [2] Automatic on first successful payment OR manual. Manual allowed roles: OWNER, ADMIN, SALES_MANAGER.
- [3] Manual. Allowed roles: OWNER, ADMIN, SALES_MANAGER only. Reason field encouraged.
- [4] Manual. Allowed roles: OWNER, ADMIN, SALES_MANAGER.
- [5] Manual. Allowed roles: OWNER, ADMIN, SALES_MANAGER.
- [6] Manual. Allowed roles: OWNER, ADMIN only.
- ❌ = transition not allowed under any circumstance.
- — = no-op (same status, not a transition).

---

## 7. Role Permission Matrix

| Action                          | OWNER | ADMIN | SALES_MANAGER | FRONTSELL_AGENT | UPSELL_AGENT | PROJECT_MANAGER |
|---------------------------------|-------|-------|---------------|-----------------|--------------|-----------------|
| Create sale (any status)        | ✅    | ✅    | ✅            | DRAFT/PENDING scoped | DRAFT/PENDING scoped | ❌ |
| Read sale list                  | ✅    | ✅    | ✅            | scoped          | scoped       | ✅ (read-only)  |
| Read sale detail                | ✅    | ✅    | ✅            | scoped          | scoped       | ✅ (read-only)  |
| Update sale (non-financial)     | ✅    | ✅    | ✅            | scoped only     | scoped only  | ❌              |
| Update financial totals         | ✅    | ✅    | ✅            | ❌              | ❌           | ❌              |
| DRAFT → PENDING                 | ✅    | ✅    | ✅            | scoped          | scoped       | ❌              |
| PENDING → ACTIVE (manual)       | ✅    | ✅    | ✅            | ❌              | ❌           | ❌              |
| ACTIVE → COMPLETED              | ✅    | ✅    | ✅            | ❌              | ❌           | ❌              |
| ACTIVE/PENDING → CANCELLED      | ✅    | ✅    | ✅            | ❌              | ❌           | ❌              |
| ACTIVE → ON_HOLD / ON_HOLD → ACTIVE | ✅ | ✅  | ✅            | ❌              | ❌           | ❌              |
| Refund (FULL/PARTIAL/MANUAL)    | ✅    | ✅    | ❌            | ❌              | ❌           | ❌              |
| Archive (soft-delete)           | ✅    | ✅    | ❌            | ❌              | ❌           | ❌              |
| Charge invoice                  | ✅    | ✅    | ❌            | ❌              | ❌           | ❌              |
| Cancel ARB subscription         | ✅    | ✅    | ❌            | ❌              | ❌           | ❌              |
| File chargeback                 | ✅    | ✅    | ❌            | ❌              | ❌           | ❌              |
| Add note (activity)             | ✅    | ✅    | ✅            | scoped          | scoped       | ✅              |

*"scoped" means: only for sales where the actor is the assigned agent or the client was assigned to them.*

---

## 8. API Changes

### New Endpoints

| Method | Path                              | Description                                         | Auth                           | Ticket     |
|--------|-----------------------------------|-----------------------------------------------------|--------------------------------|------------|
| POST   | /sales/:id/refund                 | Issue full, partial, or manual refund               | JWT                            | SM-BE-009  |
| POST   | /sales/:id/chargeback             | Record a chargeback event (manual tracking)         | JWT                            | SM-BE-010  |
| POST   | /sales/:id/note                   | Add a NOTE activity entry to a sale                 | JWT                            | SM-BE-007  |
| POST   | /webhooks/authorize-net           | Receive and process Authorize.net ARB webhooks      | HMAC signature                 | SM-BE-011  |
| GET    | /sales/summary                    | Revenue aggregation for dashboard cards             | JWT                            | SM-FE-002  |
| GET    | /invoices/summary                 | Invoice counts and totals for dashboard widget      | JWT                            | SM-FE-003  |
| GET    | /public/invoice/:token            | Public invoice summary for payment page             | None (token-gated)             | SM-BE-014  |
| POST   | /public/invoice/:token/pay        | Charge invoice via tokenized card                   | None (token-gated, rate-limited) | SM-BE-015 |
| POST   | /invoices/:id/regenerate-token    | Admin: regenerate payment token                     | JWT + OWNER/ADMIN              | SM-BE-013  |

### Modified Endpoints

| Method | Path            | Change Summary                                                  | Ticket     |
|--------|-----------------|-----------------------------------------------------------------|------------|
| POST   | /sales          | Add discount fields; agent scoping; activity logging; collision warning | SM-BE-005, SM-BE-007, SM-BE-008 |
| PATCH  | /sales/:id      | Add transition validation; role-gating; discount recalc; activity logging | SM-BE-003, SM-BE-007, SM-BE-008 |
| DELETE | /sales/:id      | Convert to soft-delete; restrict to OWNER/ADMIN                 | SM-BE-004  |
| GET    | /sales          | Add `deletedAt IS NULL` filter; ensure PROJECT_MANAGER can access | SM-BE-004, SM-BE-005 |
| GET    | /sales/:id      | Include `collisionWarning` metadata if applicable               | SM-BE-006  |

---

## 9. Validation Rules

1. A sale must have either a `clientId` or a `leadId` at creation time; both may be provided.
2. If a `leadId` is provided and the lead has a `convertedClientId`, that client is used directly.
3. If a `leadId` is provided and the lead has no `convertedClientId`, `resolveClientIdFromLead()` attempts email-match lookup. If a match is found that is not the lead's own client, a `collisionWarning` is returned.
4. A sale must have either at least one `SaleItem` or an explicit `totalAmount`. If items are present, `totalAmount` is computed from them.
5. Each `SaleItem` must have `name`, `quantity` (> 0), and `unitPrice` (≥ 0).
6. `discountValue` must be > 0 if `discountType` is set.
7. `discountValue` must be ≤ 100 if `discountType` is `PERCENTAGE`.
8. `discountValue` must be < `totalAmount` if `discountType` is `FIXED_AMOUNT`.
9. `discountedTotal` is always computed server-side; client-supplied values are ignored.
10. `installmentCount` is required and must be between 2 and 60 if `paymentPlan` is `INSTALLMENTS`.
11. Status transitions not listed in the transition matrix (Section 6) must be rejected with HTTP 422.
12. Role-restricted transitions (e.g., REFUNDED) must be rejected with HTTP 403 if the actor lacks the required role.
13. Agents (`FRONTSELL_AGENT`, `UPSELL_AGENT`) may only set status `DRAFT` or `PENDING` at creation time.
14. Agents may not modify `totalAmount`, `currency`, `paymentPlan`, `discountType`, or `discountValue` in update operations.
15. Agents may only create or update sales scoped to clients linked to their assigned leads.
16. The `remove()` (soft-delete) operation is restricted to `OWNER` and `ADMIN` roles.
17. `POST /sales/:id/refund` requires sale status to be `ACTIVE` or `COMPLETED`.
18. `POST /sales/:id/refund` with `type: PARTIAL` requires `amount` > 0 and ≤ total paid amount.
19. `POST /sales/:id/refund` with `type: MANUAL` requires a non-empty `note` field (minimum 10 characters).
20. `POST /sales/:id/chargeback` requires `notes` of at least 10 characters.
21. Discount fields (`discountType`, `discountValue`) may only be changed when sale status is `DRAFT` or `PENDING`.
22. `packageId` on `SaleItem` is a soft reference; no foreign key constraint is enforced.
23. ARB webhook requests with an invalid or missing `X-ANET-Signature` header must be rejected with HTTP 401.
24. Invoice records are created automatically by `generateInvoices()` on sale creation; no external endpoint may create standalone invoices.
25. Each invoice must have a `paymentToken` set at creation time via `crypto.randomBytes(32).toString('hex')`.
26. `POST /public/invoice/:token/pay` must check invoice.status before charging; if status is PAID, return `{ success: true, alreadyPaid: true }` and do NOT submit a charge to Authorize.net.
27. `POST /public/invoice/:token/pay` is rate-limited to 5 requests per IP per minute.
28. Public payment endpoints must NEVER expose `saleId`, `clientId`, `organizationId`, `customerProfileId`, `paymentProfileId`, or `subscriptionId` in any response.
29. If paymentToken does not match any invoice, return HTTP 404. Do NOT distinguish between 'token invalid' and 'invoice not found' to avoid enumeration.
30. On successful public payment where `sale.status === PENDING`, the sale status must be updated to `ACTIVE` in the same transaction.

---

## 10. Audit & Activity Requirements

| Operation                                 | Activity Type      | Data Payload                                                          |
|-------------------------------------------|--------------------|-----------------------------------------------------------------------|
| Sale created                              | CREATED            | `{ totalAmount, status, paymentPlan, clientId, leadId? }`             |
| Invoice generated on create               | INVOICE_CREATED    | `{ invoiceId, invoiceNumber, amount, dueDate }`                       |
| Discount applied on create                | DISCOUNT_APPLIED   | `{ discountType, discountValue, discountedTotal }`                    |
| Status changed via update                 | STATUS_CHANGE      | `{ from: oldStatus, to: newStatus }`                                  |
| Discount changed via update               | DISCOUNT_APPLIED   | `{ discountType, discountValue, discountedTotal }`                    |
| Invoice updated (status change)           | INVOICE_UPDATED    | `{ invoiceId, invoiceNumber, oldStatus, newStatus }`                  |
| Payment charged successfully              | PAYMENT_RECEIVED   | `{ transactionId, amount, invoiceId? }`                               |
| Payment charge failed                     | PAYMENT_FAILED     | `{ amount, reason, responseCode? }`                                   |
| ARB subscription activated                | STATUS_CHANGE      | `{ from: 'PENDING', to: 'ACTIVE', trigger: 'subscription_activated' }` |
| ARB subscription payment received         | PAYMENT_RECEIVED   | `{ transactionId, amount, subscriptionId }`                           |
| ARB subscription payment failed           | PAYMENT_FAILED     | `{ amount, subscriptionId, reason }`                                  |
| Refund issued                             | REFUND_ISSUED      | `{ amount, type, transactionId?, note? }`                             |
| Chargeback filed                          | CHARGEBACK_FILED   | `{ amount, notes, evidenceUrl?, chargebackDate }`                     |
| Sale soft-deleted (archived)              | STATUS_CHANGE      | `{ action: 'ARCHIVED', deletedAt }`                                   |
| Manual note added                         | NOTE               | `{ note: text }`                                                      |
| Manual adjustment to totals               | MANUAL_ADJUSTMENT  | `{ field, oldValue, newValue }`                                       |
| Public payment received                   | PAYMENT_RECEIVED   | `{ amount, invoiceId, invoiceNumber, source: 'public_payment_link' }` |
| Public payment failed                     | PAYMENT_FAILED     | `{ amount, invoiceId, reason, source: 'public_payment_link' }`        |
| Sale auto-activated                       | STATUS_CHANGE      | `{ from: 'PENDING', to: 'ACTIVE', trigger: 'first_public_payment' }`  |

All `SaleActivity` records must include `saleId`, `userId` (actor), and `createdAt` (auto). `userId` must be threaded from the authenticated request context through every service method.

---

## 11. Migration Strategy

All database changes in this plan are additive. No existing columns are dropped or renamed. No existing enum values are removed.

**Step 1 — Generate migration (SM-BE-001):**
- Add `DRAFT` to `SaleStatus` enum.
- Add `DiscountType` enum (`PERCENTAGE`, `FIXED_AMOUNT`).
- Add `discountType`, `discountValue`, `discountedTotal` to `Sale`.
- Add `INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT` to `SaleActivityType`.
- Run: `npx prisma migrate dev --name add_draft_status_and_discount_fields`

**Step 2 — Generate migration (SM-BE-002):**
- Add `packageId` (String?) and `packageName` (String?) to `SaleItem`.
- Run: `npx prisma migrate dev --name add_sale_item_package_linkage`

**Step 3 — Verify `TransactionType` enum (SM-BE-009):**
- Check if `REFUND` and `CHARGEBACK` exist. If not, add them.
- Run: `npx prisma migrate dev --name add_transaction_type_refund_chargeback` (only if needed).

**Step 4 — Generate migration (SM-BE-013):**
- Add `paymentToken String? @unique` to `Invoice` model.
- Run: `npx prisma migrate dev --name add_invoice_payment_token`
- After migration: backfill `paymentToken` for all existing invoices via a one-time script.

**Non-breaking verification:**
- All existing `Sale` rows will have `NULL` for new discount columns — this is valid.
- All existing `SaleItem` rows will have `NULL` for `packageId` and `packageName` — this is valid.
- Existing `SaleStatus` values (`PENDING`, `ACTIVE`, etc.) remain unchanged.
- Existing `Invoice` rows will have `NULL` for `paymentToken` — backfill script required after migration.
- Prisma client regeneration (`npx prisma generate`) is required after each migration.

**Rollback plan:**
- Enum value additions in PostgreSQL cannot be rolled back with `DROP TYPE ... VALUE`. If rollback is needed, the enum value must remain but application code can be reverted.
- Nullable column additions can be rolled back with `ALTER TABLE ... DROP COLUMN`.
- Always test migration rollback in a staging environment before production deployment.

---

## 12. Rollout Order

The following dependency chain must be respected during implementation:

1. **SM-BE-001** — Schema migration (all enum/column additions). No other backend ticket can start until this is merged.
2. **SM-BE-002** — SaleItem package linkage (depends on SM-BE-001 migration being applied).
3. **SM-BE-004** — Soft-delete conversion (no schema dependency, but must ship with SM-BE-001).
4. **SM-BE-005** — Role-permission fix (no schema dependency; can be done in parallel with SM-BE-002/004).
5. **SM-BE-003** — Status transition validation (depends on SM-BE-001 for DRAFT enum value).
6. **SM-BE-006** — Client collision detection (no schema dependency; can be done in parallel).
7. **SM-BE-007** — Activity logging (depends on SM-BE-001 for new SaleActivityType values; must wrap all prior service changes).
8. **SM-BE-008** — Discount logic (depends on SM-BE-001 for discount fields).
9. **SM-BE-009** — Refund endpoint (depends on SM-BE-001 for TransactionType.REFUND; depends on SM-BE-007 for logging).
10. **SM-BE-010** — Chargeback endpoint (depends on SM-BE-001 for TransactionType.CHARGEBACK; depends on SM-BE-007).
11. **SM-BE-011** — ARB webhook receiver (depends on SM-BE-007 for logging; depends on SM-BE-009 for refund event handling).
12. **SM-BE-012** — Internal notifications (depends on SM-BE-011; can use events from all prior tickets).
13. **SM-BE-013** — Invoice auto-generation rules + payment token generation (depends on SM-BE-001 schema for activity types; depends on SM-BE-007 for activity logging)
14. **SM-BE-014** — Public invoice detail endpoint (depends on SM-BE-013 for paymentToken)
15. **SM-BE-015** — Public payment charge endpoint (depends on SM-BE-014; depends on SM-BE-007 for logging; depends on SM-BE-003 for PENDING→ACTIVE transition)
16. **SM-FE-009** — Public payment page (depends on SM-BE-014, SM-BE-015)
17. **SM-FE-001** — Sales list page (depends on all BE tickets for stable API).
18. **SM-FE-002** — Revenue summary cards (depends on SM-FE-001 and the `GET /sales/summary` endpoint).
19. **SM-FE-003** — Invoice overview widget (depends on `GET /invoices/summary` endpoint).
20. **SM-FE-004** — Sale detail page header/status (depends on SM-FE-001, SM-BE-003).
21. **SM-FE-005** — Sale detail items/invoices/transactions (depends on SM-FE-004).
22. **SM-FE-006** — Sale detail subscription/activity timeline (depends on SM-FE-005, SM-BE-007).
23. **SM-FE-007** — Create/edit form (depends on SM-FE-001, SM-BE-008, SM-BE-002).
24. **SM-FE-008** — Refund/chargeback modals (depends on SM-FE-004, SM-BE-009, SM-BE-010).

---

## 13. Dependencies

### External Services

| Dependency          | Purpose                                              | Notes                                          |
|---------------------|------------------------------------------------------|------------------------------------------------|
| Authorize.net       | Gateway for charge, ARB subscription, refund calls   | Credentials in `AUTHORIZE_NET_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`, `AUTHORIZE_NET_SIGNATURE_KEY` env vars |
| PostgreSQL          | Primary data store (via Prisma)                      | No schema changes to other modules             |
| Redis               | Caching layer for sales list and detail queries      | Existing cache infrastructure in core-service  |

### Internal Services

| Dependency              | Purpose                                              | Notes                                          |
|-------------------------|------------------------------------------------------|------------------------------------------------|
| Package Catalog API     | Typeahead search for `PackageCatalogPicker` in FE    | Endpoint TBD — may require a separate ticket if not yet built |
| Notification Service    | Phase 1 internal notifications (SM-BE-012)           | If no service exists, SM-BE-012 creates a lightweight one |
| Auth / JWT context      | `user.sub` (userId) and `user.role` passed from JWT  | Already wired in core-service guards           |

---

## 14. Risks

| Risk                                                        | Likelihood | Impact  | Mitigation                                                         |
|-------------------------------------------------------------|------------|---------|--------------------------------------------------------------------|
| Enum `ALTER TYPE ADD VALUE` cannot be transactionally rolled back in PostgreSQL | Medium | Medium | Test in staging; document that migration must be forward-only on production |
| Authorize.net ARB webhook delivery order is not guaranteed  | Medium     | High    | Use idempotency checks on `transactionId`; handle out-of-order events gracefully |
| Agent scoping logic adds latency (extra DB join per create/update) | Low | Low | Add DB index on `Lead.assignedUserId`; cache client-agent mapping |
| Collision detection returns warning but staff ignores it, causing duplicate clients | Medium | Medium | Log collision warning in SaleActivity; add UI banner on sale detail if collisionWarning was set |
| ARB signature key not configured in some environments       | Low        | High    | Fail closed: if `AUTHORIZE_NET_SIGNATURE_KEY` is not set, reject all webhook requests with 500 and alert |
| Package catalog does not yet have a stable API              | Medium     | Medium  | SM-FE-007 `PackageCatalogPicker` must degrade gracefully to free-form entry if catalog API is unavailable |
| Existing sales with no `SaleActivity` records will have gaps in their timeline | High | Low | Accept as known gap; document that activity history starts from deployment date |
| Discount recalculation on update could conflict with already-charged invoices | Medium | High | Validation rule: block discount changes on ACTIVE/COMPLETED sales |

---

## 15. Open Questions

1. **Package catalog endpoint:** Does a stable `GET /packages` or similar endpoint exist in core-service or another service for the `PackageCatalogPicker` component? If not, what is the expected API contract and who owns that ticket?
2. **Notification storage:** Does a `Notification` Prisma model already exist in core-service? If not, should SM-BE-012 create one, or should notifications be emitted as events only (no persistence) in Phase 1?
3. **Collision warning persistence:** Should the `collisionWarning` metadata from sale creation be stored on the `Sale` record (e.g., a `metadata Json?` column) so it can be re-surfaced on the detail page, or should it only be returned in the creation response?
4. **Invoice generation logic:** On create, are invoices generated automatically based on `paymentPlan` (e.g., one invoice per installment)? Or does the user manually create invoices? The existing `generateInvoices()` helper's exact behavior needs to be confirmed before SM-BE-007 and SM-BE-008 are implemented. *(Resolved: auto-generation is canonical — see SM-BE-013)*
5. **ARB subscription payment matching:** When an ARB webhook arrives for a subscription payment, how are installment invoices matched? By sequence number, by amount, or by a stored mapping? This affects SM-BE-011 implementation complexity.
6. **`assignedUserId` on Sale:** Is there a field for the assigned sales agent on a `Sale` record? If not, how does the system determine who to notify on payment failure? Does the notification go to the org's sales managers only?
7. **Partial refund cap calculation:** "Amount must not exceed total paid amount" — should this be computed as the sum of all `PAYMENT_RECEIVED` transactions on the sale, excluding already-refunded amounts?
8. **`cardLastFour` storage:** Should Authorize.net's card-last-four be stored on the `Sale` or `PaymentTransaction` record for convenience (so users don't have to re-enter it on each refund)?

---

## 16. Traceability

| Feature / Requirement                        | Ticket(s)                                    |
|----------------------------------------------|----------------------------------------------|
| DRAFT status in lifecycle                    | SM-BE-001, SM-BE-003                         |
| Discount fields (PERCENTAGE / FIXED_AMOUNT)  | SM-BE-001, SM-BE-008                         |
| SaleItem package linkage                     | SM-BE-002                                    |
| Status transition validation                 | SM-BE-003                                    |
| Soft-delete conversion                       | SM-BE-004                                    |
| Role-permission fix (PM, agents)             | SM-BE-005                                    |
| Agent scoped create/update                   | SM-BE-005                                    |
| Client collision detection                   | SM-BE-006                                    |
| SaleActivity audit logging                   | SM-BE-001 (schema), SM-BE-007 (impl)         |
| Refund endpoint                              | SM-BE-009                                    |
| Chargeback tracking                          | SM-BE-010                                    |
| ARB webhook receiver                         | SM-BE-011                                    |
| Phase 1 internal notifications               | SM-BE-012                                    |
| Sales list page + filters                    | SM-FE-001                                    |
| Revenue summary cards                        | SM-FE-002                                    |
| Invoice overview widget                      | SM-FE-003                                    |
| Sale detail: header + status controls        | SM-FE-004                                    |
| Sale detail: items + invoices + transactions | SM-FE-005                                    |
| Sale detail: subscription + activity         | SM-FE-006                                    |
| Create/edit sale form                        | SM-FE-007                                    |
| Refund modal + chargeback modal              | SM-FE-008                                    |
| Add note endpoint                            | SM-BE-007                                    |
| GET /sales/summary endpoint                  | SM-FE-002 (backend task section)             |
| GET /invoices/summary endpoint               | SM-FE-003 (backend task section)             |
| Invoice auto-generation (business rule + testing) | SM-BE-013                              |
| Sequential invoice numbering (InvoiceSequence) | SM-BE-013                                 |
| Invoice paymentToken generation              | SM-BE-013                                    |
| Public invoice detail endpoint               | SM-BE-014                                    |
| Public payment charge endpoint               | SM-BE-015                                    |
| Brand-aware public payment page              | SM-FE-009                                    |
| PENDING→ACTIVE on first public payment       | SM-BE-015                                    |
| Duplicate payment idempotency                | SM-BE-015                                    |

---

## 17. Definition of Done

The plan is complete and the sales module is shippable when ALL of the following are true:

- [ ] All SM-BE-001 through SM-BE-015 tickets are marked Done and merged to main.
- [ ] All SM-FE-001 through SM-FE-009 tickets are marked Done and merged to main.
- [ ] All Prisma migrations have been applied to the staging database without errors.
- [ ] All unit tests for new service methods pass with no skipped assertions.
- [ ] All integration tests for new API endpoints return expected responses.
- [ ] Status transition validation rejects all invalid transitions with HTTP 422.
- [ ] Role-gating rejects unauthorized actors with HTTP 403 on all protected operations.
- [ ] Soft-delete: no `DELETE` SQL is issued; all archived sales have `deletedAt` set.
- [ ] Activity log: every write operation results in at least one `SaleActivity` record.
- [ ] Authorize.net ARB webhook: signature verification passes for valid payloads and rejects tampered payloads.
- [ ] Refund endpoint: full refund updates sale status to REFUNDED; REFUND_ISSUED activity logged.
- [ ] Chargeback endpoint: CHARGEBACK_FILED activity logged; sale status unchanged.
- [ ] Discount: `discountedTotal` is always server-computed; attempting to set it directly from client has no effect.
- [ ] Agent scoping: agent cannot access sales outside their assigned clients (403 returned).
- [ ] PROJECT_MANAGER can read sales but receives 403 on create/update/delete.
- [ ] Collision warning: returned in API response when email-matched client differs from lead's own client.
- [ ] Frontend sales list renders with all filter combinations without errors.
- [ ] Revenue summary cards display correct aggregated totals.
- [ ] Invoice overview widget correctly identifies overdue invoices (dueDate < today AND status = UNPAID).
- [ ] Sale detail page renders all sections for all sale types (one-time, installment, subscription).
- [ ] Create/edit form validates all business rules client-side before submission.
- [ ] Refund modal and chargeback modal are hidden from roles without permission.
- [ ] QA sign-off from product owner on all acceptance criteria in each ticket.
- [ ] No TypeScript compilation errors (`tsc --noEmit` passes).
- [ ] No critical or high severity ESLint violations.
- [ ] Invoice auto-generation: ONE_TIME creates exactly 1 invoice; INSTALLMENTS(n) creates exactly n invoices; each invoice links to parent sale.
- [ ] Invoice numbers use InvoiceSequence (brand-scoped, year-scoped, sequential, zero-padded).
- [ ] Every new invoice has a non-null `paymentToken` set at creation time.
- [ ] `GET /public/invoice/:token` returns correct brand, invoice details, and no internal IDs.
- [ ] `POST /public/invoice/:token/pay` with valid token + valid opaqueData charges successfully and marks invoice PAID.
- [ ] `POST /public/invoice/:token/pay` with an already-paid invoice returns `{ success: true, alreadyPaid: true }` and does NOT charge again.
- [ ] `POST /public/invoice/:token/pay` with invalid/unknown token returns 404.
- [ ] `POST /public/invoice/:token/pay` rate limiter blocks the 6th request within 60 seconds from the same IP.
- [ ] Sale status transitions PENDING→ACTIVE when first public payment succeeds.
- [ ] No internal IDs (saleId, clientId, organizationId) appear in any public endpoint response.
- [ ] Public payment page renders correct brand logo and name.
- [ ] Public payment page requires no authenticated session.
- [ ] Public payment page shows correct success and failure states.
