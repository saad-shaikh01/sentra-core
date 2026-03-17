• Changed files:

  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/app/app.module.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.module.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.controller.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/dto/public-invoice.dto.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/tests/public-payments.service.spec.ts

  Checklist:

  - [x] PublicPaymentsModule, PublicPaymentsController, PublicPaymentsService created
  - [x] PublicPaymentsModule registered in AppModule
  - [x] GET /public/invoice/:token is decorated with @Public()
  - [x] Returns 200 with PublicInvoiceDto for valid token
  - [x] Returns 404 for unknown token with generic Invoice not found
  - [x] Response includes invoiceNumber, amount, currency, dueDate, status, alreadyPaid, brand.name, paymentToken
  - [x] Response never includes id, saleId, clientId, organizationId, brandId
  - [x] alreadyPaid is true when status is PAID
  - [x] logoUrl is omitted as undefined when brand has no logo
  - [x] saleDescription is omitted as undefined when sale has no description
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed

  Verification:

  - npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed.
  - npx nx test core-service passed: 23 suites, 128 tests.