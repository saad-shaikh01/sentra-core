# SM-BE-012 — Phase 1 Internal Notifications

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-012                                  |
| Title          | Phase 1 Internal Notifications             |
| Phase          | 1 — Backend                                |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 5 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

Sales events (payment failures, overdue invoices, status changes, chargebacks) need to surface as internal notifications to relevant staff members. Phase 1 covers internal-only notifications. Client-facing email delivery is Phase 3. This ticket implements the notification dispatch system for the sales module, integrating with whatever notification infrastructure already exists in core-service (or creating a lightweight one if none exists).

---

## User / Business Outcome

- Sales managers and admins are alerted immediately when a payment fails, preventing delayed follow-up.
- Overdue invoice alerts ensure collections action is taken promptly.
- Chargeback notifications reach owners immediately so disputes can be responded to within the gateway's deadline window.
- All relevant staff see status changes without needing to poll the sales list.

---

## Exact Scope

### In Scope

1. Inspect the codebase for an existing `Notification` Prisma model, `NotificationService`, or in-app notification infrastructure. Use it if found.
2. If no notification infrastructure exists: create a `SalesNotificationService` using Node.js built-in `EventEmitter` (no `@nestjs/event-emitter` package) and a `Notification` Prisma model for persistence.
3. Trigger notifications for: payment failures, overdue invoice detection, sale status changes, chargeback filed events.
4. Each notification must include: `type`, `message`, `saleId`, `orgId`, `recipientIds[]`.
5. Recipient resolution: identify who should receive each notification type based on org roles.

### Out of Scope

- Client-facing email notifications (Phase 3).
- SMS or push notifications.
- Real-time delivery via WebSocket/SSE (Phase 2).
- Notification read/unread management (future).

---

## Backend Tasks

### Step 0: Codebase Inspection

**Before writing any code for this ticket, the implementer MUST:**

1. Search for a `Notification` model in `apps/backend/core-service/prisma/schema.prisma`.
2. Search for a `NotificationService`, `NotificationsModule`, or `notification.service.ts` in `apps/backend/core-service/src/`.
3. Search for any existing EventEmitter or event bus pattern in core-service.

**Decision tree:**
- If a `Notification` model and `NotificationService` already exist → use them. Skip to Step 2.
- If an EventEmitter pattern exists without persistence → add persistence and use the EventEmitter.
- If nothing exists → implement the full path below (Steps 1 through 5).

Document the decision and the found infrastructure (or lack thereof) in the PR description.

### Step 1 (If Needed): Create Notification Schema

**File:** `apps/backend/core-service/prisma/schema.prisma`

Only add this if no `Notification` model exists:

```prisma
model Notification {
  id             String           @id @default(cuid())
  type           NotificationType
  message        String
  saleId         String?
  organizationId String
  recipientId    String           // userId who should see this notification
  isRead         Boolean          @default(false)
  data           Json?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

enum NotificationType {
  PAYMENT_FAILED
  INVOICE_OVERDUE
  SALE_STATUS_CHANGED
  CHARGEBACK_FILED
  PAYMENT_RECEIVED
}
```

Run migration:
```bash
cd apps/backend/core-service
npx prisma migrate dev --name add_notification_model
npx prisma generate
```

### Step 2: Create SalesNotificationService

**File:** `apps/backend/core-service/src/modules/sales/sales-notification.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';  // adjust path
import { EventEmitter } from 'events';
import { NotificationType } from '@prisma/client';
import { UserRole } from '@prisma/client';

interface SalesNotificationPayload {
  type: NotificationType;
  message: string;
  saleId: string;
  organizationId: string;
  recipientIds: string[];
  data?: Record<string, unknown>;
}

@Injectable()
export class SalesNotificationService {
  private readonly logger = new Logger(SalesNotificationService.name);
  private readonly eventEmitter = new EventEmitter();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dispatch a notification to multiple recipients.
   * Creates a Notification record for each recipient.
   */
  async dispatch(payload: SalesNotificationPayload): Promise<void> {
    const { type, message, saleId, organizationId, recipientIds, data } = payload;

    if (!recipientIds || recipientIds.length === 0) {
      this.logger.warn(
        `No recipients for notification type ${type} on sale ${saleId}`,
      );
      return;
    }

    // Create one Notification record per recipient
    await this.prisma.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        type,
        message,
        saleId: saleId ?? null,
        organizationId,
        recipientId,
        data: data as any ?? null,
      })),
      skipDuplicates: false,
    });

    this.logger.log(
      `Dispatched ${type} notification for sale ${saleId} to ${recipientIds.length} recipients`,
    );
  }

  /**
   * Resolve recipient user IDs for a given organization and set of target roles.
   * Returns an array of user IDs who have one of the specified roles.
   */
  async resolveRecipientsByRole(
    organizationId: string,
    roles: UserRole[],
  ): Promise<string[]> {
    // Adjust query to match the actual User/OrganizationMember model in the codebase
    // This assumes a User model with organizationId and role fields
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: { in: roles },
        deletedAt: null,
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }
}
```

**Important:** Adjust the `prisma.user.findMany()` query to match the actual User model structure in core-service. If users are linked to organizations through an `OrganizationMember` join table, use that table instead.

### Step 3: Wire Notification Dispatch into SalesService

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Inject `SalesNotificationService` into `SalesService`:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly salesNotificationService: SalesNotificationService,
  // ... other injected services ...
) {}
```

#### 3a. Payment Failure Notification

In `charge()` catch block (after logging `PAYMENT_FAILED` activity):

```typescript
const recipients = await this.salesNotificationService.resolveRecipientsByRole(
  organizationId,
  [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
);

await this.salesNotificationService.dispatch({
  type: NotificationType.PAYMENT_FAILED,
  message: `Payment of $${amount} failed for sale ${sale.id}. Reason: ${errorMessage}`,
  saleId: sale.id,
  organizationId,
  recipientIds: recipients,
  data: { amount, reason: errorMessage, saleId: sale.id },
});
```

#### 3b. Status Change Notification

In `update()` after a successful status change:

```typescript
if (newStatus !== oldStatus) {
  const recipients = await this.salesNotificationService.resolveRecipientsByRole(
    organizationId,
    [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
  );

  await this.salesNotificationService.dispatch({
    type: NotificationType.SALE_STATUS_CHANGED,
    message: `Sale ${sale.id} status changed from ${oldStatus} to ${newStatus}`,
    saleId: sale.id,
    organizationId,
    recipientIds: recipients,
    data: { from: oldStatus, to: newStatus },
  });
}
```

#### 3c. Chargeback Notification

In `chargeback()` after successfully recording the chargeback:

```typescript
const recipients = await this.salesNotificationService.resolveRecipientsByRole(
  organizationId,
  [UserRole.OWNER, UserRole.ADMIN],
);

await this.salesNotificationService.dispatch({
  type: NotificationType.CHARGEBACK_FILED,
  message: `A chargeback of $${amount} was filed against sale ${sale.id}. Immediate review required.`,
  saleId: sale.id,
  organizationId,
  recipientIds: recipients,
  data: { amount, notes, evidenceUrl },
});
```

### Step 4: Create Overdue Invoice Detection Mechanism

Overdue invoices are defined as: `Invoice.dueDate < today AND Invoice.status = 'UNPAID'`.

**Approach A (Recommended for Phase 1):** Detect overdue invoices lazily when an invoice status is read or when a sale detail is requested. Add an overdue check inside `findOne()`:

In `findOne()` within `SalesService`:

```typescript
// After loading the sale, check for newly-overdue invoices and notify
for (const invoice of sale.invoices) {
  if (
    invoice.status === InvoiceStatus.UNPAID &&
    invoice.dueDate &&
    invoice.dueDate < new Date()
  ) {
    // Update invoice status to OVERDUE
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.OVERDUE },
    });

    // Log activity
    await this.logActivity(this.prisma, sale.id, 'system', SaleActivityType.INVOICE_UPDATED, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      oldStatus: 'UNPAID',
      newStatus: 'OVERDUE',
      trigger: 'overdue_check',
    });

    // Notify
    const recipients = await this.salesNotificationService.resolveRecipientsByRole(
      sale.organizationId,
      [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
    );

    await this.salesNotificationService.dispatch({
      type: NotificationType.INVOICE_OVERDUE,
      message: `Invoice ${invoice.invoiceNumber} on sale ${sale.id} is overdue (due: ${invoice.dueDate.toISOString().split('T')[0]})`,
      saleId: sale.id,
      organizationId: sale.organizationId,
      recipientIds: recipients,
      data: { invoiceId: invoice.id, dueDate: invoice.dueDate },
    });
  }
}
```

**Approach B (More reliable but more complex):** Implement a scheduled CRON job using `@nestjs/schedule` that runs daily and scans for overdue invoices. This is cleaner for large-scale operations but requires an additional package. Phase 1 can use Approach A (lazy detection) and defer CRON to Phase 2.

Document which approach was chosen in the PR.

### Step 5: Register SalesNotificationService in SalesModule

**File:** `apps/backend/core-service/src/modules/sales/sales.module.ts`

```typescript
import { SalesNotificationService } from './sales-notification.service';

@Module({
  providers: [SalesService, SalesController, SalesNotificationService],
  exports: [SalesNotificationService],
})
export class SalesModule {}
```

### Step 6: Wire Webhook Events to Notifications

**File:** `apps/backend/core-service/src/modules/webhooks/webhooks.service.ts`

After `handlePaymentReceived()` processes a webhook payment failure event (`fraud.declined` / `payment.failed`):

```typescript
// Notify relevant staff after logging the PAYMENT_FAILED activity
const recipients = await this.salesNotificationService.resolveRecipientsByRole(
  sale.organizationId,
  [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER],
);

await this.salesNotificationService.dispatch({
  type: NotificationType.PAYMENT_FAILED,
  message: `Subscription payment failed for sale ${sale.id}`,
  saleId: sale.id,
  organizationId: sale.organizationId,
  recipientIds: recipients,
  data: { transactionId: anetTransactionId, subscriptionId },
});
```

---

## Frontend Tasks

None. Displaying in-app notifications (bell icon, notification list) is a future frontend ticket. Phase 1 only persists notification records in the database.

---

## Schema / Migration Impact

Only if `Notification` model does not already exist:

```prisma
model Notification {
  id             String           @id @default(cuid())
  type           NotificationType
  message        String
  saleId         String?
  organizationId String
  recipientId    String
  isRead         Boolean          @default(false)
  data           Json?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

enum NotificationType {
  PAYMENT_FAILED
  INVOICE_OVERDUE
  SALE_STATUS_CHANGED
  CHARGEBACK_FILED
  PAYMENT_RECEIVED
}
```

If the model/enum already exists, only add the missing `NotificationType` values.

---

## API / Contracts Affected

No new API endpoints in this ticket. Notifications are stored internally. A future `GET /notifications` endpoint will expose them to the frontend.

---

## Acceptance Criteria

1. When `charge()` fails, a `Notification` record is created for all `OWNER`, `ADMIN`, and `SALES_MANAGER` users in the organization with `type: 'PAYMENT_FAILED'`.
2. When a sale status changes via `update()`, a `Notification` record is created for all `OWNER`, `ADMIN`, and `SALES_MANAGER` users with `type: 'SALE_STATUS_CHANGED'`.
3. When `chargeback()` is called, a `Notification` record is created for all `OWNER` and `ADMIN` users with `type: 'CHARGEBACK_FILED'`.
4. When `findOne()` detects an UNPAID invoice with `dueDate < today`, the invoice status is updated to `OVERDUE` and a `Notification` record is created.
5. Overdue detection does not create duplicate notifications for the same invoice (if `findOne()` is called multiple times, the notification is only created once — because the invoice is updated to OVERDUE on first detection, and the condition `status === UNPAID` will no longer match).
6. Notifications created by the webhook handler (SM-BE-011) use `recipientId` values for OWNER and ADMIN roles in the organization.
7. If no recipients are found for a notification type (e.g., no ADMIN users exist), the dispatch logs a warning and does not throw.
8. `SalesNotificationService.dispatch()` does not throw when called with an empty `recipientIds` array — it logs a warning and returns gracefully.
9. `Notification` records include `saleId`, `organizationId`, `type`, `message`, `recipientId`, and `data` with appropriate values.

---

## Edge Cases

1. **Notification for a sale in an org with no OWNER or ADMIN users:** `resolveRecipientsByRole` returns an empty array. Dispatch logs a warning and exits. This should trigger a separate alert to platform admins (out of scope for Phase 1).
2. **Overdue check on `findOne()` adds latency:** For sales with many invoices, the overdue check adds multiple UPDATE queries. Optimize: only check invoices with `dueDate < today AND status = UNPAID` in a single query, not looping over all invoices.
3. **Payment failure notification during a webhook event:** The `WebhooksService` does not have direct access to `SalesNotificationService` unless both are in the same module or `SalesNotificationService` is exported and imported. Ensure the module registration handles this dependency.
4. **createMany with many recipients:** For large organizations with many admins, `createMany` with 50+ records is acceptable. Postgres handles this efficiently.
5. **Notification dispatch failure:** If `dispatch()` throws (e.g., DB connection error), the calling method should NOT re-throw. Wrap notification dispatch calls in try/catch and log errors. Notifications are best-effort — they must not cause the primary operation to fail.

---

## Dependencies

- **SM-BE-011** — Webhook events feed into notification dispatch.
- **SM-BE-007** — `logActivity()` is used alongside notification dispatch.
- Requires knowledge of the `User` model structure (organizationId and role fields) for `resolveRecipientsByRole`.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales-notification.service.spec.ts`

- Test `dispatch()`: verify `prisma.notification.createMany` called with correct data for each recipient.
- Test `dispatch()` with empty recipients: verify no DB call and no exception.
- Test `resolveRecipientsByRole()`: verify `prisma.user.findMany` called with correct role filter.

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `charge()` on failure: verify `salesNotificationService.dispatch` is called with `PAYMENT_FAILED`.
- Test `update()` with status change: verify `dispatch` called with `SALE_STATUS_CHANGED`.
- Test `chargeback()`: verify `dispatch` called with `CHARGEBACK_FILED`.

### Integration Tests

- Trigger a payment failure (mock gateway). Verify `Notification` records exist in DB with correct type and recipient IDs.
- Call `findOne()` on a sale with an overdue UNPAID invoice. Verify invoice status updated to OVERDUE and `Notification` record created.

### Manual QA Checks

- [ ] Trigger a payment failure. Query `SELECT * FROM "Notification" WHERE type = 'PAYMENT_FAILED' ORDER BY "createdAt" DESC LIMIT 5;` — confirm records exist for OWNER/ADMIN users.
- [ ] Update a sale status. Confirm `SALE_STATUS_CHANGED` notifications exist.
- [ ] File a chargeback. Confirm `CHARGEBACK_FILED` notifications exist for OWNER and ADMIN only.
- [ ] Create an invoice with a past `dueDate`. Call `GET /sales/:id`. Confirm invoice status is OVERDUE and notification exists.

---

## Verification Steps

- [ ] Codebase inspection completed; decision documented in PR.
- [ ] `SalesNotificationService` created (or existing service used).
- [ ] `Notification` Prisma model exists (newly created or pre-existing).
- [ ] `SalesNotificationService.dispatch()` uses `createMany` for multi-recipient delivery.
- [ ] `SalesNotificationService.resolveRecipientsByRole()` queries correct User model fields.
- [ ] Notification dispatch wired into `charge()`, `update()`, and `chargeback()`.
- [ ] Overdue invoice detection implemented in `findOne()`.
- [ ] Notification dispatch wrapped in try/catch in all call sites.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **Schema migration (if Notification model is new):** Adding a new model and enum is non-breaking. Rollback requires dropping the table and enum type.
- **Risk: Notification dispatch adds latency to charge() and update().** These DB calls are synchronous. Consider making dispatch fire-and-forget (do not await) in performance-sensitive paths. Use `this.salesNotificationService.dispatch(...).catch(err => this.logger.error(err))` to avoid blocking.
- **Risk: User model field mismatch.** The `resolveRecipientsByRole()` query assumes `user.organizationId` and `user.role` exist on a `User` model. If users are linked via a join table, the query will return no results without error. Verify schema before implementing.
