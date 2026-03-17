• Changed files:

  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/schema.prisma:137
  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/migrations/20260317191500_add_transaction_type_void/migration.sql:1
  - /D:/Repositories/new%20crm/sentra-core/libs/shared/types/src/lib/types.ts:131
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/app/app.module.ts:27
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/main.ts:51
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/authorize-net/authorize-net.module.ts:1
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/dto/authorize-net-webhook.dto.ts:1     
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/webhooks.service.ts:1
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/webhooks.controller.ts:1
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/webhooks.module.ts:1
  - /D:/Repositories/new%20crm/sentra-core/.env.example:1
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/__tests__/webhooks.service.spec.ts:1   
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/webhooks/__tests__/webhooks.controller.spec.ts:1

  Checklist:

  - [x] WebhooksModule, WebhooksController, WebhooksService created
  - [x] WebhooksModule registered in AppModule
  - [x] Raw body available in controller for signature verification
  - [x] verifyAuthorizeNetSignature uses crypto.timingSafeEqual
  - [x] Controller returns 200 for valid signature
  - [x] Controller returns 401 for invalid or missing signature
  - [x] processEvent errors are caught and logged, not propagated to HTTP response
  - [x] handlePaymentReceived deduplication by transactionId works
  - [x] PENDING sale advances to ACTIVE on first payment event
  - [x] Oldest UNPAID invoice updates to PAID on payment event
  - [x] PAYMENT_RECEIVED, STATUS_CHANGE, and INVOICE_UPDATED activities are logged
  - [x] AUTHORIZE_NET_SIGNATURE_KEY added to .env.example
  - [x] No JWT/AppAccess guard on webhook controller
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed

  Notes:
 
  - TransactionType.VOID was missing, so I added it in Prisma and shared types.
  - npx prisma migrate dev ... hit the repo’s existing Prisma checksum/reset issue again. I applied the additive enum migration non-destructively via:
      - prisma db execute
      - prisma migrate resolve --applied
      - prisma generate
  - npx prisma migrate status --schema=libs/backend/prisma-client/prisma/schema.prisma now reports the database schema is up to date.
  - The old Authorize.Net webhook controller is no longer registered in /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/authorize-net/authorize-net.module.ts:1, 
    so the new WebhooksModule owns /api/webhooks/authorize-net.
 
  Verification:
 
 
  - npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed.
  - npx nx test core-service passed: 20 suites, 110 tests.