• Changed files: 
 
 - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/dto/public-payment.dto.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.service.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.controller.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/public-payments.module.ts
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/public-payments/tests/public-payments.service.spec.ts

  Checklist:

  - [x] POST /public/invoice/:token/pay route added to PublicPaymentsController
  - [x] Route is decorated with @Public() and @Throttle({ default: { ttl: 60000, limit: 5 } })
  - [x] AuthorizeNetModule imported into PublicPaymentsModule
  - [x] Already-paid invoice returns { success: true, alreadyPaid: true } with no gateway call
  - [x] Non-payable invoice state throws 422
  - [x] Unknown token returns 404
  - [x] On success: invoice marked PAID, PaymentTransaction created with SUCCESS, PAYMENT_RECEIVED activity logged
  - [x] On success with PENDING sale: sale updated to ACTIVE, STATUS_CHANGE activity logged
  - [x] On gateway failure: PaymentTransaction created with FAILED, PAYMENT_FAILED activity logged, retryable: true returned
  - [x] Gateway error message sanitized before returning to public
  - [x] Response never contains saleId, clientId, organizationId
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed

  Verification:

  - npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed.
  - npx nx test core-service passed: 23 suites, 134 tests.

  Notes:

  - No schema or migration change was needed for SM-BE-015.
  - Public payment activities use userId: 'system', matching the existing webhook-side pattern already present in the codebase.