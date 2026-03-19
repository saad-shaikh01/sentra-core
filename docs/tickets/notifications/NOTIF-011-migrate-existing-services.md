# NOTIF-011 — Migrate Existing Notification Services

## Overview
Replace the old `SalesNotificationService` (core-service) and `PmNotificationsService` (pm-service)
with the new shared `NotificationHelper`. Old dispatch logic → `notificationHelper.notify()`.

After this, both old models (`Notification`, `PmNotification`) can be safely removed.

## Prerequisites
- NOTIF-003 completed (NotificationHelper available)
- NOTIF-004 completed (new REST API live)

## Scope

**Files to modify:**
```
apps/backend/core-service/src/modules/sales/sales-notification.service.ts   ← refactor
apps/backend/pm-service/src/modules/notifications/notifications.service.ts  ← refactor
apps/backend/pm-service/src/modules/notifications/notifications.controller.ts ← update endpoints
```

**Schema migration (run after code changes work):**
```
libs/backend/prisma-client/prisma/schema.prisma  ← remove old models
```

---

## Step 1: Read Existing Code First

**CRITICAL:** Before making any changes, fully read:
1. `apps/backend/core-service/src/modules/sales/sales-notification.service.ts`
2. `apps/backend/pm-service/src/modules/notifications/notifications.service.ts`

Understand exactly what each method does, what data it creates, and who calls it.

---

## Step 2: Refactor SalesNotificationService

The existing `dispatch()` method creates `Notification` records via `prisma.notification.createMany()`.

Replace with `notificationHelper.notify()`:

```typescript
// BEFORE (in sales-notification.service.ts):
await this.prisma.notification.createMany({
  data: recipientIds.map((recipientId) => ({
    type: notificationType,
    message: message,
    saleId: saleId,
    organizationId: orgId,
    recipientId,
    data: extraData,
  })),
});

// AFTER:
await this.notificationHelper.notify({
  organizationId: orgId,
  recipientIds,
  type: this.mapToGlobalType(notificationType),  // map old enum → new enum
  module: 'SALES',
  title: this.buildTitle(notificationType),
  body: message,
  entityType: 'sale',
  entityId: saleId,
  url: `/dashboard/sales/${saleId}`,
  data: extraData,
});
```

**Type mapping** (old `NotificationType` → new `GlobalNotificationType`):
```typescript
private mapToGlobalType(old: NotificationType): string {
  const map: Record<string, string> = {
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    INVOICE_OVERDUE: 'INVOICE_OVERDUE',
    SALE_STATUS_CHANGED: 'SALE_STATUS_CHANGED',
    CHARGEBACK_FILED: 'CHARGEBACK_FILED',
    PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  };
  return map[old] ?? 'SYSTEM_ALERT';
}

private buildTitle(type: NotificationType): string {
  const titles: Record<string, string> = {
    PAYMENT_FAILED: 'Payment Failed',
    INVOICE_OVERDUE: 'Invoice Overdue',
    SALE_STATUS_CHANGED: 'Sale Status Updated',
    CHARGEBACK_FILED: 'Chargeback Filed',
    PAYMENT_RECEIVED: 'Payment Received',
  };
  return titles[type] ?? 'Notification';
}
```

**Inject NotificationHelper:**
```typescript
constructor(
  private readonly prisma: PrismaService,
  @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
) {
  this.notificationHelper = new NotificationHelper(queue);
}
```

---

## Step 3: Refactor PmNotificationsService

The existing PM service has `list()`, `markRead()`, `markAllRead()` that use `pmNotification` model.

These methods now delegate to the new `NotificationsService` in core-service via HTTP OR
the pm-service can directly use the same Prisma `globalNotification` model (since they share the same DB).

**Recommended approach:** pm-service directly queries `prisma.globalNotification` with `module: 'PM'` filter.

```typescript
// In pm-service notifications.service.ts:
// Replace: this.prisma.pmNotification.findMany(...)
// With:    this.prisma.globalNotification.findMany({ where: { ...conditions, module: 'PM' } })

async list(userId: string, orgId: string, params: QueryNotificationsDto) {
  return this.prisma.globalNotification.findMany({
    where: {
      recipientId: userId,
      organizationId: orgId,
      module: 'PM',
      ...(params.status && { isRead: params.status === 'READ' }),
    },
    orderBy: { createdAt: 'desc' },
    skip: ((params.page ?? 1) - 1) * (params.limit ?? 20),
    take: params.limit ?? 20,
  });
}
```

**IMPORTANT:** Keep the pm-service REST endpoints as-is (backward compatibility). Just update the underlying model they query.

---

## Step 4: Remove Old Models (Migration)

After verifying both services work with new model, remove old models from schema:

1. Remove `model Notification { ... }` block
2. Remove `model PmNotification { ... }` block
3. Remove `enum NotificationType { ... }` (only if not used anywhere else — check first!)
4. Run migration:
   ```bash
   cd libs/backend/prisma-client
   npx prisma migrate dev --name remove-old-notification-models
   npx prisma generate
   ```

**DO NOT remove models until you have verified:**
- [ ] No other code references `prisma.notification` (search whole codebase)
- [ ] No other code references `prisma.pmNotification` (search whole codebase)
- [ ] Both services tested and working with GlobalNotification

---

## Acceptance Criteria

- [ ] `SalesNotificationService.dispatch()` uses `notificationHelper.notify()` instead of direct Prisma write
- [ ] All 5 sales notification types mapped correctly to `GlobalNotificationType`
- [ ] Sales notifications include `entityType: 'sale'`, `entityId`, and `url`
- [ ] PM notifications service queries `globalNotification` with `module: 'PM'` filter
- [ ] PM REST endpoints (`/notifications`, `/notifications/read`, `/notifications/read-all`) still work (no breaking change)
- [ ] Old `Notification` and `PmNotification` models removed from schema
- [ ] Migration runs successfully
- [ ] `prisma.notification` no longer referenced anywhere in codebase after removal
- [ ] `prisma.pmNotification` no longer referenced anywhere in codebase after removal
- [ ] Both core-service and pm-service start and run without errors

## Failure Criteria (reject if any)

- Old models removed before verifying new code works
- PM service endpoints return 404 after migration (backward compat broken)
- Sales notification type mapping missing entries (some types become 'SYSTEM_ALERT' incorrectly)
- `NotificationHelper` not injected via BullMQ Queue (old direct Prisma write kept)
- Migration run before search confirms no remaining references to old models

## Testing

```bash
# After migration, search for any remaining references:
grep -r "prisma.notification" apps/backend/ --include="*.ts"
# Should return ZERO results

grep -r "prisma.pmNotification" apps/backend/ --include="*.ts"
# Should return ZERO results

# Trigger a sale status change → check GlobalNotification table has new row
# GET /api/notifications → should show the notification
```
