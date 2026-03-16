# SM-BE-004 — Soft-Delete Conversion

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-004                                  |
| Title          | Soft-Delete Conversion                     |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 2 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

`SalesService.remove()` currently issues a hard `prisma.sale.delete()` call. This permanently destroys the sale record and all related `SaleItem`, `Invoice`, `PaymentTransaction`, and `SaleActivity` records (via cascade). The `Sale` model already has a `deletedAt DateTime?` column that is never written. This ticket converts the delete operation to a soft-delete using this existing column, and updates all list/detail queries to exclude soft-deleted records.

---

## User / Business Outcome

- Archived sales remain in the database for audit and reporting purposes.
- Financial history (transactions, invoices, activities) is preserved even after a sale is archived.
- Accidental deletions can be recovered by a database administrator without data loss.
- Only OWNER and ADMIN users can archive a sale.

---

## Exact Scope

### In Scope

1. Change `SalesService.remove()` from `prisma.sale.delete()` to `prisma.sale.update({ data: { deletedAt: new Date() } })`.
2. Return `{ message: 'Sale archived successfully' }` from `remove()`.
3. Add `deletedAt: null` filter to `SalesService.findAll()` query so soft-deleted sales are excluded from list results.
4. Add `deletedAt: null` filter to `SalesService.findOne()` query so soft-deleted sales return 404.
5. Log a `SaleActivity` record with type `STATUS_CHANGE` and `data: { action: 'ARCHIVED', deletedAt }` after the soft-delete is applied. (Note: `SaleActivityType.STATUS_CHANGE` already exists. `actorId` must be threaded through.)
6. Confirm that `@Roles()` on `DELETE /sales/:id` already restricts to `OWNER` and `ADMIN`. If not, fix it.

### Out of Scope

- Adding a "restore archived sale" endpoint (out of scope for Phase 1).
- Exposing archived sales to admins via a separate filter (out of scope for Phase 1).
- Cascading soft-delete to related records (`Invoice`, `PaymentTransaction`). Related records are left with their current state — they are simply unreachable through normal queries once the parent sale is archived.
- Any frontend changes.

---

## Backend Tasks

### 1. Update `SalesService.remove()` — Soft-Delete

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

**Current implementation (approximate):**
```typescript
async remove(id: string, organizationId: string): Promise<void> {
  const sale = await this.prisma.sale.findFirst({
    where: { id, organizationId },
  });
  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }
  await this.prisma.sale.delete({ where: { id } });
}
```

**Replace with:**
```typescript
async remove(
  id: string,
  organizationId: string,
  actorId: string,  // ADD — required for activity logging
): Promise<{ message: string }> {
  const sale = await this.prisma.sale.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  const now = new Date();

  await this.prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id },
      data: { deletedAt: now },
    });

    // Activity logging (coordinate with SM-BE-007; add the call here directly)
    await tx.saleActivity.create({
      data: {
        saleId: id,
        userId: actorId,
        type: 'STATUS_CHANGE',
        data: { action: 'ARCHIVED', deletedAt: now.toISOString() },
      },
    });
  });

  // Invalidate cache
  await this.cacheService.del(`sale:${organizationId}:${id}`);
  await this.cacheService.del(`sales:${organizationId}:*`);

  return { message: 'Sale archived successfully' };
}
```

**Notes on cache invalidation:** Use whatever cache invalidation pattern is established in the existing `SalesService`. If the service uses a `CacheService` with named keys, follow that pattern. If it uses `@nestjs/cache-manager`, use `cacheManager.del()`. Do not assume a specific cache implementation — check the existing `create()` and `update()` methods for the established pattern and mirror it.

### 2. Update `SalesService.findAll()` — Exclude Soft-Deleted

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

In the `findAll()` method, find the `prisma.sale.findMany()` call. Add `deletedAt: null` to the `where` clause:

```typescript
const where: Prisma.SaleWhereInput = {
  organizationId,
  deletedAt: null,    // ADD THIS
  // ... other existing where conditions (status filter, brandId filter, etc.) ...
};
```

Also update the `prisma.sale.count()` call used for pagination to include `deletedAt: null`:

```typescript
const total = await this.prisma.sale.count({ where: { ...where, deletedAt: null } });
```

If `where` already includes `deletedAt: null`, the count call inherits it.

### 3. Update `SalesService.findOne()` — Exclude Soft-Deleted

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
async findOne(id: string, organizationId: string): Promise<ISale> {
  const sale = await this.prisma.sale.findFirst({
    where: {
      id,
      organizationId,
      deletedAt: null,   // ADD THIS
    },
    include: {
      items: true,
      invoices: true,
      transactions: true,
      activities: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  return this.mapToISale(sale);
}
```

### 4. Update Controller `remove()` to Pass `actorId`

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Delete(':id')
@Roles(UserRole.OWNER, UserRole.ADMIN)
async remove(
  @Param('id') id: string,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,  // ADD
): Promise<{ message: string }> {
  return this.salesService.remove(id, organizationId, user.sub);
}
```

Confirm that `@Roles(UserRole.OWNER, UserRole.ADMIN)` is already on this endpoint. If it has additional roles, remove them — only OWNER and ADMIN may archive sales.

### 5. Update `SalesService.update()` — Add `deletedAt: null` Filter

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

In the `update()` method's `findFirst` call, add `deletedAt: null` to prevent updating a soft-deleted sale:

```typescript
const existingSale = await this.prisma.sale.findFirst({
  where: { id, organizationId, deletedAt: null },  // ADD deletedAt: null
});
```

### 6. Update `SalesService.charge()` and `SalesService.subscribe()` (if they exist)

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Check all other service methods that look up a sale by `id` and `organizationId`. Add `deletedAt: null` to each lookup to ensure archived sales cannot be charged or subscribed.

---

## Frontend Tasks

None. The frontend will simply receive a 404 when attempting to access an archived sale, which is the correct behavior.

---

## Schema / Migration Impact

No schema changes. The `deletedAt DateTime?` column already exists on the `Sale` model. This ticket only changes service logic.

---

## API / Contracts Affected

### `DELETE /sales/:id`

**Before:** Returns HTTP 200 with no body (or HTTP 204). Permanently deletes the sale.

**After:**
- HTTP 200 with body: `{ message: 'Sale archived successfully' }`
- HTTP 403 if actor role is not OWNER or ADMIN.
- HTTP 404 if sale does not exist or is already archived.
- Sale is NOT deleted from the database. `deletedAt` is set.

### `GET /sales`

- Soft-deleted sales are excluded from all list results.
- Pagination counts exclude soft-deleted sales.

### `GET /sales/:id`

- Returns HTTP 404 for soft-deleted sales (same as non-existent).

### `PATCH /sales/:id`

- Returns HTTP 404 for soft-deleted sales (cannot update an archived sale).

---

## Acceptance Criteria

1. `DELETE /sales/:id` by an OWNER returns HTTP 200 with body `{ "message": "Sale archived successfully" }`.
2. After `DELETE /sales/:id`, the sale record in the database has `deletedAt` set to a non-null timestamp.
3. After `DELETE /sales/:id`, `GET /sales/:id` returns HTTP 404.
4. After `DELETE /sales/:id`, the sale does NOT appear in `GET /sales` results.
5. After `DELETE /sales/:id`, a `SaleActivity` record exists for the sale with `type: 'STATUS_CHANGE'` and `data.action: 'ARCHIVED'`.
6. `DELETE /sales/:id` by a `SALES_MANAGER` returns HTTP 403.
7. `DELETE /sales/:id` by a `FRONTSELL_AGENT` returns HTTP 403.
8. `DELETE /sales/:id` on an already-archived sale returns HTTP 404.
9. `GET /sales` does not include any sale with a non-null `deletedAt` in its results.
10. `PATCH /sales/:id` on an archived sale returns HTTP 404.
11. All related records (`SaleItem`, `Invoice`, `PaymentTransaction`, `SaleActivity`) remain in the database after the parent sale is archived. No cascading hard delete occurs.
12. Pagination totals in `GET /sales` correctly exclude archived sales from the count.

---

## Edge Cases

1. **Archiving an ACTIVE sale:** There is no status restriction on archiving. An OWNER can archive a sale in any status. The activity log records the archive action; the `status` field on the `Sale` record is not changed to reflect archival (the `deletedAt` timestamp is the indicator).
2. **Archiving a sale with active subscriptions:** The ARB subscription is NOT automatically cancelled when a sale is archived. Staff must manually cancel the subscription first via the cancel-subscription endpoint (if it exists). Document this limitation in the response: consider returning a `warning` field if `subscriptionId` is non-null on the sale being archived.
3. **Double-delete (archive already archived):** The `findFirst` with `deletedAt: null` will return null, causing `NotFoundException`. This is the correct response — do not return 200 for an already-archived sale.
4. **Concurrent archive + update:** If two requests arrive simultaneously — one to archive and one to update — the archive request sets `deletedAt`, and the update request's `findFirst` with `deletedAt: null` will find nothing, returning 404. This is the correct race-condition behavior.
5. **Transaction failure:** If the `tx.saleActivity.create()` call fails inside the transaction, the `tx.sale.update()` is also rolled back. The `deletedAt` will not be set. This is correct — an archive without an activity log entry should not silently succeed.

---

## Dependencies

- **SM-BE-001** — No schema dependency for this ticket, but the `SaleActivity` logging uses `SaleActivityType.STATUS_CHANGE` which already exists. SM-BE-001 does not change `STATUS_CHANGE`. This ticket can be implemented in parallel with SM-BE-001 as long as the `SaleActivity` create call is added.
- **SM-BE-007** — Activity logging is broadly addressed in SM-BE-007, but the archive activity log call is included directly in this ticket's `remove()` implementation. Coordinate with SM-BE-007 to avoid duplicate logging or use a shared `logActivity()` helper once it is created.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `remove()` with a valid, non-deleted sale: verify `prisma.sale.update` is called with `data: { deletedAt: expect.any(Date) }`, NOT `prisma.sale.delete`.
- Test `remove()` verifies `prisma.saleActivity.create` is called with `type: 'STATUS_CHANGE'` and `data.action: 'ARCHIVED'`.
- Test `remove()` with a soft-deleted sale (mock `findFirst` returning `null`): verify `NotFoundException` is thrown.
- Test `findAll()` includes `deletedAt: null` in the where clause (inspect the mock call arguments).
- Test `findOne()` includes `deletedAt: null` in the where clause.
- Test `update()` includes `deletedAt: null` in the where clause.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `DELETE /sales/:id` with OWNER JWT: expect HTTP 200, `{ message: 'Sale archived successfully' }`.
- `DELETE /sales/:id` with SALES_MANAGER JWT: expect HTTP 403.
- `GET /sales/:id` after archive: expect HTTP 404.
- `GET /sales` after archive: expect sale not in results list.
- `DELETE /sales/:id` on already-archived sale: expect HTTP 404.
- Verify `SaleActivity` record created with correct type and data after archive.

### Manual QA Checks

- [ ] Archive a sale via `DELETE /sales/:id`.
- [ ] Confirm HTTP 200 response with `{ "message": "Sale archived successfully" }`.
- [ ] Run `SELECT "deletedAt" FROM "Sale" WHERE id = '<archived_id>';` — confirm non-null timestamp.
- [ ] Confirm `GET /sales` does not include the archived sale.
- [ ] Confirm `GET /sales/:id` returns 404 for the archived sale.
- [ ] Run `SELECT * FROM "SaleActivity" WHERE "saleId" = '<archived_id>' ORDER BY "createdAt" DESC LIMIT 1;` — confirm the ARCHIVED activity exists.
- [ ] Confirm related `SaleItem` records still exist in the database via `SELECT * FROM "SaleItem" WHERE "saleId" = '<archived_id>';`.

---

## Verification Steps

- [ ] `SalesService.remove()` uses `prisma.sale.update({ data: { deletedAt: new Date() } })` not `prisma.sale.delete()`.
- [ ] `SalesService.remove()` returns `{ message: 'Sale archived successfully' }`.
- [ ] `SalesService.findAll()` includes `deletedAt: null` in where clause.
- [ ] `SalesService.findOne()` includes `deletedAt: null` in where clause.
- [ ] `SalesService.update()` includes `deletedAt: null` in where clause.
- [ ] `SalesController.remove()` passes `user.sub` as `actorId` to service.
- [ ] `@Roles()` on `DELETE /sales/:id` is exactly `[UserRole.OWNER, UserRole.ADMIN]`.
- [ ] `SaleActivity` record created on archive.
- [ ] Cache invalidated after archive.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration required.** Rollback is simply reverting the code change.
- **Breaking change:** Clients relying on `DELETE /sales/:id` to return 204 or no body will need to handle the new `{ message }` response. Communicate to API consumers.
- **Risk: Archived sale with active ARB subscription.** If a sale is archived without first cancelling its ARB subscription, Authorize.net will continue charging the customer. Consider adding a warning in the `remove()` response if `sale.subscriptionId` is non-null. This is a Phase 1 warning only — automatic cancellation is not implemented.
- **Data safety:** No data is destroyed. All records remain fully intact in the database. The only change is setting `deletedAt` on the `Sale` row.
