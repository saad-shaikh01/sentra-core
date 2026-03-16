# SM-BE-002 — SaleItem Package Linkage

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-002                                  |
| Title          | SaleItem Package Linkage                   |
| Phase          | 1 — Backend                                |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 3 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

`SaleItem` currently supports only free-form entry (manual name, unit price, quantity). This ticket adds optional package/catalog linkage by introducing `packageId` and `packageName` fields as a soft reference. The snapshot approach ensures that if a package is later renamed or removed from the catalog, historical sale records remain accurate.

---

## User / Business Outcome

- Sales staff can link a sale item to an existing product/service from the catalog, reducing manual data entry errors.
- Even after catalog changes, the sale record preserves the exact name and price that was active at the time of sale creation.
- Free-form items remain fully supported for ad-hoc services not in the catalog.

---

## Exact Scope

### In Scope

1. Add `packageId` (String, nullable) and `packageName` (String, nullable) to the `SaleItem` Prisma model.
2. Update `SaleItemDto` (or the equivalent inner DTO used in `CreateSaleDto`) to accept optional `packageId` and `packageName`.
3. Update `SalesService.create()` to pass `packageId` and `packageName` through to `prisma.saleItem.create()`.
4. Update `mapToISale()` to include `packageId` and `packageName` in the mapped sale items.
5. Update the `ISaleItem` interface in the shared types library (if one exists) to include these optional fields.
6. Generate and apply the Prisma migration.

### Out of Scope

- Validating that `packageId` references a real package in the catalog. This is a soft reference — no FK constraint.
- Fetching or auto-populating `name`, `unitPrice` from the catalog in this ticket. That is a frontend concern (SM-FE-007 `PackageCatalogPicker`).
- Item-level discounts (deferred to a future phase per plan).
- Any frontend changes.

---

## Backend Tasks

### 1. Update Prisma Schema

**File:** `apps/backend/core-service/prisma/schema.prisma`

Add `packageId` and `packageName` to the `SaleItem` model:

```prisma
model SaleItem {
  id          String   @id @default(cuid())
  name        String
  description String?
  quantity    Int
  unitPrice   Decimal  @db.Decimal(10, 2)
  customPrice Decimal? @db.Decimal(10, 2)
  packageId   String?
  packageName String?
  saleId      String
  sale        Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)
}
```

Place `packageId` and `packageName` after `customPrice` and before `saleId` to keep the item's own fields grouped.

**Important:** Do NOT add `@relation` for `packageId`. It is a plain `String?` field — a soft reference only. There must be no foreign key constraint generated for it.

### 2. Generate and Apply Migration

```bash
cd apps/backend/core-service
npx prisma migrate dev --name add_sale_item_package_linkage
npx prisma generate
```

The generated SQL will be:
```sql
ALTER TABLE "SaleItem" ADD COLUMN "packageId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "packageName" TEXT;
```

### 3. Update SaleItem DTO

**File:** `apps/backend/core-service/src/modules/sales/dto/create-sale.dto.ts`

Locate the nested `SaleItemDto` class (or equivalent) within this file. Add the two optional fields:

```typescript
import { IsOptional, IsString } from 'class-validator';

export class SaleItemDto {
  // ... existing fields ...

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  packageName?: string;
}
```

Both fields are optional. No length or format validation is applied to `packageId` in Phase 1 (it is a soft reference).

### 4. Update `SalesService.create()` — SaleItem Persistence

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

In the `create()` method, find where `SaleItem` records are created (likely inside a `prisma.$transaction` block). Update the create data to pass through `packageId` and `packageName`:

```typescript
// Inside the items.map() for saleItem creation:
{
  name: item.name,
  description: item.description,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  customPrice: item.customPrice ?? null,
  packageId: item.packageId ?? null,      // ADD
  packageName: item.packageName ?? null,  // ADD
  saleId: sale.id,
}
```

### 5. Update `mapToISale()` Function

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Locate the `mapToISale()` helper function. In the section that maps sale items, include the new fields:

```typescript
items: sale.items?.map((item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  quantity: item.quantity,
  unitPrice: Number(item.unitPrice),
  customPrice: item.customPrice ? Number(item.customPrice) : null,
  packageId: item.packageId ?? null,       // ADD
  packageName: item.packageName ?? null,   // ADD
})) ?? [],
```

### 6. Update `ISaleItem` Interface (Shared Types)

**Search for:** `ISaleItem` in `libs/` directory.

If an `ISaleItem` interface exists in a shared types library (e.g., `libs/shared-types/src/lib/sale.types.ts` or similar), update it:

```typescript
export interface ISaleItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  customPrice?: number | null;
  packageId?: string | null;    // ADD
  packageName?: string | null;  // ADD
}
```

If no shared `ISaleItem` interface exists, check the return type of `mapToISale()` and ensure the inline type includes these fields.

### 7. Verify TypeScript Compilation

```bash
cd apps/backend/core-service
npx tsc --noEmit
```

No errors must be present.

---

## Frontend Tasks

None. The frontend implementation of the catalog picker component is in SM-FE-007. This ticket only prepares the backend to accept and return `packageId`/`packageName`.

---

## Schema / Migration Impact

### Modified Model: `SaleItem`

```
Added: packageId String? (no FK constraint)
Added: packageName String?
```

### Backward Compatibility

- All existing `SaleItem` rows will have `NULL` for `packageId` and `packageName`. This is valid.
- Existing API consumers receiving `SaleItem` data will now see two additional nullable fields in the response (`packageId: null`, `packageName: null`). This is a backward-compatible additive change.

---

## API / Contracts Affected

### `POST /sales` — Request Body

`items[]` array now accepts optional `packageId` and `packageName` per item:

```json
{
  "items": [
    {
      "name": "Website Development",
      "quantity": 1,
      "unitPrice": 5000.00,
      "packageId": "pkg_abc123",
      "packageName": "Standard Web Package"
    }
  ]
}
```

Both fields are optional. If omitted, they default to `null`.

### `GET /sales` and `GET /sales/:id` — Response Body

`items[]` in the response now includes `packageId` and `packageName`:

```json
{
  "items": [
    {
      "id": "item_xyz",
      "name": "Website Development",
      "quantity": 1,
      "unitPrice": 5000.00,
      "customPrice": null,
      "packageId": "pkg_abc123",
      "packageName": "Standard Web Package"
    }
  ]
}
```

---

## Acceptance Criteria

1. A sale can be created with `items[].packageId` and `items[].packageName` present, and both values are persisted to the `SaleItem` record in the database.
2. A sale can be created with `items[].packageId` and `items[].packageName` absent, and both values default to `null` in the database.
3. `GET /sales/:id` returns `items[].packageId` and `items[].packageName` in the response for items that have them set.
4. `GET /sales/:id` returns `items[].packageId: null` and `items[].packageName: null` for items without package linkage.
5. Setting `packageId` to a non-existent package ID does NOT cause a database error (no FK constraint).
6. `PATCH /sales/:id` — updating an existing sale item's `packageId` is reflected in the next `GET /sales/:id` response. (Confirm whether item-level update is supported in the current `update()` method; if not, document as a known limitation in the PR.)
7. `npx tsc --noEmit` passes with zero errors after the changes.
8. All existing sales unit tests continue to pass.
9. The Prisma migration is applied without errors.
10. `ISaleItem` (or equivalent return type) includes `packageId` and `packageName` as optional nullable fields.

---

## Edge Cases

1. **`packageId` provided without `packageName`:** Both fields are independent. The system must persist whatever is provided. If only `packageId` is given, `packageName` is stored as `null`.
2. **`packageName` differs from catalog:** The stored `packageName` is the snapshot at time of sale creation. It is not synchronized with the catalog after creation. This is by design.
3. **`packageId` provided for a non-existent package:** No error is thrown. The field is stored as-is. The frontend must handle display of orphaned package references gracefully.
4. **Items without `packageId` in a sale that also has catalog-linked items:** Mixed items (some linked, some free-form) are fully supported. There is no constraint requiring all items to be linked or all to be free-form.
5. **`PATCH /sales/:id` item update behavior:** If the current `update()` method replaces all items (delete + recreate), verify that `packageId` and `packageName` are included in the recreate payload. If `update()` does individual item updates by `id`, verify each update path includes these fields.

---

## Dependencies

- **SM-BE-001** must be merged and applied before this ticket begins (Prisma migration ordering).

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Add test: `create()` with `items[].packageId = 'pkg_test'` and `items[].packageName = 'Test Package'` — verify `prisma.saleItem.create` is called with `packageId: 'pkg_test'` and `packageName: 'Test Package'`.
- Add test: `create()` with items that omit `packageId` and `packageName` — verify `prisma.saleItem.create` is called with `packageId: null` and `packageName: null`.
- Add test: `mapToISale()` with a sale item that has `packageId` and `packageName` set — verify the returned object includes both fields with correct values.
- Add test: `mapToISale()` with a sale item that has `packageId: null` and `packageName: null` — verify the returned object includes both fields as `null`.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- Add test: `POST /sales` with `items[0].packageId = 'pkg_123'` and `items[0].packageName = 'Package Name'` — verify HTTP 201 response body contains `items[0].packageId === 'pkg_123'`.
- Add test: `GET /sales/:id` after creating a sale with a catalog-linked item — verify response body `items[0].packageId` and `items[0].packageName` match the creation payload.
- Add test: `POST /sales` with `items[0].packageId = 'nonexistent_id'` — verify HTTP 201 (no FK error).

### Manual QA Checks

- [ ] Create a sale via the API with a catalog-linked item.
- [ ] Retrieve the sale via `GET /sales/:id` and confirm `packageId` and `packageName` are present in the response.
- [ ] Create a sale with a free-form item (no `packageId`).
- [ ] Retrieve the sale and confirm `packageId: null` and `packageName: null`.
- [ ] Run `SELECT "packageId", "packageName" FROM "SaleItem" LIMIT 5;` in staging DB to confirm column presence.

---

## Verification Steps

- [ ] Migration applied: `npx prisma migrate status` shows no pending migrations.
- [ ] `npx prisma generate` completed without errors.
- [ ] `SaleItem` model in Prisma client has `packageId` and `packageName` fields.
- [ ] `SaleItemDto` has `packageId?: string` and `packageName?: string` decorated with `@IsOptional() @IsString()`.
- [ ] `SalesService.create()` passes `packageId` and `packageName` to `prisma.saleItem.create()`.
- [ ] `mapToISale()` returns `packageId` and `packageName` in mapped items.
- [ ] `ISaleItem` interface (or equivalent) includes the two new optional fields.
- [ ] `npx tsc --noEmit` passes.
- [ ] All unit tests pass (`nx test core-service`).
- [ ] Integration test for catalog-linked item creation passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **Low risk.** Adding nullable columns to `SaleItem` is a non-breaking additive change.
- **Rollback:** Roll back application code to previous version. The `packageId` and `packageName` columns can remain in the database as nullable — they will simply not be populated. A separate migration to drop the columns can be applied at a later time if needed.
- **No data corruption risk.** Existing sale items are unaffected; their new columns will be `NULL`.
