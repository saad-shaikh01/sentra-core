# SM-BE-007 — Activity Logging for All Write Operations

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-007                                  |
| Title          | Activity Logging for All Write Operations  |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 5 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

`SaleActivity` schema exists with a full `SaleActivityType` enum, but zero `prisma.saleActivity.create()` calls exist anywhere in `sales.service.ts`. This ticket fills that gap by implementing a shared `logActivity()` helper and wiring it into every write operation in the service. It also adds a `POST /sales/:id/note` endpoint so authorized users can manually add notes to the activity timeline.

---

## User / Business Outcome

- Every significant event in a sale's lifecycle is recorded with who did it, when, and what changed.
- Staff reviewing a sale's detail page can see a complete audit trail from creation to current state.
- Disputes, investigations, and financial reviews can rely on the activity log as a source of truth.

---

## Exact Scope

### In Scope

1. Create a private `logActivity()` helper in `SalesService` that accepts either a `Prisma.TransactionClient` or `PrismaService` and creates a `SaleActivity` record.
2. Add `logActivity()` calls to: `create()`, `update()` (status change + discount change), `remove()` (SM-BE-004 defers to this ticket's helper), `charge()`, `subscribe()`, `cancelSubscription()` (if they exist).
3. Implement `POST /sales/:id/note` endpoint (controller + service method) that logs a NOTE activity with user-supplied text.
4. Thread `actorId` through all affected methods (coordinate with SM-BE-003 and SM-BE-005 which already add `actorId` to `update()` and `create()`).
5. Log `INVOICE_CREATED` for each invoice generated in `create()`.
6. Log `DISCOUNT_APPLIED` when discount fields are set in `create()` or changed in `update()`.

### Out of Scope

- Webhook-triggered activity logging (handled in SM-BE-011).
- Refund and chargeback activity logging (handled in SM-BE-009 and SM-BE-010 respectively, though they will use the `logActivity()` helper from this ticket).
- Displaying the activity timeline in the frontend (SM-FE-006).

---

## Backend Tasks

### 1. Create `logActivity()` Private Helper

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add the following private method to `SalesService`:

```typescript
import { Prisma, SaleActivityType } from '@prisma/client';

private async logActivity(
  tx: Prisma.TransactionClient | typeof this.prisma,
  saleId: string,
  userId: string,
  type: SaleActivityType,
  data: Record<string, unknown>,
): Promise<void> {
  await (tx as any).saleActivity.create({
    data: {
      saleId,
      userId,
      type,
      data: data as Prisma.InputJsonValue,
    },
  });
}
```

**Notes:**
- Accept both `Prisma.TransactionClient` and the injected `PrismaService` so the helper can be called both inside and outside transactions.
- The `data` field on `SaleActivity` is typed as `Json` in Prisma — use `Prisma.InputJsonValue` or `any` as appropriate.
- Keep this method fire-and-forget within transactions. If activity logging fails inside a transaction, the transaction rolls back. This is intentional — we do not want silent audit gaps.

### 2. Wire `logActivity()` into `SalesService.create()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Inside the `create()` transaction block, add activity logging after the sale and items are created:

```typescript
// 1. Log CREATED activity
await this.logActivity(tx, sale.id, actorId, SaleActivityType.CREATED, {
  totalAmount: Number(sale.totalAmount),
  status: sale.status,
  paymentPlan: sale.paymentPlan,
  clientId: sale.clientId,
  leadId: createSaleDto.leadId ?? null,
});

// 2. Log INVOICE_CREATED for each generated invoice
for (const invoice of createdInvoices) {
  await this.logActivity(tx, sale.id, actorId, SaleActivityType.INVOICE_CREATED, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: Number(invoice.amount),
    dueDate: invoice.dueDate?.toISOString() ?? null,
  });
}

// 3. Log DISCOUNT_APPLIED if discount was set
if (createSaleDto.discountType && createSaleDto.discountValue) {
  await this.logActivity(tx, sale.id, actorId, SaleActivityType.DISCOUNT_APPLIED, {
    discountType: createSaleDto.discountType,
    discountValue: Number(createSaleDto.discountValue),
    discountedTotal: Number(sale.discountedTotal),
  });
}
```

### 3. Wire `logActivity()` into `SalesService.update()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Inside the `update()` transaction block:

```typescript
// After the update is applied:

// 1. Log STATUS_CHANGE if status changed
if (updateSaleDto.status && updateSaleDto.status !== existingSale.status) {
  await this.logActivity(tx, id, actorId, SaleActivityType.STATUS_CHANGE, {
    from: existingSale.status,
    to: updateSaleDto.status,
  });
}

// 2. Log DISCOUNT_APPLIED if discount fields changed
const discountChanged =
  (updateSaleDto.discountType !== undefined && updateSaleDto.discountType !== existingSale.discountType) ||
  (updateSaleDto.discountValue !== undefined &&
    Number(updateSaleDto.discountValue) !== Number(existingSale.discountValue));

if (discountChanged) {
  await this.logActivity(tx, id, actorId, SaleActivityType.DISCOUNT_APPLIED, {
    discountType: updateSaleDto.discountType ?? existingSale.discountType,
    discountValue: Number(updateSaleDto.discountValue ?? existingSale.discountValue),
    discountedTotal: Number(updatedSale.discountedTotal),
  });
}
```

### 4. Wire `logActivity()` into `SalesService.remove()` (Archive)

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

The archive activity log call in SM-BE-004 should use the shared helper from this ticket:

```typescript
await this.logActivity(tx, id, actorId, SaleActivityType.STATUS_CHANGE, {
  action: 'ARCHIVED',
  deletedAt: now.toISOString(),
});
```

Coordinate with SM-BE-004 to replace the inline `tx.saleActivity.create()` call with `this.logActivity()`.

### 5. Wire `logActivity()` into `SalesService.charge()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Find the existing `charge()` method (from `ChargeSaleDto`). After a successful charge:

```typescript
// On success:
await this.logActivity(this.prisma, saleId, actorId, SaleActivityType.PAYMENT_RECEIVED, {
  transactionId: authorizeNetResponse.transactionId,
  amount: Number(chargeDto.amount),
  invoiceId: chargeDto.invoiceId ?? null,
});

// On failure (in the catch block):
await this.logActivity(this.prisma, saleId, actorId, SaleActivityType.PAYMENT_FAILED, {
  amount: Number(chargeDto.amount),
  reason: error.message ?? 'Unknown error',
  responseCode: authorizeNetResponse?.responseCode ?? null,
});
```

If `charge()` does not currently have `actorId` in its signature, add it. Update the controller to pass `user.sub`.

### 6. Wire `logActivity()` into `SalesService.subscribe()`

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

After the ARB subscription is created successfully:

```typescript
await this.logActivity(this.prisma, saleId, actorId, SaleActivityType.STATUS_CHANGE, {
  from: existingSale.status,
  to: SaleStatus.ACTIVE,
  trigger: 'subscription_activated',
  subscriptionId: authorizeNetResponse.subscriptionId,
});
```

### 7. Implement `POST /sales/:id/note` Endpoint

**File:** `apps/backend/core-service/src/modules/sales/dto/add-note.dto.ts` (create this file)

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';

export class AddNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note: string;
}
```

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add a new service method:

```typescript
async addNote(
  id: string,
  organizationId: string,
  actorId: string,
  note: string,
): Promise<{ success: true }> {
  const sale = await this.prisma.sale.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!sale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  await this.logActivity(this.prisma, id, actorId, SaleActivityType.NOTE, {
    note,
  });

  return { success: true };
}
```

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

Add a new route:

```typescript
@Post(':id/note')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES_MANAGER,
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
  UserRole.PROJECT_MANAGER,
)
async addNote(
  @Param('id') id: string,
  @Body() addNoteDto: AddNoteDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<{ success: true }>> {
  const result = await this.salesService.addNote(
    id,
    organizationId,
    user.sub,
    addNoteDto.note,
  );
  return CommApiResponse.success(result);
}
```

### 8. Include Activities in `GET /sales/:id` Response

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Verify that `findOne()` already includes `activities` in the Prisma query:

```typescript
const sale = await this.prisma.sale.findFirst({
  where: { id, organizationId, deletedAt: null },
  include: {
    items: true,
    invoices: true,
    transactions: true,
    activities: {
      orderBy: { createdAt: 'asc' },   // chronological order
    },
  },
});
```

Update `mapToISale()` to include activities in the mapped response:

```typescript
activities: sale.activities?.map((activity) => ({
  id: activity.id,
  type: activity.type,
  data: activity.data,
  userId: activity.userId,
  createdAt: activity.createdAt.toISOString(),
})) ?? [],
```

Update `ISale` interface to include `activities: ISaleActivity[]`.

---

## Frontend Tasks

None. The activity timeline display is in SM-FE-006. The note input modal is in SM-FE-006 and depends on this endpoint.

---

## Schema / Migration Impact

No schema changes. The `SaleActivity` model and `SaleActivityType` enum (including new values added in SM-BE-001) are used but not modified.

---

## API / Contracts Affected

### New Endpoint: `POST /sales/:id/note`

**Request:**
```json
{ "note": "Client requested a payment extension until end of month." }
```

**Response (200):**
```json
{ "data": { "success": true } }
```

**Errors:** 404 if sale not found; 403 if role not allowed; 400 if note is empty.

### Modified: `GET /sales/:id` Response

Activities array now populated:

```json
{
  "data": {
    "id": "...",
    "activities": [
      {
        "id": "act_001",
        "type": "CREATED",
        "data": { "totalAmount": 5000, "status": "DRAFT", "paymentPlan": "ONE_TIME", "clientId": "cl_abc" },
        "userId": "usr_xyz",
        "createdAt": "2026-03-17T10:00:00.000Z"
      }
    ]
  }
}
```

Previously, activities may have been omitted or returned as an empty array. After this ticket, they will be populated for all sales.

---

## Acceptance Criteria

1. `POST /sales` creates at least one `SaleActivity` record with `type: 'CREATED'` and the correct `saleId`, `userId`, and `data` fields.
2. If the `POST /sales` request includes `discountType` and `discountValue`, a `DISCOUNT_APPLIED` activity is also created.
3. If the `POST /sales` request triggers invoice generation, one `INVOICE_CREATED` activity is created per generated invoice.
4. `PATCH /sales/:id` with a `status` change creates a `STATUS_CHANGE` activity with `data: { from: oldStatus, to: newStatus }`.
5. `PATCH /sales/:id` without a `status` change does NOT create a `STATUS_CHANGE` activity.
6. `PATCH /sales/:id` with a discount change creates a `DISCOUNT_APPLIED` activity.
7. `DELETE /sales/:id` (archive) creates a `STATUS_CHANGE` activity with `data.action: 'ARCHIVED'`.
8. `POST /sales/:id/note` with a valid `note` field returns HTTP 200 and creates a `NOTE` activity with the note text in `data.note`.
9. `POST /sales/:id/note` with an empty `note` returns HTTP 400.
10. `POST /sales/:id/note` on a non-existent or archived sale returns HTTP 404.
11. `GET /sales/:id` response includes an `activities` array that is sorted chronologically (oldest first).
12. `logActivity()` called inside a transaction: if the transaction rolls back, the activity record is also rolled back (not persisted).
13. `logActivity()` called outside a transaction (using `this.prisma` directly) persists independently.
14. `actorId` is correctly recorded in all `SaleActivity.userId` fields — it reflects the authenticated user who performed the action.

---

## Edge Cases

1. **`actorId` is a system user (webhook):** For activities created by the ARB webhook (SM-BE-011), use a reserved system identifier such as `'system'` or a configured system user ID. Do not pass null.
2. **`charge()` called without `invoiceId`:** Log `PAYMENT_RECEIVED` with `invoiceId: null`. This is valid for unlinked one-time payments.
3. **`subscribe()` fails after the ARB subscription is created:** The activity log for `STATUS_CHANGE` should only be written after the status update to `ACTIVE` succeeds. Use a transaction.
4. **Multiple invoices created in a single `create()` call:** One `INVOICE_CREATED` activity must be created per invoice, not one aggregate activity.
5. **Activity table grows large over time:** No pagination is applied in Phase 1. The `GET /sales/:id` includes all activities. If a sale has hundreds of entries, this could slow the detail endpoint. Index on `saleId` is assumed to exist. Add it if not present.
6. **Concurrent writes to the same sale:** Each concurrent write creates its own activity record. The `createdAt` timestamp differentiates them. No deduplication needed.

---

## Dependencies

- **SM-BE-001** — Required for `INVOICE_CREATED`, `INVOICE_UPDATED`, `DISCOUNT_APPLIED`, `MANUAL_ADJUSTMENT` enum values.
- **SM-BE-003** — `actorId` and `actorRole` are added to `update()` in SM-BE-003. This ticket uses `actorId` from that same parameter.
- **SM-BE-004** — The `remove()` archive activity log in SM-BE-004 should be refactored to use `this.logActivity()` from this ticket once both are implemented.
- **SM-BE-009** and **SM-BE-010** — Both will call `this.logActivity()` for `REFUND_ISSUED` and `CHARGEBACK_FILED`. Ensure this ticket is merged before those tickets are implemented.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `logActivity()`: verify `prisma.saleActivity.create` is called with correct arguments.
- Test `create()`: verify CREATED activity is logged.
- Test `create()` with discount: verify DISCOUNT_APPLIED activity logged.
- Test `create()` with invoices: verify INVOICE_CREATED logged for each invoice.
- Test `update()` with status change: verify STATUS_CHANGE activity logged.
- Test `update()` without status change: verify STATUS_CHANGE activity NOT logged.
- Test `update()` with discount change: verify DISCOUNT_APPLIED logged.
- Test `addNote()` with valid note: verify NOTE activity created.
- Test `addNote()` with sale not found: verify NotFoundException.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `POST /sales` → verify `GET /sales/:id` returns activities including CREATED type.
- `PATCH /sales/:id` with status change → verify activities include STATUS_CHANGE.
- `POST /sales/:id/note` → HTTP 200; subsequent `GET /sales/:id` shows NOTE in activities.
- `POST /sales/:id/note` with empty note → HTTP 400.

### Manual QA Checks

- [ ] Create a sale. Call `GET /sales/:id` and confirm `activities` array includes a CREATED entry.
- [ ] Update the sale's status. Confirm a STATUS_CHANGE entry appears in activities.
- [ ] Add a note via `POST /sales/:id/note`. Confirm NOTE entry in activities.
- [ ] Check `userId` in activity entries matches the JWT sub of the authenticated user.
- [ ] Verify activities are sorted oldest-first.

---

## Verification Steps

- [ ] `logActivity()` private method exists in `SalesService`.
- [ ] `create()` calls `logActivity()` with CREATED, and conditionally with DISCOUNT_APPLIED and INVOICE_CREATED.
- [ ] `update()` calls `logActivity()` with STATUS_CHANGE when status changes.
- [ ] `update()` calls `logActivity()` with DISCOUNT_APPLIED when discount changes.
- [ ] `remove()` calls `logActivity()` with STATUS_CHANGE (ARCHIVED).
- [ ] `charge()` calls `logActivity()` with PAYMENT_RECEIVED on success and PAYMENT_FAILED on failure.
- [ ] `subscribe()` calls `logActivity()` with STATUS_CHANGE on activation.
- [ ] `AddNoteDto` created with `note: string` validated with `@IsString() @MinLength(1) @MaxLength(2000)`.
- [ ] `POST /sales/:id/note` route exists in controller with correct @Roles.
- [ ] `addNote()` method exists in service.
- [ ] `GET /sales/:id` includes `activities` array, sorted chronologically.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration.** Rollback is code revert.
- **Risk: Transaction rollback causes missing activities.** If the main operation (e.g., sale create) fails inside a transaction, the activity log is also rolled back. This is correct behavior — do not log activity for failed operations.
- **Risk: actorId threading.** If any code path does not correctly receive and pass `actorId`, activities will be logged with a null or incorrect userId. Carefully trace every call path. Write tests for this.
- **Low risk overall.** The `SaleActivity` table is append-only. No existing records are modified.
