# SM-BE-015 — Public Invoice Payment Charge Endpoint (No Auth, Token-Gated, Rate-Limited)

## Ticket Metadata

| Field        | Value                                                                              |
|--------------|------------------------------------------------------------------------------------|
| Ticket ID    | SM-BE-015                                                                          |
| Title        | Public Invoice Payment Charge Endpoint (No Auth, Token-Gated, Rate-Limited)        |
| Phase        | Phase 1 — Backend                                                                  |
| Priority     | Critical                                                                           |
| Status       | [ ] Not Started                                                                    |
| Depends On   | SM-BE-013 (paymentToken), SM-BE-014 (PublicPaymentsModule), SM-BE-003 (status transitions), SM-BE-007 (activity logging) |

---

## Purpose

Allow a client to pay their invoice through a public URL without logging in. The endpoint accepts a tokenized card payload from Authorize.net Accept.js, charges the linked invoice, marks it paid, creates a transaction record, and triggers the sale status update from PENDING to ACTIVE if applicable.

---

## User / Business Outcome

Clients can pay invoices directly from a branded payment link with no account or login needed. The team sees payments reflected immediately in sale and invoice status.

---

## Exact Scope

1. Add `POST /public/invoice/:token/pay` to `PublicPaymentsController`
2. Rate limit: `@Throttle({ default: { ttl: 60000, limit: 5 } })` (5 req/IP/min)
3. Request body `PublicPaymentDto`:
   ```typescript
   {
     opaqueData: {
       dataDescriptor: string;  // "COMMON.ACCEPT.INAPP.PAYMENT" from Accept.js
       dataValue: string;       // tokenized card data
     };
     payer?: {
       email?: string;
       name?: string;
     };
   }
   ```
4. Service logic `PublicPaymentsService.payInvoice(token, dto)`:
   a. Look up invoice by paymentToken (404 if not found)
   b. If invoice.status === PAID: return `{ success: true, alreadyPaid: true }` (idempotent, no charge)
   c. If invoice.status !== UNPAID and !== OVERDUE: throw 422 ("Invoice cannot be paid in its current state")
   d. Load sale (need customerProfileId, paymentProfileId, brandId, organizationId, status)
   e. If sale has no `customerProfileId`: create Authorize.net CustomerProfile using `payer.email` (or placeholder); create PaymentProfile from `opaqueData`; store both IDs on sale
   f. If sale has `customerProfileId` but no `paymentProfileId`: add payment profile from `opaqueData`
   g. Call `authorizeNet.chargeCustomerProfile({ customerProfileId, paymentProfileId, amount: invoice.amount, invoiceNumber: invoice.invoiceNumber })`
   h. On gateway success (all inside `$transaction`):
      - `invoice.update({ status: PAID })`
      - `paymentTransaction.create({ type: ONE_TIME, amount, status: SUCCESS, transactionId, saleId, invoiceId })`
      - If `sale.status === PENDING`: `sale.update({ status: ACTIVE })`
      - `saleActivity.create(PAYMENT_RECEIVED, { amount, invoiceId, invoiceNumber, source: 'public_payment_link' })`
      - If sale status was changed: `saleActivity.create(STATUS_CHANGE, { from: 'PENDING', to: 'ACTIVE', trigger: 'first_public_payment' })`
   i. On gateway failure:
      - `paymentTransaction.create({ type: ONE_TIME, amount, status: FAILED, responseCode, responseMessage })`
      - `saleActivity.create(PAYMENT_FAILED, { amount, invoiceId, reason, source: 'public_payment_link' })`
      - Return `{ success: false, message: sanitizedMessage, retryable: boolean }`
5. Response contracts:
   - Success: `{ success: true, invoiceNumber: string, amountCharged: number, message: 'Payment successful' }`
   - Already paid: `{ success: true, alreadyPaid: true, invoiceNumber: string, message: 'Invoice already paid' }`
   - Gateway failure: `{ success: false, message: string, retryable: boolean }`
   - 404: generic not found
   - 422: invalid state
   - 429: rate limit exceeded
6. `sanitizedMessage`: strip any internal IDs from Authorize.net error messages before returning to public

---

## Out of Scope

- Partial payments (always charge the full invoice amount)
- Multi-invoice payment in one request
- Saving card for future use (profile is created but not surfaced to public user)
- Webhook callback to payment page (polling or redirect is fine for Phase 1)
- Subscription management

---

## Backend Tasks

1. `apps/backend/core-service/src/modules/public-payments/public-payments.controller.ts` — add `POST /public/invoice/:token/pay` with `@Throttle`
2. `apps/backend/core-service/src/modules/public-payments/public-payments.service.ts` — add `payInvoice()` method
3. `apps/backend/core-service/src/modules/public-payments/dto/public-payment.dto.ts` — `PublicPaymentDto` with class-validator
4. Ensure `AuthorizeNetService` is injectable into `PublicPaymentsService` (add to module imports)
5. Ensure `PrismaService` is injectable
6. Write unit tests: `public-payments.service.spec.ts`:
   - Valid token + successful charge → invoice PAID, transaction created, PAYMENT_RECEIVED logged
   - Valid token + PENDING sale + successful charge → sale becomes ACTIVE, STATUS_CHANGE logged
   - Valid token + already PAID invoice → returns alreadyPaid:true, no charge
   - Valid token + gateway failure → transaction FAILED, PAYMENT_FAILED logged, returns retryable error
   - Unknown token → 404
   - Invoice in CANCELLED state → 422
7. Write integration test: full flow — create sale → get invoice token → POST pay → assert invoice PAID + sale ACTIVE

---

## Frontend Tasks

None (covered by SM-FE-009)

---

## Schema / Migration Impact

None (uses paymentToken from SM-BE-013; adds paymentTransaction and saleActivity records)

---

## API Contract

**Request:**
```
POST /public/invoice/:token/pay
Content-Type: application/json
(No Authorization header required)

{
  "opaqueData": {
    "dataDescriptor": "COMMON.ACCEPT.INAPP.PAYMENT",
    "dataValue": "<token-from-accept-js>"
  },
  "payer": {
    "email": "client@example.com",
    "name": "John Smith"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "invoiceNumber": "INV-2026-0042",
  "amountCharged": 500.00,
  "message": "Payment successful"
}
```

**Already Paid Response (200):**
```json
{
  "success": true,
  "alreadyPaid": true,
  "invoiceNumber": "INV-2026-0042",
  "message": "Invoice already paid"
}
```

**Failure Response (200 with success:false — NOT 4xx — so the payment page can show a retry UI):**
```json
{
  "success": false,
  "message": "Your card was declined. Please check your details and try again.",
  "retryable": true
}
```

---

## Acceptance Criteria

1. Valid token + valid opaqueData → invoice marked PAID, PaymentTransaction created with status SUCCESS
2. Valid token + valid opaqueData + sale was PENDING → sale status updated to ACTIVE in same transaction
3. Valid token + invoice already PAID → returns 200 `{ success: true, alreadyPaid: true }`, no gateway call made
4. Valid token + Authorize.net decline → returns 200 `{ success: false }`, PaymentTransaction created with status FAILED
5. Unknown/invalid token → returns 404
6. Invoice in non-payable state (CANCELLED sale) → returns 422
7. 6th request from same IP within 60 seconds → returns 429
8. Response never contains `saleId`, `clientId`, `organizationId`
9. `PAYMENT_RECEIVED` SaleActivity created on success
10. `STATUS_CHANGE` (PENDING→ACTIVE) SaleActivity created when sale was PENDING
11. `PAYMENT_FAILED` SaleActivity created on gateway failure

---

## Edge Cases

1. Two simultaneous requests for the same invoice token → one succeeds, one gets alreadyPaid:true (DB transaction prevents double charge)
2. Sale has no customerProfileId → create one from opaqueData before charging
3. Gateway returns a vague error → sanitize message before returning to public
4. `payer.email` not provided → use sale's client email or a placeholder
5. Invoice amount is $0.00 (edge case) → skip gateway call, mark as paid directly

---

## Testing Requirements

- Unit tests (mock AuthorizeNetService + PrismaService): all 11 acceptance criteria
- Concurrency test: send 2 simultaneous requests for same token — assert only 1 charge created
- Rate limit test: send 6 requests in <60s from same IP — 6th returns 429
- Integration test: full end-to-end flow (Authorize.net sandbox required)
- Security test: response body scan — no internal IDs in any response field

---

## Verification Steps

- [ ] Unit tests pass: `nx test core-service --testFile=public-payments.service.spec.ts`
- [ ] Integration test: create sale → invoice → pay via public endpoint → DB shows invoice PAID
- [ ] Sale status changes PENDING→ACTIVE after first public payment
- [ ] Rate limiter: 6th request within 60s returns 429
- [ ] Already-paid invoice: second payment request returns `alreadyPaid: true`, no new transaction created
- [ ] Unknown token: 404 returned
- [ ] No internal IDs in any response (automated assertion in test)
- [ ] Authorize.net sandbox: real tokenized card pays successfully

---

## Rollback / Risk Notes

- Risk: Race condition on concurrent payments for same invoice. Mitigation: wrap invoice status check + update in `$transaction` with `select for update` (Prisma: `prisma.$transaction` with serializable isolation, or check-and-set pattern).
- Risk: Authorize.net opaqueData expires after 15 minutes. Mitigation: Accept.js integration must call tokenize immediately before submit (documented in SM-FE-009).
- Risk: Gateway error message leaks internal data. Mitigation: sanitize all error messages through a whitelist before returning to public.
