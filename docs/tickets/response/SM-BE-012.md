• Changed files:

  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/schema.prisma
  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/migrations/20260317200000_add_notification_model/migration.sql
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales-notification.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.module.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/index.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/webhooks.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/webhooks.module.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/tests/sales-notification.service.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.activity-logging.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.chargeback.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.collision-warning.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.discount.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.refund.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.role-permissions.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.soft-delete.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.status-transition.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/__tests__/webhooks.service.spec.ts

  Checklist:

  - [x] Notification model + NotificationType enum added to schema
  - [x] Manual migration applied with prisma db execute, marked applied with prisma migrate resolve, and prisma generate succeeded
  - [x] SalesNotificationService created with dispatch() and resolveRecipientsByRole()
  - [x] SalesNotificationService registered in SalesModule providers and exports
  - [x] charge() failure triggers PAYMENT_FAILED notification via fire-and-forget dispatch
  - [x] update() status change triggers SALE_STATUS_CHANGED notification via fire-and-forget dispatch
  - [x] recordChargeback() triggers CHARGEBACK_FILED notification
    - [x] findOne() detects overdue UNPAID invoices, updates them to OVERDUE, logs INVOICE_UPDATED, and triggers INVOICE_OVERDUE notification
  - [x] WebhooksService payment-failure path triggers PAYMENT_FAILED notification
  - [x] All notification dispatches are wrapped in .catch() so notification failures do not fail the primary operation
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed
  - [x] npx prisma migrate status --schema=libs/backend/prisma-client/prisma/schema.prisma reports the database schema is up to date
 
  Verification:
 
  - npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed.
  - npx nx test core-service passed: 21 suites, 117 tests.
  - npx prisma migrate status --schema=libs/backend/prisma-client/prisma/schema.prisma returned Database schema is up to date!