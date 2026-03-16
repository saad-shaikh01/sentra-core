# SM-BE-008 — Discount Calculation Logic

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-008                                  |
| Title          | Discount Calculation Logic                 |
| Phase          | 1 — Backend                                |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 3 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The `Sale` model now has `discountType`, `discountValue`, and `discountedTotal` columns (added in SM-BE-001), but `SalesService` performs no discount calculation. This ticket implements the server-side discount logic in `create()` and `update()`, ensures `discountedTotal` is always server-computed (never client-controlled), and uses `discountedTotal` as the basis for invoice generation.

---

## User / Business Outcome

- Sales managers and admins can apply a percentage or fixed-amount discount to a sale at creation time or while the sale is in DRAFT/PENDING status.
- The discounted total is always accurate and computed by the server, preventing clients from manipulating financial figures.
- Invoices are generated based on the discounted total, ensuring customers are billed the correct amount.

---

## Exact Scope

### In Scope

1. Update `CreateSaleDto` to accept optional `discountType` (DiscountType enum) and `discountValue` (number).
2. Implement discount calculation in `SalesService.create()`.
3. Implement discount recalculation in `SalesService.update()` when discount fields change.
4. Block discount changes on sales in ACTIVE, COMPLETED, CANCELLED, ON_HOLD, or REFUNDED status.
5. Update invoice generation logic to use `discountedTotal` instead of `totalAmount` when a discount is present.
6. Update `mapToISale()` to include `discountType`, `discountValue`, and `discountedTotal` in the API response.
7. Update `ISale` interface to include the three discount fields.

### Out of Scope

- Item-level discounts (deferred to a future phase).
- Tax calculation.
- Multi-currency discount application.
- Discount codes or coupon system.
- Frontend discount UI (SM-FE-007).

---

## Backend Tasks

### 1. Update `CreateSaleDto` — Add Discount Fields

**File:** `apps/backend/core-service/src/modules/sales/dto/create-sale.dto.ts`

```typescript
import { IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateSaleDto {
  // ... existing fields ...

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'discountValue must be greater than 0' })
  discountValue?: number;
}
```

Note: `discountedTotal` must NOT be accepted from the client. It is always server-computed. Do not add it to the DTO.

### 2. Update `UpdateSaleDto` — Add Discount Fields

**File:** `apps/backend/core-service/src/modules/sales/dto/update-sale.dto.ts`

If `UpdateSaleDto` uses `PartialType(CreateSaleDto)`, the discount fields will be inherited automatically. Verify this is the case. If `UpdateSaleDto` is a manual class, add the same optional discount fields:

```typescript
@IsOptional()
@IsEnum(DiscountType)
discountType?: DiscountType;

@IsOptional()
@IsNumber()
@Min(0.01)
discountValue?: number;
```

### 3. Create Discount Calculation Helper

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add a private method:

```typescript
private computeDiscountedTotal(
  totalAmount: number,
  discountType: DiscountType | null | undefined,
  discountValue: number | null | undefined,
): number {
  if (!discountType || !discountValue) {
    return totalAmount;
  }

  let discountedTotal: number;

  if (discountType === DiscountType.PERCENTAGE) {
    discountedTotal = totalAmount * (1 - discountValue / 100);
  } else if (discountType === DiscountType.FIXED_AMOUNT) {
    discountedTotal = totalAmount - discountValue;
  } else {
    discountedTotal = totalAmount;
  }

  // Round to 2 decimal places
  return Math.round(discountedTotal * 100) / 100;
}
```

### 4. Add Discount Validation Helper

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
private validateDiscountInput(
  totalAmount: number,
  discountType: DiscountType | null | undefined,
  discountValue: number | null | undefined,
): void {
  if (!discountType && !discountValue) {
    return; // No discount — valid
  }

  if (discountType && !discountValue) {
    throw new BadRequestException('discountValue is required when discountType is set');
  }

  if (!discountType && discountValue) {
    throw new BadRequestException('discountType is required when discountValue is set');
  }

  if (discountValue <= 0) {
    throw new BadRequestException('discountValue must be greater than 0');
  }

  if (discountType === DiscountType.PERCENTAGE) {
    if (discountValue > 100) {
      throw new BadRequestException('Percentage discountValue cannot exceed 100');
    }
  }

  if (discountType === DiscountType.FIXED_AMOUNT) {
    if (discountValue >= totalAmount) {
      throw new BadRequestException(
        `Fixed discount value (${discountValue}) must be less than totalAmount (${totalAmount})`,
      );
    }
  }
}
```

### 5. Apply Discount Calculation in `SalesService.create()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

After computing `totalAmount` from items (or from the DTO if no items), add:

```typescript
// Validate discount inputs
this.validateDiscountInput(
  totalAmount,
  createSaleDto.discountType,
  createSaleDto.discountValue,
);

// Compute discounted total
const discountedTotal = this.computeDiscountedTotal(
  totalAmount,
  createSaleDto.discountType,
  createSaleDto.discountValue ?? null,
);

// The amount used for invoice generation
const billedAmount = createSaleDto.discountType ? discountedTotal : totalAmount;
```

Update the `prisma.sale.create()` call to include discount fields:

```typescript
await tx.sale.create({
  data: {
    // ... existing fields ...
    totalAmount,
    discountType: createSaleDto.discountType ?? null,
    discountValue: createSaleDto.discountValue
      ? new Prisma.Decimal(createSaleDto.discountValue)
      : null,
    discountedTotal: createSaleDto.discountType
      ? new Prisma.Decimal(discountedTotal)
      : null,
  },
});
```

Update invoice generation to use `billedAmount`:

```typescript
// When generating invoices, use billedAmount (discountedTotal if discount applied, else totalAmount)
const invoiceBaseAmount = billedAmount;
// ... pass invoiceBaseAmount into the invoice generation logic ...
```

### 6. Apply Discount Recalculation in `SalesService.update()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add the following block inside `update()`, after the transition validation and before applying the update:

```typescript
// Block discount changes on non-editable statuses
const discountEditableStatuses: SaleStatus[] = [SaleStatus.DRAFT, SaleStatus.PENDING];
const isChangingDiscount =
  updateSaleDto.discountType !== undefined || updateSaleDto.discountValue !== undefined;

if (isChangingDiscount && !discountEditableStatuses.includes(existingSale.status)) {
  throw new UnprocessableEntityException(
    `Discount cannot be changed when sale status is ${existingSale.status}. ` +
    `Only DRAFT and PENDING sales can have their discount modified.`,
  );
}

// Recompute discountedTotal if discount fields are changing
let newDiscountedTotal: Prisma.Decimal | null = existingSale.discountedTotal;

if (isChangingDiscount) {
  const effectiveDiscountType =
    updateSaleDto.discountType !== undefined
      ? updateSaleDto.discountType
      : existingSale.discountType;

  const effectiveDiscountValue =
    updateSaleDto.discountValue !== undefined
      ? updateSaleDto.discountValue
      : existingSale.discountValue
      ? Number(existingSale.discountValue)
      : null;

  const effectiveTotalAmount = Number(existingSale.totalAmount);

  this.validateDiscountInput(
    effectiveTotalAmount,
    effectiveDiscountType,
    effectiveDiscountValue,
  );

  const recomputedTotal = this.computeDiscountedTotal(
    effectiveTotalAmount,
    effectiveDiscountType,
    effectiveDiscountValue,
  );

  newDiscountedTotal = effectiveDiscountType
    ? new Prisma.Decimal(recomputedTotal)
    : null;
}
```

Include `discountedTotal: newDiscountedTotal` in the `prisma.sale.update()` data payload.

### 7. Update `mapToISale()` — Include Discount Fields

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
function mapToISale(sale: SaleWithRelations): ISale {
  return {
    // ... existing fields ...
    discountType: sale.discountType ?? null,
    discountValue: sale.discountValue ? Number(sale.discountValue) : null,
    discountedTotal: sale.discountedTotal ? Number(sale.discountedTotal) : null,
    // ... rest of fields ...
  };
}
```

### 8. Update `ISale` Interface

**File:** Wherever `ISale` is defined (check `libs/` or `sales.service.ts` inline type).

```typescript
export interface ISale {
  // ... existing fields ...
  discountType: DiscountType | null;
  discountValue: number | null;
  discountedTotal: number | null;
}
```

---

## Frontend Tasks

None. The live discount calculator and discount form fields in the create/edit form are in SM-FE-007.

---

## Schema / Migration Impact

No schema changes in this ticket. The discount columns on `Sale` were added in SM-BE-001.

---

## API / Contracts Affected

### `POST /sales` — Request Body (New Optional Fields)

```json
{
  "items": [...],
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "..."
}
```

### `POST /sales` and `GET /sales/:id` — Response Body (New Fields in ISale)

```json
{
  "totalAmount": 5000.00,
  "discountType": "PERCENTAGE",
  "discountValue": 10.00,
  "discountedTotal": 4500.00
}
```

For sales without discounts, all three fields return `null`.

### `PATCH /sales/:id` — New Error Response

```json
{ "message": "Discount cannot be changed when sale status is ACTIVE. Only DRAFT and PENDING sales can have their discount modified." }
```

---

## Acceptance Criteria

1. `POST /sales` with `discountType: 'PERCENTAGE'` and `discountValue: 10` on a sale with `totalAmount: 5000` — response includes `discountedTotal: 4500`.
2. `POST /sales` with `discountType: 'FIXED_AMOUNT'` and `discountValue: 500` on a sale with `totalAmount: 5000` — response includes `discountedTotal: 4500`.
3. `POST /sales` without discount fields — response has `discountType: null`, `discountValue: null`, `discountedTotal: null`.
4. `POST /sales` with `discountType: 'PERCENTAGE'` and `discountValue: 110` — returns HTTP 400 with message about percentage exceeding 100.
5. `POST /sales` with `discountType: 'FIXED_AMOUNT'` and `discountValue: 5000` on a sale with `totalAmount: 5000` — returns HTTP 400 (discount must be less than totalAmount).
6. `POST /sales` with `discountType` set but no `discountValue` — returns HTTP 400.
7. `PATCH /sales/:id` on a DRAFT sale with `discountValue: 15` — succeeds, `discountedTotal` is recomputed.
8. `PATCH /sales/:id` on an ACTIVE sale with `discountValue: 15` — returns HTTP 422 with discount-change restriction message.
9. Invoices generated for a discounted sale use `discountedTotal` as the base amount, not `totalAmount`.
10. `discountedTotal` is never accepted from the request body; it is always server-computed.
11. `GET /sales/:id` returns all three discount fields with correct values.
12. A `DISCOUNT_APPLIED` activity log entry (from SM-BE-007) is created when discount is set or changed.

---

## Edge Cases

1. **`discountValue` of 0:** Rejected by the `@Min(0.01)` validation on the DTO and by `validateDiscountInput()`. A zero-value discount is meaningless and should not be stored.
2. **`discountType` removed in an update (set to null):** If `updateSaleDto.discountType = null` explicitly, clear the discount entirely: set `discountType = null`, `discountValue = null`, `discountedTotal = null`. Handle `null` explicitly in the update logic.
3. **Floating point precision:** Always use `Math.round(value * 100) / 100` for final values. Do not use floating-point arithmetic without rounding. Use `Prisma.Decimal` for database storage.
4. **Sale with no items and explicit `totalAmount`:** The discount is applied to the `totalAmount` directly. Ensure the `totalAmount` is available for discount calculation when there are no line items.
5. **Discount on a sale with installments:** `discountedTotal` is divided across installments. For `paymentPlan: INSTALLMENTS` with `installmentCount: 3` and `discountedTotal: 4500`: each invoice is `4500 / 3 = 1500`. Ensure the division is performed with rounding — the last invoice absorbs any remainder from rounding.
6. **Updating only `discountType` without `discountValue`:** The validation must use the existing `discountValue` from the database to recompute. If the existing `discountValue` is also null, reject the partial update with a validation error.

---

## Dependencies

- **SM-BE-001** — Required for `DiscountType` enum and discount columns on `Sale`.
- **SM-BE-007** — `DISCOUNT_APPLIED` activity logging (called after successful discount computation in `create()` and `update()`).

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `computeDiscountedTotal()` with PERCENTAGE discount: `5000 * (1 - 10/100) = 4500`.
- Test `computeDiscountedTotal()` with FIXED_AMOUNT discount: `5000 - 500 = 4500`.
- Test `computeDiscountedTotal()` with no discount type: returns `totalAmount` unchanged.
- Test `computeDiscountedTotal()` with rounding: `1000 * (1 - 33.33/100) = 666.70`.
- Test `validateDiscountInput()` with PERCENTAGE > 100 — throws `BadRequestException`.
- Test `validateDiscountInput()` with FIXED_AMOUNT >= totalAmount — throws `BadRequestException`.
- Test `validateDiscountInput()` with discountType but no discountValue — throws `BadRequestException`.
- Test `create()` with discount — verify `discountedTotal` in `prisma.sale.create` call is correct.
- Test `create()` without discount — verify `discountedTotal` is null.
- Test `update()` with discount on ACTIVE sale — throws `UnprocessableEntityException`.
- Test `update()` with discount on DRAFT sale — verify recomputation.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `POST /sales` with PERCENTAGE discount → HTTP 201, correct `discountedTotal` in response.
- `POST /sales` with FIXED_AMOUNT discount → HTTP 201, correct `discountedTotal`.
- `POST /sales` with invalid discount (percentage > 100) → HTTP 400.
- `PATCH /sales/:id` (DRAFT) with discount change → HTTP 200, new `discountedTotal`.
- `PATCH /sales/:id` (ACTIVE) with discount change → HTTP 422.

### Manual QA Checks

- [ ] Create a sale with PERCENTAGE discount of 20% on a $1000 total. Confirm `discountedTotal: 800` in response.
- [ ] Create a sale with FIXED_AMOUNT discount of $200 on a $1000 total. Confirm `discountedTotal: 800`.
- [ ] Attempt to create with PERCENTAGE discount of 105%. Confirm HTTP 400.
- [ ] Update a DRAFT sale's discount. Confirm new `discountedTotal` returned.
- [ ] Update an ACTIVE sale's discount. Confirm HTTP 422.
- [ ] Verify generated invoices use discounted total for an installment plan sale.

---

## Verification Steps

- [ ] `CreateSaleDto` includes `discountType?: DiscountType` and `discountValue?: number`.
- [ ] `computeDiscountedTotal()` private method exists in SalesService.
- [ ] `validateDiscountInput()` private method exists in SalesService.
- [ ] `create()` applies discount and stores `discountedTotal` in database.
- [ ] `update()` blocks discount changes on non-DRAFT/PENDING sales with HTTP 422.
- [ ] `update()` recomputes `discountedTotal` when discount fields change.
- [ ] Invoice generation uses `discountedTotal` when a discount is present.
- [ ] `mapToISale()` includes `discountType`, `discountValue`, `discountedTotal`.
- [ ] `ISale` interface includes all three discount fields as nullable.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration.** Rollback is code revert.
- **Risk: Existing invoices.** If a sale's discount is changed, existing invoices already generated are NOT automatically updated. Their amounts reflect the discount at the time of creation. This is intentional for Phase 1. Document in the update response that discount changes do not retroactively modify invoices.
- **Risk: Rounding inconsistencies across installments.** Ensure the last installment invoice absorbs any rounding remainder. Test this explicitly with installment counts that do not divide evenly.
