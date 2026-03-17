• Changed files:

  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/schema.prisma
  - /D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/migrations/20260317210000_add_invoice_payment_token/migration.sql
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/invoices/invoices.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/invoices/invoices.controller.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/migrations/backfill-invoice-payment-tokens.ts
  - /D:/Repositories/new%20crm/sentra-core/libs/shared/types/src/lib/types.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/tests/sales.invoice-generation.spec.ts   
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.activity-logging.spec.ts 
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.discount.spec.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.role-permissions.spec.ts 
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.collision-warning.spec.ts

  Checklist:

  - [x] paymentToken String? @unique added to Invoice model in schema
  - [x] Migration applied and npx prisma generate --schema=libs/backend/prisma-client/prisma/schema.prisma succeeded
  - [x] generateInvoices() signature updated to include brandId
  - [x] getNextInvoiceNumber() uses $executeRaw for atomic upsert
  - [x] ONE_TIME invoice creation now sets a non-null 64-char hex paymentToken and INV-YYYY-NNNN invoice number
  - [x] INSTALLMENTS invoice creation gives each invoice a unique paymentToken and sequential invoice numbers
  - [x] Call site updated to pass createdSale.brandId
  - [x] POST /invoices/:id/regenerate-token exists, is restricted to OWNER and ADMIN, and returns a new paymentToken
  - [x] Backfill script created and not executed
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed
  
  Verification:
 
  - npx prisma db execute --file libs/backend/prisma-client/prisma/migrations/20260317210000_add_invoice_payment_token/migration.sql --schema=libs/backend/prisma-client/prisma/schema.prisma 
    passed
  - npx prisma migrate resolve --applied 20260317210000_add_invoice_payment_token --schema=libs/backend/prisma-client/prisma/schema.prisma passed
  - npx prisma migrate status --schema=libs/backend/prisma-client/prisma/schema.prisma reports Database schema is up to date!
  - npx nx test core-service passed: 22 suites, 121 tests
 
  Note:


  - The regenerate-token route uses the existing invoice-controller auth pattern, so it takes @CurrentUser('orgId') rather than introducing a different user decorator shape.