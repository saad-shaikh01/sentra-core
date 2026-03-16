# SM-BE-014 — Public Invoice Detail Endpoint (No Auth, Token-Gated)

## Ticket Metadata

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Ticket ID    | SM-BE-014                                                   |
| Title        | Public Invoice Detail Endpoint (No Auth, Token-Gated)       |
| Phase        | Phase 1 — Backend                                           |
| Priority     | High                                                        |
| Status       | [ ] Not Started                                             |
| Depends On   | SM-BE-013 (paymentToken on Invoice)                         |

---

## Purpose

Provide a safe, unauthenticated endpoint that the public payment page calls to display invoice details. The endpoint resolves the invoice by `paymentToken` and returns only the data needed for payment — no internal IDs, no org data, no client PII beyond what the payer needs.

---

## User / Business Outcome

A client/lead can open a branded payment link, see their invoice details (amount, description, brand), and proceed to pay — with no login required.

---

## Exact Scope

1. Create `PublicPaymentsModule` in `apps/backend/core-service/src/modules/public-payments/`
2. Create `PublicPaymentsController` with no `@AppAccess()` guard, no `@JwtAuth()` guard
3. `GET /public/invoice/:token` endpoint:
   - Look up invoice by `paymentToken` field
   - If not found: return 404 (do NOT indicate whether the token is invalid vs invoice not found)
   - Join: invoice → sale → brand (for logo, name), sale description
   - Return safe response (see contract below)
4. Register `PublicPaymentsModule` in `AppModule`

---

## Safe Response Contract (`PublicInvoiceDto`)

```typescript
{
  invoiceNumber: string;        // e.g., "INV-2026-0042"
  amount: number;               // decimal, e.g., 500.00
  currency: string;             // e.g., "USD"
  dueDate: string;              // ISO date string
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  alreadyPaid: boolean;         // true if status === PAID
  saleDescription?: string;     // sale.description (safe, no IDs)
  installmentNote?: string;     // e.g., "Installment 2 of 4"
  brand: {
    name: string;
    logoUrl?: string;
  };
  paymentToken: string;         // echo back for the payment form to use
}
```

**Fields NEVER included in response:** `id`, `saleId`, `clientId`, `organizationId`, `customerProfileId`, `paymentProfileId`, `subscriptionId`, `userId`, `brandId` (as ID — brand name and logo are safe)

---

## Out of Scope

- Authentication
- Editing invoice details
- Listing multiple invoices (one token = one invoice only)
- Token regeneration (handled by SM-BE-013)

---

## Backend Tasks

1. Create directory `apps/backend/core-service/src/modules/public-payments/`
2. Create `public-payments.module.ts`
3. Create `public-payments.controller.ts` — `GET /public/invoice/:token`
4. Create `public-payments.service.ts` — `getInvoiceByToken(token: string): Promise<PublicInvoiceDto>`
5. Create `dto/public-invoice.dto.ts` — response DTO with class-transformer `@Expose()` + `excludeExtraneousValues: true`
6. Register in `apps/backend/core-service/src/app/app.module.ts`
7. Write unit tests: `public-payments.service.spec.ts`
   - Token found: returns correct DTO
   - Token not found: throws NotFoundException
   - Already paid invoice: `alreadyPaid: true`
   - Response contains no internal ID fields

---

## Frontend Tasks

None (frontend coverage in SM-FE-009)

---

## Schema / Migration Impact

None (uses paymentToken added in SM-BE-013)

---

## Acceptance Criteria

1. `GET /public/invoice/{validToken}` returns 200 with `PublicInvoiceDto`
2. `GET /public/invoice/{unknownToken}` returns 404 with generic message
3. Response body contains `invoiceNumber`, `amount`, `currency`, `dueDate`, `status`, `brand.name`, `paymentToken`
4. Response body does NOT contain `id`, `saleId`, `clientId`, `organizationId`
5. `alreadyPaid: true` when invoice status is PAID
6. `installmentNote` is set when invoice notes contain installment text
7. No JWT token required in the request headers

---

## Edge Cases

1. Invoice with no brand logo → `brand.logoUrl` is `undefined` (not null, not empty string)
2. Sale has no description → `saleDescription` is `undefined`
3. `status: OVERDUE` → `alreadyPaid: false`
4. Empty string token → 404

---

## Testing Requirements

- Unit tests (mock PrismaService): all acceptance criteria above
- Integration test: create invoice with paymentToken, call endpoint with token, assert response shape
- Security test: confirm response shape contains NO internal ID fields (automated assertion)
- Manual QA: open payment page with token, confirm brand name and invoice amount render correctly

---

## Verification Steps

- [ ] `GET /public/invoice/:validToken` returns 200 with correct data
- [ ] `GET /public/invoice/:unknownToken` returns 404
- [ ] Response schema validation: no `id`, `saleId`, `clientId`, `organizationId` keys present
- [ ] Brand name and logo from invoice → sale → brand relation is correct
- [ ] No auth header needed — request succeeds without Authorization header
- [ ] Unit tests pass

---

## Rollback / Risk Notes

Low risk. Read-only endpoint. The only exposure risk is if brand logo URL leaks a storage path — ensure logo URLs are CDN/public URLs, not pre-signed private URLs.
