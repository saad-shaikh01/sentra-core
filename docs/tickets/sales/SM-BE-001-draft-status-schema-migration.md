# SM-BE-001 — Draft Status, Discount Fields & Activity Types Schema Migration

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-001                                  |
| Title          | Draft Status, Discount Fields & Activity Types Schema Migration |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical (blocks all other tickets)   |
| Status         | [ ] Not Started                            |
| Estimate       | 2 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

This ticket performs all additive Prisma schema changes required by the Sales Module Enhancement Plan. It must be completed and merged — with migration applied to all environments — before any other SM-BE or SM-FE ticket begins implementation. All changes are non-breaking: new enum values appended, new nullable columns added, new enum type introduced.

---

## User / Business Outcome

- Sales staff can save a sale in `DRAFT` state before submitting it for processing, eliminating the need to create placeholder "PENDING" sales that pollute reporting.
- Sale-level discounts (percentage or fixed amount) can be stored and reflected in `discountedTotal`, enabling accurate revenue reporting.
- The audit system can record invoice lifecycle events and discount application events, closing the gap in activity history coverage.

---

## Exact Scope

### In Scope

1. Add `DRAFT` as the first value in the `SaleStatus` enum.
2. Create a new `DiscountType` enum with values `PERCENTAGE` and `FIXED_AMOUNT`.
3. Add three nullable columns to the `Sale` model: `discountType`, `discountValue`, `discountedTotal`.
4. Add four new values to the `SaleActivityType` enum: `INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT`.
5. Re-generate the Prisma client after migration.
6. Update all TypeScript files that reference `SaleStatus` or `SaleActivityType` enums to ensure no compile-time errors from the new values.

### Out of Scope

- Adding `REFUND` or `CHARGEBACK` to `TransactionType` (covered in SM-BE-009).
- Adding `packageId`/`packageName` to `SaleItem` (covered in SM-BE-002).
- Any service-layer logic changes.
- Any DTO changes.
- Any frontend changes.

---

## Backend Tasks

### 1. Update Prisma Schema

**File:** `apps/backend/core-service/prisma/schema.prisma`

**Change 1 — Add `DRAFT` to `SaleStatus` enum:**

```prisma
enum SaleStatus {
  DRAFT
  PENDING
  ACTIVE
  COMPLETED
  CANCELLED
  ON_HOLD
  REFUNDED
}
```

`DRAFT` must be placed as the first value so new sales default to it when a default is needed. Do not reorder existing values.

**Change 2 — Add new `DiscountType` enum:**

```prisma
enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}
```

Place this enum in the schema file adjacent to other sale-related enums (after `PaymentPlanType`).

**Change 3 — Add discount columns to `Sale` model:**

```prisma
model Sale {
  // ... all existing fields preserved unchanged ...
  discountType      DiscountType?
  discountValue     Decimal?       @db.Decimal(10, 2)
  discountedTotal   Decimal?       @db.Decimal(10, 2)
  // ... rest of existing fields ...
}
```

Add these three lines after the `paymentPlan` field and before `customerProfileId` to keep financial fields grouped. All three are nullable with no default.

**Change 4 — Add new values to `SaleActivityType` enum:**

```prisma
enum SaleActivityType {
  CREATED
  STATUS_CHANGE
  INVOICE_CREATED
  INVOICE_UPDATED
  PAYMENT_RECEIVED
  PAYMENT_FAILED
  REFUND_ISSUED
  CHARGEBACK_FILED
  NOTE
  MANUAL_ADJUSTMENT
  DISCOUNT_APPLIED
}
```

Append the four new values (`INVOICE_CREATED`, `INVOICE_UPDATED`, `MANUAL_ADJUSTMENT`, `DISCOUNT_APPLIED`) after the existing values to avoid reordering.

### 2. Generate and Apply Migration

Run the following from the repo root:

```bash
cd apps/backend/core-service
npx prisma migrate dev --name add_draft_status_discount_fields_activity_types
```

The generated SQL will include:
```sql
ALTER TYPE "SaleStatus" ADD VALUE 'DRAFT';
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
ALTER TABLE "Sale" ADD COLUMN "discountType" "DiscountType";
ALTER TABLE "Sale" ADD COLUMN "discountValue" DECIMAL(10,2);
ALTER TABLE "Sale" ADD COLUMN "discountedTotal" DECIMAL(10,2);
ALTER TYPE "SaleActivityType" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "SaleActivityType" ADD VALUE 'INVOICE_UPDATED';
ALTER TYPE "SaleActivityType" ADD VALUE 'MANUAL_ADJUSTMENT';
ALTER TYPE "SaleActivityType" ADD VALUE 'DISCOUNT_APPLIED';
```

Verify the generated SQL matches the above before running `migrate deploy` in production.

### 3. Regenerate Prisma Client

```bash
cd apps/backend/core-service
npx prisma generate
```

Confirm that `@prisma/client` types now expose `SaleStatus.DRAFT`, `DiscountType`, and the new `SaleActivityType` values.

### 4. Fix TypeScript Compile Errors (if any)

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Scan for any `switch` or `if` statements on `SaleStatus` or `SaleActivityType` that use exhaustive checks. Add handling for new values as needed (even if only a `default` fallthrough for now — the logic implementations come in later tickets).

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

No changes expected, but verify compilation.

**File:** `apps/backend/core-service/src/modules/sales/dto/` (all DTO files)

No changes expected for this ticket, but verify compilation after Prisma client regeneration.

**Verify compilation:**
```bash
cd apps/backend/core-service
npx tsc --noEmit
```

No errors must be present after this ticket is complete.

### 5. Update Shared Types (if applicable)

**File:** `libs/` (search for any shared `ISale` or `ISaleActivity` interface files in the libs directory)

If a shared `ISale` interface exists and explicitly types `status` as a union of `SaleStatus` values, ensure `'DRAFT'` is included. If the type uses the `SaleStatus` enum directly from `@prisma/client`, no change is needed.

If a shared `IDiscountType` or similar does not exist, do not create one in this ticket — that is done in SM-BE-008.

---

## Frontend Tasks

None. This ticket delivers database schema and Prisma client changes only. Frontend tickets begin after Phase 1 backend tickets are complete.

---

## Schema / Migration Impact

### New Enum: `DiscountType`

```prisma
enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}
```

### Modified Enum: `SaleStatus` (DRAFT added)

```
Before: PENDING | ACTIVE | COMPLETED | CANCELLED | ON_HOLD | REFUNDED
After:  DRAFT | PENDING | ACTIVE | COMPLETED | CANCELLED | ON_HOLD | REFUNDED
```

### Modified Enum: `SaleActivityType` (4 values added)

```
Added: INVOICE_CREATED | INVOICE_UPDATED | MANUAL_ADJUSTMENT | DISCOUNT_APPLIED
```

### Modified Model: `Sale` (3 nullable columns added)

```
Added: discountType DiscountType? | discountValue Decimal?(10,2) | discountedTotal Decimal?(10,2)
```

### Backward Compatibility

- All existing `Sale` rows will have `NULL` for `discountType`, `discountValue`, `discountedTotal`. This is valid — no constraints violated.
- All existing `SaleActivity` rows are unaffected.
- No existing enum values are removed or renamed.
- `DRAFT` being first in `SaleStatus` does not affect PostgreSQL ordering of existing rows.

---

## API / Contracts Affected

- `SalesService.create()` — after this ticket, passing `status: SaleStatus.DRAFT` in the DTO will be valid at the Prisma level. The service-layer default behavior (defaulting to `PENDING`) is not changed in this ticket.
- `mapToISale()` — the mapped response type will now include `discountType`, `discountValue`, `discountedTotal` as nullable fields. These will return `null` on all existing sales until SM-BE-008 populates them.
- No API response shape changes that would break existing consumers. The new fields are additive.

---

## Acceptance Criteria

1. `npx prisma migrate status` shows the migration as applied with no pending migrations in all environments (dev, staging).
2. `SaleStatus.DRAFT` is accessible from `@prisma/client` in TypeScript without type errors.
3. `DiscountType` enum is accessible from `@prisma/client` with values `PERCENTAGE` and `FIXED_AMOUNT`.
4. `SaleActivityType.INVOICE_CREATED`, `SaleActivityType.INVOICE_UPDATED`, `SaleActivityType.DISCOUNT_APPLIED`, and `SaleActivityType.MANUAL_ADJUSTMENT` are all accessible from `@prisma/client`.
5. A `Sale` record can be created with `status: 'DRAFT'` via `prisma.sale.create()` without error.
6. A `Sale` record can be created with `discountType: 'PERCENTAGE'`, `discountValue: 10.00`, `discountedTotal: 90.00` without error.
7. A `Sale` record can be created with all three discount fields as `null` (existing behavior unbroken).
8. `npx tsc --noEmit` passes with zero errors in `apps/backend/core-service`.
9. Existing unit tests in `apps/backend/core-service/src/modules/sales` continue to pass after the migration and client regeneration.
10. The migration file exists in `apps/backend/core-service/prisma/migrations/` with the correct timestamp and name.

---

## Edge Cases

1. **PostgreSQL `ALTER TYPE ADD VALUE` is not transactional.** If the migration partially fails after the enum values are added but before the `ALTER TABLE` statements run, the enum will contain the new values but the columns will not exist. Recovery requires manual SQL to add the columns. Document this in the migration file as a comment.
2. **Prisma client cached in CI.** If the CI/CD pipeline caches `node_modules`, the regenerated Prisma client from `prisma generate` may not be included. Ensure the pipeline runs `prisma generate` as a post-install step.
3. **Enum value ordering in existing data.** Adding `DRAFT` as the first enum value in the Prisma schema does not reorder PostgreSQL's internal enum representation. PostgreSQL preserves insertion order for `ALTER TYPE ADD VALUE`. This is safe.
4. **Multiple developers running `migrate dev` simultaneously.** This will fail with a migration conflict. Enforce that SM-BE-001 is merged to main before any developer begins downstream tickets.

---

## Dependencies

- No other SM-BE tickets must be started before this ticket is merged and the migration is applied.
- Requires Prisma CLI (`npx prisma`) to be available in the development environment.
- Requires a running PostgreSQL instance (dev and staging) with schema-write access.

---

## Testing Requirements

### Unit Tests

- **File to create:** `apps/backend/core-service/src/modules/sales/__tests__/sale-status-enum.spec.ts`
- Test that `SaleStatus.DRAFT` equals the string `'DRAFT'`.
- Test that `DiscountType.PERCENTAGE` equals `'PERCENTAGE'`.
- Test that `DiscountType.FIXED_AMOUNT` equals `'FIXED_AMOUNT'`.
- Test that `SaleActivityType.INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT` all resolve to their string values.
- These tests are trivial but serve as regression guards confirming Prisma client generation succeeded.

### Integration Tests

- **File to update/create:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`
- Add a test: `POST /sales` with `status: 'DRAFT'` returns HTTP 201 and the response body contains `status: 'DRAFT'`. (Note: this test will not pass until SM-BE-003 or SM-BE-005 allows agent/controller to set DRAFT — coordinate with those tickets. The integration test can be marked `[~] pending SM-BE-003` and verified as part of that ticket's done criteria.)
- Add a test: creating a `SaleActivity` record with type `INVOICE_CREATED` succeeds at the Prisma level.

### Migration Rollback Test

- On the staging database, apply the migration with `prisma migrate deploy`.
- Manually run `ALTER TYPE "SaleStatus" ... RENAME VALUE` is not possible as a rollback for enum additions in PostgreSQL. Document this explicitly in the ticket: the only rollback is a full database restore from backup.
- Verify that the staging application starts and serves requests normally after migration.
- Verify that the staging application can still process sales with the existing enum values (`PENDING`, `ACTIVE`, etc.) after migration.

### Manual QA Checks

- [ ] Connect to the staging PostgreSQL database and run `\dT+ "SaleStatus"` to confirm `DRAFT` is listed.
- [ ] Run `\dT+ "DiscountType"` to confirm the enum exists with both values.
- [ ] Run `\d "Sale"` to confirm `discountType`, `discountValue`, `discountedTotal` columns are present and nullable.
- [ ] Run `\dT+ "SaleActivityType"` to confirm all four new values are listed.

---

## Verification Steps

- [ ] Migration file exists in `apps/backend/core-service/prisma/migrations/` with correct name prefix.
- [ ] `npx prisma migrate status` shows zero pending migrations in dev environment.
- [ ] `npx prisma migrate status` shows zero pending migrations in staging environment.
- [ ] `npx prisma generate` completes without errors.
- [ ] `npx tsc --noEmit` passes in `apps/backend/core-service` with zero errors.
- [ ] All existing sales unit tests pass (`nx test core-service`).
- [ ] `SaleStatus.DRAFT` accessible in TypeScript (verify in a test file or REPL).
- [ ] `DiscountType` accessible in TypeScript.
- [ ] All four new `SaleActivityType` values accessible in TypeScript.
- [ ] PostgreSQL `\dT+` commands confirm schema changes in staging DB.
- [ ] PR reviewed and approved by at least one other engineer before merge.

---

## Rollback / Risk Notes

- **Enum values cannot be removed from PostgreSQL without recreating the type.** If `DRAFT` needs to be removed after deployment, it requires a multi-step process: rename to a reserved/deprecated value, migrate all rows away from it, drop and recreate the type. Plan accordingly.
- **Low risk overall.** All changes are additive. No existing data is modified. No existing queries are invalidated.
- **Migration must be applied in order.** Do not apply SM-BE-002's migration before SM-BE-001's migration is confirmed applied.
- **Emergency rollback:** If a critical issue is found immediately after deploying this migration, roll back the application code to the previous version. The database schema change (enum additions, nullable columns) does not need to be rolled back for the previous application version to function — the new columns are nullable and the new enum values will simply not be used.
