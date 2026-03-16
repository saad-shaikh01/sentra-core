# SM-BE-009 — Refund Endpoint

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-009                                  |
| Title          | Refund Endpoint                            |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 5 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

No refund capability exists in the current codebase. Sales with erroneous charges, client cancellations, or disputes require a controlled refund mechanism backed by the Authorize.net gateway. This ticket adds `POST /sales/:id/refund` supporting full gateway refunds, partial gateway refunds, and manual (off-gateway) mark-as-refunded operations with mandatory audit trails.

---

## User / Business Outcome

- OWNER and ADMIN users can issue refunds directly from the sales management interface without accessing the Authorize.net merchant portal.
- Manual refunds (cash, check, wire) can be recorded in the system with a mandatory note, ensuring the audit trail is complete.
- Refunded sales are clearly marked in the system (`status: REFUNDED`) preventing further charges.

---

## Exact Scope

### In Scope

1. Add `REFUND` to `TransactionType` enum if not already present (schema migration).
2. Create `CreateRefundDto` with type, amount, transactionId, cardLastFour, note fields.
3. Implement `SalesService.refund()` method with Authorize.net gateway integration for FULL and PARTIAL types.
4. Implement `SalesService.refund()` manual path for MANUAL type.
5. Create `PaymentTransaction` record for the refund.
6. Update sale status to `REFUNDED` on FULL refund or MANUAL mark-as-refunded.
7. Log `REFUND_ISSUED` activity via `logActivity()` from SM-BE-007.
8. Add `POST /sales/:id/refund` route to controller with `@Roles(OWNER, ADMIN)`.
9. Invalidate cache after refund.

### Out of Scope

- Partial refund cap validation against actual paid amounts (Phase 1 uses honor system; Phase 2 can add automatic cap).
- Client notification of refund (Phase 2 / Phase 3).
- Automatic invoice status update on partial refund (Phase 1: manual review).

---

## Backend Tasks

### 1. Verify / Add `REFUND` to `TransactionType` Enum

**File:** `apps/backend/core-service/prisma/schema.prisma`

Check if `TransactionType` already includes `REFUND`. If not, add it:

```prisma
enum TransactionType {
  // ... existing values ...
  REFUND
}
```

If a migration is needed:
```bash
cd apps/backend/core-service
npx prisma migrate dev --name add_transaction_type_refund
npx prisma generate
```

### 2. Create `CreateRefundDto`

**File:** `apps/backend/core-service/src/modules/sales/dto/create-refund.dto.ts`

```typescript
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum RefundType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
  MANUAL = 'MANUAL',
}

export class CreateRefundDto {
  @IsEnum(RefundType)
  type: RefundType;

  @ValidateIf((o) => o.type === RefundType.PARTIAL || o.type === RefundType.MANUAL)
  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount?: number;

  @ValidateIf((o) => o.type === RefundType.FULL || o.type === RefundType.PARTIAL)
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ValidateIf((o) => o.type === RefundType.FULL || o.type === RefundType.PARTIAL)
  @IsOptional()
  @IsString()
  cardLastFour?: string;

  @ValidateIf((o) => o.type === RefundType.MANUAL)
  @IsString()
  @MinLength(10, { message: 'note must be at least 10 characters for manual refunds' })
  note?: string;

  @IsOptional()
  @IsString()
  note?: string; // Optional for FULL/PARTIAL types
}
```

**Note:** TypeScript will complain about duplicate `note` fields. Resolve by using a single `note` field with conditional validation:

```typescript
export class CreateRefundDto {
  @IsEnum(RefundType)
  type: RefundType;

  @ValidateIf((o) => o.type === RefundType.PARTIAL || o.type === RefundType.MANUAL)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  cardLastFour?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.type === RefundType.MANUAL)
  @MinLength(10, { message: 'note is required and must be at least 10 characters for manual refunds' })
  note?: string;
}
```

### 3. Implement `SalesService.refund()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
import { RefundType } from './dto/create-refund.dto';
import { TransactionType, TransactionStatus } from '@prisma/client';

async refund(
  id: string,
  organizationId: string,
  refundDto: CreateRefundDto,
  actorId: string,
): Promise<{ success: true; transactionId?: string }> {
  const sale = await this.prisma.sale.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  // Validate: only ACTIVE or COMPLETED sales can be refunded
  if (
    sale.status !== SaleStatus.ACTIVE &&
    sale.status !== SaleStatus.COMPLETED
  ) {
    throw new UnprocessableEntityException(
      `Cannot refund a sale with status ${sale.status}. Only ACTIVE or COMPLETED sales can be refunded.`,
    );
  }

  // Validate MANUAL requires note
  if (refundDto.type === RefundType.MANUAL && !refundDto.note) {
    throw new BadRequestException('note is required for manual refunds');
  }

  let gatewayTransactionId: string | undefined;
  let transactionStatus: TransactionStatus = TransactionStatus.SUCCESS;
  let refundAmount: number;

  if (refundDto.type === RefundType.FULL) {
    // For full refund, get the amount from the sale's discountedTotal or totalAmount
    refundAmount = sale.discountedTotal
      ? Number(sale.discountedTotal)
      : Number(sale.totalAmount);

    try {
      const gatewayResponse = await this.authorizeNetService.refundTransaction({
        transactionId: refundDto.transactionId,
        amount: refundAmount,
        cardLastFour: refundDto.cardLastFour,
      });
      gatewayTransactionId = gatewayResponse.transactionId;
    } catch (error) {
      transactionStatus = TransactionStatus.FAILED;
      throw new BadGatewayException(
        `Authorize.net refund failed: ${error.message}`,
      );
    }
  } else if (refundDto.type === RefundType.PARTIAL) {
    if (!refundDto.amount) {
      throw new BadRequestException('amount is required for partial refunds');
    }
    refundAmount = refundDto.amount;

    try {
      const gatewayResponse = await this.authorizeNetService.refundTransaction({
        transactionId: refundDto.transactionId,
        amount: refundAmount,
        cardLastFour: refundDto.cardLastFour,
      });
      gatewayTransactionId = gatewayResponse.transactionId;
    } catch (error) {
      transactionStatus = TransactionStatus.FAILED;
      throw new BadGatewayException(
        `Authorize.net partial refund failed: ${error.message}`,
      );
    }
  } else {
    // MANUAL
    refundAmount = refundDto.amount ?? Number(sale.discountedTotal ?? sale.totalAmount);
    transactionStatus = TransactionStatus.SUCCESS;
    gatewayTransactionId = undefined;
  }

  await this.prisma.$transaction(async (tx) => {
    // Create PaymentTransaction record
    await tx.paymentTransaction.create({
      data: {
        saleId: id,
        type: TransactionType.REFUND,
        amount: new Prisma.Decimal(refundAmount),
        status: transactionStatus,
        transactionId: gatewayTransactionId ?? null,
        responseCode: null,
        responseMessage: refundDto.note ?? null,
      },
    });

    // Update sale status to REFUNDED for full or manual refunds
    if (refundDto.type === RefundType.FULL || refundDto.type === RefundType.MANUAL) {
      await tx.sale.update({
        where: { id },
        data: { status: SaleStatus.REFUNDED },
      });
    }

    // Log REFUND_ISSUED activity
    await this.logActivity(tx, id, actorId, SaleActivityType.REFUND_ISSUED, {
      amount: refundAmount,
      type: refundDto.type,
      transactionId: gatewayTransactionId ?? null,
      note: refundDto.note ?? null,
    });
  });

  // Invalidate cache
  await this.invalidateSaleCache(organizationId, id);

  return { success: true, transactionId: gatewayTransactionId };
}
```

**Note on `authorizeNetService.refundTransaction()`:** Check the existing Authorize.net integration. The existing service has `charge()` and `createSubscription()`. Add `refundTransaction()` to it, or create a new method. The Authorize.net API for refunds uses the `createTransactionRequest` with `transactionType: 'refundTransaction'` and requires the original `transId`, `amount`, and last four digits of the card.

### 4. Add `refundTransaction()` to AuthorizeNet Service

**File:** Find the existing Authorize.net service file (likely `apps/backend/core-service/src/modules/sales/authorize-net.service.ts` or similar — verify exact path).

Add:

```typescript
async refundTransaction(params: {
  transactionId: string | undefined;
  amount: number;
  cardLastFour: string | undefined;
}): Promise<{ transactionId: string }> {
  const { transactionId, amount, cardLastFour } = params;

  const requestBody = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: this.loginId,
        transactionKey: this.transactionKey,
      },
      transactionRequest: {
        transactionType: 'refundTransaction',
        amount: amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: cardLastFour ? `XXXX${cardLastFour}` : undefined,
            expirationDate: 'XXXX',
          },
        },
        refTransId: transactionId,
      },
    },
  };

  const response = await this.httpService
    .post(this.apiUrl, requestBody)
    .toPromise();

  const result = response.data?.transactionResponse;

  if (result?.responseCode !== '1') {
    throw new Error(
      result?.errors?.[0]?.errorText ?? 'Authorize.net refund request failed',
    );
  }

  return { transactionId: result.transId };
}
```

Adjust the request shape to match the existing Authorize.net service pattern in the codebase.

### 5. Add Route to Controller

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Post(':id/refund')
@Roles(UserRole.OWNER, UserRole.ADMIN)
async refund(
  @Param('id') id: string,
  @Body() createRefundDto: CreateRefundDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<{ success: true; transactionId?: string }>> {
  const result = await this.salesService.refund(
    id,
    organizationId,
    createRefundDto,
    user.sub,
  );
  return CommApiResponse.success(result);
}
```

---

## Frontend Tasks

None. The Refund Modal UI is in SM-FE-008.

---

## Schema / Migration Impact

### Potential Migration: Add `REFUND` to `TransactionType`

Only required if `REFUND` is not already in the enum. Check schema before running migration.

```sql
ALTER TYPE "TransactionType" ADD VALUE 'REFUND';
```

---

## API / Contracts Affected

### New Endpoint: `POST /sales/:id/refund`

**Request:**
```json
{
  "type": "PARTIAL",
  "amount": 250.00,
  "transactionId": "60015617285",
  "cardLastFour": "1234",
  "note": "Client requested partial refund"
}
```

**Response (200):**
```json
{
  "data": {
    "success": true,
    "transactionId": "60015617300"
  }
}
```

**Error Responses:**

| Condition                          | HTTP  | Message                                              |
|------------------------------------|-------|------------------------------------------------------|
| Sale not found                     | 404   | Sale with id X not found                            |
| Sale status not ACTIVE/COMPLETED   | 422   | Cannot refund a sale with status DRAFT...           |
| Gateway call fails                 | 502   | Authorize.net refund failed: ...                    |
| MANUAL without note                | 400   | note is required for manual refunds                 |
| PARTIAL without amount             | 400   | amount is required for partial refunds              |
| Actor not OWNER or ADMIN           | 403   | Forbidden                                           |

---

## Acceptance Criteria

1. `POST /sales/:id/refund` with `type: 'FULL'` and valid gateway credentials — returns HTTP 200 with `success: true` and `transactionId`.
2. After a FULL refund, `GET /sales/:id` returns `status: 'REFUNDED'`.
3. After a FULL refund, a `PaymentTransaction` record exists with `type: 'REFUND'` and `status: 'SUCCESS'`.
4. After a FULL refund, a `SaleActivity` record exists with `type: 'REFUND_ISSUED'`.
5. `POST /sales/:id/refund` with `type: 'PARTIAL'` and `amount: 250` — only the partial amount is refunded; sale status is NOT changed to REFUNDED.
6. `POST /sales/:id/refund` with `type: 'MANUAL'` and a valid note (≥ 10 chars) — succeeds; sale status changed to REFUNDED; no gateway call made.
7. `POST /sales/:id/refund` with `type: 'MANUAL'` and no note — returns HTTP 400.
8. `POST /sales/:id/refund` on a DRAFT sale — returns HTTP 422.
9. `POST /sales/:id/refund` on a CANCELLED sale — returns HTTP 422.
10. `POST /sales/:id/refund` by a SALES_MANAGER — returns HTTP 403.
11. When Authorize.net returns an error on the refund call, the endpoint returns HTTP 502 and no `PaymentTransaction` record is created with SUCCESS status (transaction rolls back).
12. Cache is invalidated after a successful refund.

---

## Edge Cases

1. **FULL refund amount determination:** When `type: 'FULL'` and no `amount` is provided, the system uses `sale.discountedTotal ?? sale.totalAmount` as the refund amount. This may not equal the actual amount charged if payments were partial. Document this limitation.
2. **Partial refund exceeds paid amount:** Phase 1 does not automatically cap the refund amount. The gateway will reject over-refund attempts. The gateway error is surfaced as HTTP 502 to the caller.
3. **Multiple partial refunds:** Each is an independent `PaymentTransaction` record. The system does not track cumulative refunded amounts in Phase 1.
4. **Gateway timeout:** If Authorize.net does not respond within the HTTP timeout, the request throws. The catch block stores `FAILED` status and rethrows. The transaction is rolled back.
5. **`transactionId` not provided for FULL/PARTIAL:** The Authorize.net API may reject without a reference transaction ID. Validate that `transactionId` is provided for FULL and PARTIAL types, or document that it is optional only for gateways that do not require it.

---

## Dependencies

- **SM-BE-001** — May be needed for `TransactionType.REFUND` if not already in the enum.
- **SM-BE-007** — `logActivity()` helper must be available.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `refund()` FULL type: verify `authorizeNetService.refundTransaction` is called; verify `paymentTransaction.create` called with REFUND type; verify sale status updated to REFUNDED.
- Test `refund()` PARTIAL type: verify gateway called; verify sale status NOT changed.
- Test `refund()` MANUAL type: verify gateway NOT called; verify sale status updated to REFUNDED.
- Test `refund()` on DRAFT sale: verify `UnprocessableEntityException`.
- Test `refund()` MANUAL without note: verify `BadRequestException`.
- Test `refund()` when gateway throws: verify `BadGatewayException` and no records created.
- Test `refund()`: verify `REFUND_ISSUED` activity logged.

### Integration Tests

- `POST /sales/:id/refund` FULL — HTTP 200; verify transaction and activity records in DB.
- `POST /sales/:id/refund` MANUAL — HTTP 200; no gateway call (mock).
- `POST /sales/:id/refund` on DRAFT sale — HTTP 422.
- `POST /sales/:id/refund` by SALES_MANAGER — HTTP 403.

### Manual QA Checks

- [ ] Create a sale with status ACTIVE. Issue a FULL refund via API. Confirm HTTP 200 and `status: 'REFUNDED'` on the sale.
- [ ] Confirm `PaymentTransaction` record exists with `type: 'REFUND'`.
- [ ] Confirm `SaleActivity` record exists with `type: 'REFUND_ISSUED'`.
- [ ] Attempt to refund a DRAFT sale. Confirm HTTP 422.
- [ ] Attempt to refund using a SALES_MANAGER JWT. Confirm HTTP 403.
- [ ] Issue a MANUAL refund with a note. Confirm no gateway call was made.

---

## Verification Steps

- [ ] `TransactionType.REFUND` exists in Prisma client.
- [ ] `CreateRefundDto` file exists with all fields and correct validation decorators.
- [ ] `SalesService.refund()` method implements FULL, PARTIAL, and MANUAL paths.
- [ ] `authorizeNetService.refundTransaction()` method implemented.
- [ ] `POST /sales/:id/refund` route exists in controller with `@Roles(OWNER, ADMIN)`.
- [ ] FULL refund updates sale status to REFUNDED.
- [ ] PARTIAL refund does NOT update sale status.
- [ ] MANUAL refund updates sale status to REFUNDED.
- [ ] `REFUND_ISSUED` activity logged in all refund scenarios.
- [ ] Cache invalidated after refund.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **Schema migration (if needed):** Adding `REFUND` to `TransactionType` is non-breaking. Cannot be rolled back without dropping the type.
- **Financial risk:** Gateway refunds are irreversible. Ensure the OWNER/ADMIN role restriction is properly enforced. A misconfigured `@Roles()` decorator could allow unauthorized refunds.
- **Gateway test mode:** Test against Authorize.net sandbox environment only. Do not run integration tests against production credentials.
- **Idempotency:** Authorize.net refund calls are not idempotent by default. Do not retry on timeout without checking if the first call succeeded.
