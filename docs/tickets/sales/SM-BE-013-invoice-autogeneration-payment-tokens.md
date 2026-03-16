# SM-BE-013 — Invoice Auto-Generation Rules, Sequential Numbering & Payment Token Generation

## Ticket Metadata

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Ticket ID    | SM-BE-013                                                   |
| Title        | Invoice Auto-Generation Rules, Sequential Numbering & Payment Token Generation |
| Phase        | Phase 1 — Backend                                           |
| Priority     | High                                                        |
| Status       | [ ] Not Started                                             |
| Depends On   | SM-BE-001 (schema migration for new activity types), SM-BE-007 (activity logging helper) |

---

## Purpose

This ticket has three tightly coupled responsibilities:

1. Formally documents and tests `generateInvoices()` as a first-class business rule. It currently exists but is untested and undocumented.
2. Upgrades invoice number generation from the fragile `Date.now()` pattern to use the existing `InvoiceSequence` model for brand-scoped sequential numbers.
3. Adds `paymentToken` to each invoice at creation time to enable public payment links.

---

## User / Business Outcome

Every sale automatically produces the correct invoice records. Invoice numbers are human-readable and collision-free. Each invoice gets a secure payment token immediately, enabling payment link generation with no extra step.

---

## Exact Scope

1. Add `paymentToken String? @unique` to `Invoice` model in Prisma schema
2. Generate migration: `add_invoice_payment_token`
3. Backfill script: set `paymentToken = crypto.randomBytes(32).toString('hex')` for all existing invoices where `paymentToken IS NULL`
4. Update `generateInvoices()` in `apps/backend/core-service/src/modules/sales/sales.service.ts`:
   - Replace `invoiceNumber: INV-${Date.now()}` with sequential numbering via `InvoiceSequence`
   - Format: `INV-{YYYY}-{NNNN}` where NNNN is zero-padded, incremented per brand per year
   - Upsert `InvoiceSequence` inside the same `$transaction` as invoice creation
   - Add `paymentToken: crypto.randomBytes(32).toString('hex')` to each `tx.invoice.create()` call
5. Add `POST /invoices/:id/regenerate-token` endpoint (admin/owner only) that sets a new `paymentToken` on an existing invoice
6. Add unit tests for `generateInvoices()` covering:
   - ONE_TIME: creates exactly 1 invoice with correct amount, dueDate (+7 days), saleId, non-null paymentToken, sequential invoiceNumber
   - INSTALLMENTS(3): creates exactly 3 invoices, amounts sum to totalAmount, dueDates are monthly, each has unique paymentToken and sequential invoiceNumber
   - INSTALLMENTS rounding: last installment absorbs remainder
   - SUBSCRIPTION: creates 0 invoices

---

## Out of Scope

- PDF generation for invoices
- Manual invoice creation (explicitly out of scope per business rules)
- Invoice email delivery (Phase 3)
- Payment token expiry

---

## Backend Tasks

1. `libs/backend/prisma-client/prisma/schema.prisma` — add `paymentToken String? @unique` to Invoice model
2. Run `npx prisma migrate dev --name add_invoice_payment_token`
3. Create backfill script: `apps/backend/core-service/src/migrations/backfill-invoice-payment-tokens.ts` — iterate all invoices with null paymentToken, set token
4. `apps/backend/core-service/src/modules/sales/sales.service.ts` — update `generateInvoices()`:
   - Import `crypto` from Node.js built-ins
   - Add private method `private async getNextInvoiceNumber(tx: Prisma.TransactionClient, brandId: string): Promise<string>` using `InvoiceSequence` upsert
   - Update `tx.invoice.create()` calls to use `paymentToken: crypto.randomBytes(32).toString('hex')` and new invoice number
5. `apps/backend/core-service/src/modules/invoices/invoices.controller.ts` and `invoices.service.ts` — check if InvoicesModule exists; add `POST /invoices/:id/regenerate-token` endpoint (@Roles OWNER, ADMIN)
6. `apps/backend/core-service/src/modules/sales/sales.service.spec.ts` — add full unit tests for `generateInvoices()`
7. Run `npx prisma generate` after migration

---

## Frontend Tasks

None for this ticket.

---

## Schema / Migration Impact

```prisma
// Add to Invoice model:
paymentToken  String?  @unique  // 64-char hex, set at creation via crypto.randomBytes(32).toString('hex')
```

Migration name: `add_invoice_payment_token`. Nullable (safe for existing rows). Backfill required.

---

## API / Contracts Affected

- `ISale` interface: no change (invoices not in base ISale)
- `POST /invoices/:id/regenerate-token` (new): `{ invoiceId }` → `{ paymentToken: string }`
- Internal `generateInvoices()` now returns `void` (unchanged signature) but creates invoices with tokens

---

## Acceptance Criteria

1. After `POST /sales` with `paymentPlan: ONE_TIME`, exactly 1 invoice exists in DB linked to the sale, with non-null `paymentToken`.
2. After `POST /sales` with `paymentPlan: INSTALLMENTS` and `installmentCount: 4`, exactly 4 invoices exist, summing to `totalAmount`, each with a unique non-null `paymentToken`.
3. After `POST /sales` with `paymentPlan: SUBSCRIPTION`, 0 invoices are created.
4. Invoice numbers follow format `INV-YYYY-NNNN` (e.g., `INV-2026-0001`), incrementing per brand per year.
5. No two invoices within the same brand+year have the same `invoiceNumber` even under concurrent sale creation.
6. `POST /invoices/:id/regenerate-token` returns a new `paymentToken` and updates it in DB.
7. Backfill script sets tokens on all pre-existing invoices with null paymentToken.
8. All unit tests for `generateInvoices()` pass.

---

## Edge Cases

1. `installmentCount = 2`, `totalAmount = 1.00` → installment 1: $0.50, installment 2: $0.50
2. `installmentCount = 3`, `totalAmount = 1.00` → installments: $0.33, $0.33, $0.34 (last absorbs remainder)
3. Concurrent sale creation for same brand on same day — invoice numbers must not collide (use DB-level lock via upsert with increment)
4. `InvoiceSequence` row does not exist for this brand+year → upsert creates it with lastSeq=1

---

## Testing Requirements

- Unit tests (jest + prisma mock): `generateInvoices()` with ONE_TIME, INSTALLMENTS(2), INSTALLMENTS(3), SUBSCRIPTION, rounding edge cases
- Integration test: create a sale via POST /sales, query DB for invoices, assert count + amounts + paymentTokens set
- Migration test: apply migration to test DB, confirm Invoice table has `paymentToken` column
- Regression: existing sale creation still works; existing invoices unaffected

---

## Verification Steps

- [ ] `npx prisma migrate dev` completes without error
- [ ] `npx prisma generate` completes without error
- [ ] Unit tests pass: `nx test core-service --testFile=sales.service.spec.ts`
- [ ] Integration: create a ONE_TIME sale → DB has exactly 1 invoice with non-null paymentToken
- [ ] Integration: create INSTALLMENTS(3) sale → DB has 3 invoices, amounts sum to totalAmount
- [ ] Invoice numbers are sequential (INV-2026-0001, INV-2026-0002, ...) across multiple sales
- [ ] Backfill script runs without errors on staging DB

---

## Rollback / Risk Notes

- `paymentToken` is nullable: migration is non-breaking for existing rows
- Backfill script must be idempotent (skip invoices where paymentToken is already set)
- `InvoiceSequence` upsert must use a transaction-level lock to prevent concurrent numbering gaps
