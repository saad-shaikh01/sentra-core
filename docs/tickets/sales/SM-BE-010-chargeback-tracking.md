# SM-BE-010 — Chargeback Tracking Endpoint

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-010                                  |
| Title          | Chargeback Tracking Endpoint               |
| Phase          | 1 — Backend                                |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 3 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The `CHARGEBACK_FILED` activity type exists in the `SaleActivityType` enum and `CHARGEBACK_FILED` is defined, but there is no endpoint to record a chargeback event. This ticket adds `POST /sales/:id/chargeback` for manual chargeback tracking — no automatic gateway dispute filing, no sale status change, just a recorded event with notes and evidence that feeds the activity timeline.

---

## User / Business Outcome

- OWNER and ADMIN users can record a chargeback event against a sale, with notes and optional evidence URL.
- The chargeback is visible in the sale's activity timeline for dispute management.
- Staff have a traceable record of which sales have active chargebacks.

---

## Exact Scope

### In Scope

1. Add `CHARGEBACK` to `TransactionType` enum if not already present (schema migration).
2. Create `CreateChargebackDto` with amount, notes, evidenceUrl, chargebackDate fields.
3. Implement `SalesService.chargeback()` method.
4. Create a `PaymentTransaction` record with `type: CHARGEBACK` and `status: PENDING`.
5. Log `CHARGEBACK_FILED` activity.
6. Do NOT change sale status automatically.
7. Add `POST /sales/:id/chargeback` route to controller with `@Roles(OWNER, ADMIN)`.
8. Invalidate cache.

### Out of Scope

- Automatic gateway dispute filing with Authorize.net.
- Changing sale status based on chargeback.
- Chargeback resolution tracking (win/loss — future phase).
- Notifications (handled in SM-BE-012).

---

## Backend Tasks

### 1. Verify / Add `CHARGEBACK` to `TransactionType` Enum

**File:** `apps/backend/core-service/prisma/schema.prisma`

Check if `TransactionType` already includes `CHARGEBACK`. If not, add it:

```prisma
enum TransactionType {
  // ... existing values ...
  REFUND      // from SM-BE-009 if not yet present
  CHARGEBACK
}
```

If a migration is needed:
```bash
cd apps/backend/core-service
npx prisma migrate dev --name add_transaction_type_chargeback
npx prisma generate
```

If SM-BE-009 also needs to add REFUND, coordinate so both enum values are added in one migration.

### 2. Create `CreateChargebackDto`

**File:** `apps/backend/core-service/src/modules/sales/dto/create-chargeback.dto.ts`

```typescript
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateChargebackDto {
  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount: number;

  @IsString()
  @MinLength(10, { message: 'notes must be at least 10 characters' })
  notes: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsDateString()
  chargebackDate?: string;
}
```

### 3. Implement `SalesService.chargeback()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
async chargeback(
  id: string,
  organizationId: string,
  chargebackDto: CreateChargebackDto,
  actorId: string,
): Promise<{ success: true; paymentTransactionId: string }> {
  const sale = await this.prisma.sale.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  // Chargeback can be filed on any non-DRAFT sale
  if (sale.status === SaleStatus.DRAFT) {
    throw new UnprocessableEntityException(
      'Cannot file a chargeback on a DRAFT sale',
    );
  }

  const chargebackDate = chargebackDto.chargebackDate
    ? new Date(chargebackDto.chargebackDate)
    : new Date();

  let createdTransactionId: string;

  await this.prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.create({
      data: {
        saleId: id,
        type: TransactionType.CHARGEBACK,
        amount: new Prisma.Decimal(chargebackDto.amount),
        status: TransactionStatus.PENDING,
        transactionId: null,
        responseCode: null,
        responseMessage: chargebackDto.notes,
      },
    });

    createdTransactionId = transaction.id;

    // Log CHARGEBACK_FILED activity
    await this.logActivity(tx, id, actorId, SaleActivityType.CHARGEBACK_FILED, {
      amount: chargebackDto.amount,
      notes: chargebackDto.notes,
      evidenceUrl: chargebackDto.evidenceUrl ?? null,
      chargebackDate: chargebackDate.toISOString(),
      paymentTransactionId: transaction.id,
    });
  });

  // Invalidate cache
  await this.invalidateSaleCache(organizationId, id);

  return { success: true, paymentTransactionId: createdTransactionId };
}
```

**Notes:**
- Sale status is NOT updated. The chargeback is a tracking event only.
- `evidenceUrl` is stored in the activity data, not in a dedicated column (Phase 1). Phase 2 can add a dedicated chargeback tracking table.
- `chargebackDate` defaults to now if not provided.

### 4. Add Route to Controller

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Post(':id/chargeback')
@Roles(UserRole.OWNER, UserRole.ADMIN)
async chargeback(
  @Param('id') id: string,
  @Body() createChargebackDto: CreateChargebackDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<{ success: true; paymentTransactionId: string }>> {
  const result = await this.salesService.chargeback(
    id,
    organizationId,
    createChargebackDto,
    user.sub,
  );
  return CommApiResponse.success(result);
}
```

---

## Frontend Tasks

None. The Chargeback Modal UI is in SM-FE-008.

---

## Schema / Migration Impact

### Potential Migration: Add `CHARGEBACK` to `TransactionType`

Only if not already present. Coordinate with SM-BE-009 to add both `REFUND` and `CHARGEBACK` in a single migration if possible.

```sql
ALTER TYPE "TransactionType" ADD VALUE 'CHARGEBACK';
```

---

## API / Contracts Affected

### New Endpoint: `POST /sales/:id/chargeback`

**Request:**
```json
{
  "amount": 1500.00,
  "notes": "Customer disputed the charge with their bank citing service not delivered.",
  "evidenceUrl": "https://storage.example.com/evidence/chargeback_001.pdf",
  "chargebackDate": "2026-03-15"
}
```

**Response (200):**
```json
{
  "data": {
    "success": true,
    "paymentTransactionId": "txn_chargeback_001"
  }
}
```

**Error Responses:**

| Condition                      | HTTP  | Message                                        |
|--------------------------------|-------|------------------------------------------------|
| Sale not found                 | 404   | Sale with id X not found                      |
| Sale status is DRAFT           | 422   | Cannot file a chargeback on a DRAFT sale      |
| `notes` fewer than 10 chars    | 400   | notes must be at least 10 characters          |
| `amount` not provided          | 400   | amount is required                             |
| Actor not OWNER or ADMIN       | 403   | Forbidden                                      |

---

## Acceptance Criteria

1. `POST /sales/:id/chargeback` with valid payload returns HTTP 200 with `success: true` and the new `paymentTransactionId`.
2. After a chargeback is filed, a `PaymentTransaction` record exists with `type: 'CHARGEBACK'` and `status: 'PENDING'`.
3. After a chargeback is filed, a `SaleActivity` record exists with `type: 'CHARGEBACK_FILED'` and `data.notes` containing the submitted notes.
4. After a chargeback is filed, the sale `status` is UNCHANGED.
5. `POST /sales/:id/chargeback` on a DRAFT sale returns HTTP 422.
6. `POST /sales/:id/chargeback` by a SALES_MANAGER returns HTTP 403.
7. `POST /sales/:id/chargeback` by a FRONTSELL_AGENT returns HTTP 403.
8. `POST /sales/:id/chargeback` with `notes` of fewer than 10 characters returns HTTP 400.
9. `POST /sales/:id/chargeback` with no `chargebackDate` — the activity record stores today's date as `chargebackDate`.
10. `POST /sales/:id/chargeback` with `evidenceUrl` — the URL appears in the `CHARGEBACK_FILED` activity data.
11. `GET /sales/:id` after chargeback — the activity timeline includes the `CHARGEBACK_FILED` entry.
12. Cache is invalidated after a chargeback is filed.

---

## Edge Cases

1. **Multiple chargebacks on the same sale:** Multiple `CHARGEBACK` `PaymentTransaction` records are created, each independent. There is no limit in Phase 1.
2. **Chargeback with future `chargebackDate`:** A date in the future is technically invalid but the system does not block it in Phase 1. Validation can be added in a future ticket.
3. **Chargeback on a REFUNDED sale:** This is allowed (status is not DRAFT). A sale may have been refunded and still have a chargeback filed if the refund was disputed or occurred after the chargeback was received.
4. **`evidenceUrl` as a local file path:** No validation on URL format in Phase 1. The field is a free-form string. Phase 2 can add URL format validation.
5. **`amount` exceeding the sale total:** The system does not block this in Phase 1. Manual review is assumed.

---

## Dependencies

- **SM-BE-001** — `CHARGEBACK_FILED` activity type added in SM-BE-001.
- **SM-BE-007** — `logActivity()` helper must be available.
- **SM-BE-009** — Coordinate on the `TransactionType` migration to add both REFUND and CHARGEBACK in one operation if possible.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `chargeback()`: verify `paymentTransaction.create` called with `type: CHARGEBACK` and `status: PENDING`.
- Test `chargeback()`: verify sale status is NOT updated.
- Test `chargeback()`: verify `CHARGEBACK_FILED` activity logged.
- Test `chargeback()` on DRAFT sale: verify `UnprocessableEntityException`.
- Test `chargeback()` on sale not found: verify `NotFoundException`.
- Test `chargeback()` with `chargebackDate` provided: verify stored in activity data.
- Test `chargeback()` without `chargebackDate`: verify today's date stored.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `POST /sales/:id/chargeback` with valid payload — HTTP 200.
- `POST /sales/:id/chargeback` on DRAFT sale — HTTP 422.
- `POST /sales/:id/chargeback` by SALES_MANAGER — HTTP 403.
- `POST /sales/:id/chargeback` with short notes — HTTP 400.
- `GET /sales/:id` after chargeback — `activities` includes CHARGEBACK_FILED entry.

### Manual QA Checks

- [ ] File a chargeback on an ACTIVE sale. Confirm HTTP 200.
- [ ] Confirm sale status is unchanged after chargeback.
- [ ] Confirm `PaymentTransaction` record with `type: 'CHARGEBACK'` exists in DB.
- [ ] Confirm `SaleActivity` record with `type: 'CHARGEBACK_FILED'` exists.
- [ ] Attempt to file chargeback as SALES_MANAGER. Confirm HTTP 403.
- [ ] File chargeback with `notes` of 5 characters. Confirm HTTP 400.

---

## Verification Steps

- [ ] `TransactionType.CHARGEBACK` exists in Prisma client.
- [ ] `CreateChargebackDto` file exists with correct validation.
- [ ] `SalesService.chargeback()` method implemented.
- [ ] Sale status is NOT modified by the chargeback method.
- [ ] `PaymentTransaction` created with `type: CHARGEBACK`, `status: PENDING`.
- [ ] `CHARGEBACK_FILED` activity logged.
- [ ] `POST /sales/:id/chargeback` route in controller with `@Roles(OWNER, ADMIN)`.
- [ ] Cache invalidated.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **Schema migration (if needed for CHARGEBACK enum value):** Non-breaking additive change. Cannot be rolled back without dropping the type.
- **No gateway calls.** This ticket involves no external API calls. Rollback risk is minimal.
- **No data destruction.** The chargeback method only creates new records (`PaymentTransaction`, `SaleActivity`). No existing records are modified.
