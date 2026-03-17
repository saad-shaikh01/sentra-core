Response of SM-BE-007

• Changed files:

  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:143
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.controller.ts:127
  - /D:/Repositories/new%20crm/sentra-core/libs/shared/types/src/lib/types.ts:557
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/dto/create-sale.dto.ts:75
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/dto/update-sale.dto.ts:28
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/dto/add-note.dto.ts:1
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/dto/index.ts:6
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.activity-logging.spec.ts:1  
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.collision-warning.spec.ts:73
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.role-permissions.spec.ts:72 
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sales.status-transition.spec.ts:47
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.spec.ts:273

  Checklist:

  - [x] logActivity() private helper exists in SalesService
  - [x] create() logs CREATED activity
  - [x] create() logs INVOICE_CREATED per invoice and generateInvoices() now returns created invoices
  - [x] create() logs DISCOUNT_APPLIED when discount is set
  - [x] update() logs STATUS_CHANGE when status changes
  - [x] update() does not log STATUS_CHANGE when status is unchanged
  - [x] update() logs DISCOUNT_APPLIED when discount changes
  - [x] remove() uses logActivity() and no longer has the inline activity create
  - [x] charge() logs PAYMENT_RECEIVED on success
  - [x] charge() logs PAYMENT_FAILED on gateway failure
  - [x] subscribe() logs STATUS_CHANGE on activation
  - [x] AddNoteDto exists with @IsString, @MinLength(1), @MaxLength(2000)
  - [x] POST /sales/:id/note route exists with the requested @Roles
  - [x] addNote() service method exists and logs NOTE activity
  - [x] findOne() includes activities ordered by createdAt asc
  - [x] ISaleActivity exists in shared types
  - [x] ISale includes activities?: ISaleActivity[]
  - [x] All unit tests pass
  - [x] npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed with zero errors
  - [x] npx nx test core-service passed

  Key implementation anchors:
 
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:228 adds logActivity().
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:240 refactors generateInvoices() to return created invoice records.
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:143 logs CREATED, INVOICE_CREATED, and DISCOUNT_APPLIED during create().
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:563 logs update-side STATUS_CHANGE and discount activity.
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:621 archives via logActivity().
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:632 and /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/ 
    sales/sales.service.ts:724 add charge/subscription logging.
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:770 adds addNote().
  - /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts:508 and /D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/ 
    sales/sales.service.ts:838 include and map activities in findOne().
 
  Verification:
 
  - npx tsc --noEmit -p apps/backend/core-service/tsconfig.json passed.
  - npx nx test core-service passed: 15 suites, 72 tests.