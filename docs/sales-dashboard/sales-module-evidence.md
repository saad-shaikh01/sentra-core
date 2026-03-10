# Sales Module Evidence

## SALE-001

Command:

```powershell
cd apps/backend/core-service
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|prisma' | Select-Object -First 80
```

Output:

```text
(no matching output)
```

Result:

- No backend sales-blocking TypeScript errors were reported by SALE-000.
- No backend sales-path type fixes were required.

## SALE-002

Command:

```powershell
cd apps/frontend/sales-dashboard
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|use-sales' | Select-Object -First 80
```

Output:

```text
(no matching output)
```

Result:

- No frontend sales-blocking TypeScript errors were reported by SALE-000.
- No frontend sales-path type fixes were required.

## SALE-003

Commands:

```powershell
rg -n "include" apps/backend/core-service/src/modules/sales/sales.service.ts | Select-Object -First 20

cd apps/frontend/sales-dashboard
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|types' | Select-Object -First 40

cd apps/backend/core-service
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|types' | Select-Object -First 40
```

Output:

```text
74:      include: { items: true },
187:        include: { client: true, items: true },
205:      include: { client: true, invoices: true, transactions: true, items: true },
255:      include: { client: true },
327:    // Invalidate sale detail cache since transactions are included

frontend tsc
(no matching output)

backend tsc
(no matching output)
```

Result:

- `findOne()` was verified against the backend service include shape: `client`, `invoices`, `transactions`, and `items`.
- Shared `ISaleWithRelations` now extends `ISale` instead of duplicating `ISale` fields.
- `useSale()` now returns `UseQueryResult<ISaleWithRelations>`.
- The local `SaleWithRelations` alias was removed from the sale detail sheet and replaced with the shared type.

## SALE-005

Commands:

```powershell
rg -n "cancelSubscription" apps/frontend/sales-dashboard/src/lib/api.ts
Get-Content apps/frontend/sales-dashboard/src/lib/api.ts | Select-Object -Skip 408 -First 8
```

Output:

```text
412:  async cancelSubscription(id: string) {

    return this.fetch<any>(`/sales/${id}/subscribe`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async cancelSubscription(id: string) {
    return this.fetch<any>(`/sales/${id}/cancel-subscription`, { method: 'POST' });
  }
```

Result:

- `cancelSubscription()` now uses `POST`.
- The route is now `/sales/${id}/cancel-subscription`.

## SALE-007

Commands:

```powershell
rg -n "setQueryData|useCreateSubscription|useCancelSubscription" apps/frontend/sales-dashboard/src/hooks/use-sales.ts
cd apps/frontend/sales-dashboard
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|use-sales' | Select-Object -First 40
```

Output:

```text
52:      queryClient.setQueryData(salesKeys.detail(id), data);
85:export function useCreateSubscription() {
99:export function useCancelSubscription() {

frontend tsc
(no matching output)
```

Result:

- The only remaining `setQueryData(...)` call in `use-sales.ts` is `useUpdateSale`, which is explicitly allowed.
- `useCreateSubscription()` and `useCancelSubscription()` now invalidate both the detail key and the list key instead of writing partial data into the cache.

## SALE-004

Command:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line
```

Evidence:

- `TC-5: Edit sale PATCH body excludes clientId and brandId` passed in all three SALES-011 runs below.
- The test used `page.waitForResponse(...)` and asserted that the PATCH request body omitted both `clientId` and `brandId` while still updating `totalAmount`.
- Edit mode also rendered client and brand as read-only text and the combobox count in the modal was asserted to be zero.

## SALE-006

Commands:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line

# Direct API verification after the storage URL normalization fix
# (run while core-service was serving locally)
```

Direct API verification output:

```text
UPLOAD 201 https://madcompm.b-cdn.net/sentra-assets-dev/contracts/563b877a-96b0-4f59-a149-363e24d18ee2/e6b9845d-4593-4096-b1b7-a24c4ead6356.pdf
CREATE 201 {"id":"357747eb-4c76-4292-a6ee-2e47c8c7bb32","totalAmount":12345,"status":"PENDING","currency":"USD","contractUrl":"https://madcompm.b-cdn.net/sentra-assets-dev/contracts/563b877a-96b0-4f59-a149-363e24d18ee2/e6b9845d-4593-4096-b1b7-a24c4ead6356.pdf","paymentPlan":"ONE_TIME","clientId":"9cdb8ea0-06d5-4ee0-b5c5-a983291b7111","brandId":"3fcae092-ff3b-448a-ba39-9047a8d3235b","organizationId":"563b877a-96b0-4f59-a149-363e24d18ee2","items":[{"id":"a7fff788-a4ff-445a-bdb7-e95232f4460f","name":"API Quick Sale Item","quantity":1,"unitPrice":12345,"saleId":"357747eb-4c76-4292-a6ee-2e47c8c7bb32"}],"createdAt":"2026-03-10T00:04:20.306Z","updatedAt":"2026-03-10T00:04:20.306Z"}
```

Artifacts:

- `docs/verification/sale-upload-network.png`

Result:

- The upload request now sends browser-managed multipart form data with a boundary and returns `{ url }`.
- `StorageService` now normalizes `BUNNY_CDN_HOSTNAME`, fixing the malformed `https://https://...` contract URLs that had been blocking Quick Sale creation.

## SALE-008

Command:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line
```

Evidence:

- `TC-7: Delete invoiced sale shows invoice-specific error toast` passed in all three SALES-011 runs below.
- The test asserted the specific toast text: `This sale already has invoice(s). Delete the related invoice(s) first.`
- The delete confirmation dialog copy was updated to include the invoice warning before confirmation.

## SALE-009

Command:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line
```

Artifacts:

- `docs/verification/sale-charge-gating-no-profiles.png`

Result:

- `TC-4` passed in all three SALES-011 runs below.
- The detail sheet showed the informational missing-profile message when an authorized user viewed a sale without both payment profiles.
- `Charge Now` was not rendered in that state, and the screenshot artifact captures the rendered detail sheet.

## SALE-010

Commands:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line
npx playwright test tests/sales-pm-verify.spec.ts --project=chromium --reporter=line
```

Output:

```text
Running 1 test using 1 worker
[1/1] [chromium] > tests\sales-pm-verify.spec.ts:11:5 > PROJECT_MANAGER sees create and edit but no delete or billing controls
  1 passed (1.6m)
```

Artifacts:

- `docs/verification/sale-project-manager-gating-page.png`
- `docs/verification/sale-project-manager-gating-detail.png`

Result:

- `TC-8` and `TC-9` passed in all three SALES-011 runs below, confirming that `FRONTSELL_AGENT` does not see create, edit, delete, charge, subscribe, or cancel controls.
- The additional PM verification confirmed that `PROJECT_MANAGER` sees create actions and a single row action button (edit only), while charge, subscribe, and cancel are not rendered in the detail sheet.
- The seed was updated so `hira@sentra.com` has reproducible `SALES_DASHBOARD` access in future seeded runs, and the current database was upserted with that access once for verification without reseeding.

## SALE-011

Command:

```powershell
cd apps/frontend/sales-dashboard
npx playwright test tests/sales.spec.ts --project=chromium --reporter=line
```

Run 1 output:

```text
Running 9 tests using 1 worker
[1/9] [chromium] > tests\sales.spec.ts:401:7 > Sales module e2e > TC-1: Create sale - Simple Sale happy path
[2/9] [chromium] > tests\sales.spec.ts:417:7 > Sales module e2e > TC-2: Read sale detail
[3/9] [chromium] > tests\sales.spec.ts:438:7 > Sales module e2e > TC-3: Quick Sale create with contract upload
[4/9] [chromium] > tests\sales.spec.ts:505:7 > Sales module e2e > TC-4: Delete sale succeeds and Charge Now stays hidden without payment profiles
[5/9] [chromium] > tests\sales.spec.ts:547:7 > Sales module e2e > TC-5: Edit sale PATCH body excludes clientId and brandId
[6/9] [chromium] > tests\sales.spec.ts:592:7 > Sales module e2e > TC-6: Subscribe and cancel refresh sale detail without cache corruption
[7/9] [chromium] > tests\sales.spec.ts:681:7 > Sales module e2e > TC-7: Delete invoiced sale shows invoice-specific error toast
[8/9] [chromium] > tests\sales.spec.ts:712:7 > Sales module e2e > TC-8: Permission gating - FRONTSELL_AGENT cannot see create, edit, or delete controls
[9/9] [chromium] > tests\sales.spec.ts:732:7 > Sales module e2e > TC-9: Permission gating - FRONTSELL_AGENT cannot see charge, subscribe, or cancel controls
  9 passed (3.2m)
[WebServer] NX Daemon is not running. Node process will not restart automatically after file changes.
[WebServer] Warning: Next.js inferred your workspace root, but it may not be correct.
[WebServer] Detected additional lockfiles:
[WebServer]   * C:\Users\Saad shaikh\Desktop\landing pages\sentra-core\apps\frontend\sales-dashboard\package-lock.json
```

Run 2 output:

```text
Running 9 tests using 1 worker
[1/9] [chromium] > tests\sales.spec.ts:401:7 > Sales module e2e > TC-1: Create sale - Simple Sale happy path
[2/9] [chromium] > tests\sales.spec.ts:417:7 > Sales module e2e > TC-2: Read sale detail
[3/9] [chromium] > tests\sales.spec.ts:438:7 > Sales module e2e > TC-3: Quick Sale create with contract upload
[4/9] [chromium] > tests\sales.spec.ts:505:7 > Sales module e2e > TC-4: Delete sale succeeds and Charge Now stays hidden without payment profiles
[5/9] [chromium] > tests\sales.spec.ts:547:7 > Sales module e2e > TC-5: Edit sale PATCH body excludes clientId and brandId
[6/9] [chromium] > tests\sales.spec.ts:592:7 > Sales module e2e > TC-6: Subscribe and cancel refresh sale detail without cache corruption
[7/9] [chromium] > tests\sales.spec.ts:681:7 > Sales module e2e > TC-7: Delete invoiced sale shows invoice-specific error toast
[8/9] [chromium] > tests\sales.spec.ts:712:7 > Sales module e2e > TC-8: Permission gating - FRONTSELL_AGENT cannot see create, edit, or delete controls
[9/9] [chromium] > tests\sales.spec.ts:732:7 > Sales module e2e > TC-9: Permission gating - FRONTSELL_AGENT cannot see charge, subscribe, or cancel controls
  9 passed (3.0m)
[WebServer] NX Daemon is not running. Node process will not restart automatically after file changes.
[WebServer] Warning: Next.js inferred your workspace root, but it may not be correct.
[WebServer] Detected additional lockfiles:
[WebServer]   * C:\Users\Saad shaikh\Desktop\landing pages\sentra-core\apps\frontend\sales-dashboard\package-lock.json
```

Run 3 output:

```text
Running 9 tests using 1 worker
[1/9] [chromium] > tests\sales.spec.ts:401:7 > Sales module e2e > TC-1: Create sale - Simple Sale happy path
[2/9] [chromium] > tests\sales.spec.ts:417:7 > Sales module e2e > TC-2: Read sale detail
[3/9] [chromium] > tests\sales.spec.ts:438:7 > Sales module e2e > TC-3: Quick Sale create with contract upload
[4/9] [chromium] > tests\sales.spec.ts:505:7 > Sales module e2e > TC-4: Delete sale succeeds and Charge Now stays hidden without payment profiles
[5/9] [chromium] > tests\sales.spec.ts:547:7 > Sales module e2e > TC-5: Edit sale PATCH body excludes clientId and brandId
[6/9] [chromium] > tests\sales.spec.ts:592:7 > Sales module e2e > TC-6: Subscribe and cancel refresh sale detail without cache corruption
[7/9] [chromium] > tests\sales.spec.ts:681:7 > Sales module e2e > TC-7: Delete invoiced sale shows invoice-specific error toast
[8/9] [chromium] > tests\sales.spec.ts:712:7 > Sales module e2e > TC-8: Permission gating - FRONTSELL_AGENT cannot see create, edit, or delete controls
[9/9] [chromium] > tests\sales.spec.ts:732:7 > Sales module e2e > TC-9: Permission gating - FRONTSELL_AGENT cannot see charge, subscribe, or cancel controls
  9 passed (3.2m)
[WebServer] NX Daemon is not running. Node process will not restart automatically after file changes.
[WebServer] Warning: Next.js inferred your workspace root, but it may not be correct.
[WebServer] Detected additional lockfiles:
[WebServer]   * C:\Users\Saad shaikh\Desktop\landing pages\sentra-core\apps\frontend\sales-dashboard\package-lock.json
```

Result:

- All 9 required SALES-011 test cases passed in three consecutive runs.
- `TC-3` produced `docs/verification/sale-upload-network.png`.
- `TC-4` produced `docs/verification/sale-charge-gating-no-profiles.png`.

## SALE-012

Commands:

```powershell
cd apps/backend/core-service
npx jest --testPathPattern=sales.service.spec.ts --verbose
npx jest --testPathPatterns=sales.service.spec.ts --verbose --runInBand
```

Exact plan command output:

```text
testPathPattern:

  Option "testPathPattern" was replaced by "--testPathPatterns". "--testPathPatterns" is only available as a command-line option.

  Please update your configuration.

  CLI Options Documentation:
  https://jestjs.io/docs/cli
```

Compatible command output:

```text
PASS core-service src/modules/sales/sales.service.spec.ts (26.561 s)
  SalesService
    √ TC-B1: create ONE_TIME sale generates one invoice.create call (40 ms)
    √ TC-B2: create INSTALLMENTS sale does not call invoice.create and uses createMany (10 ms)
    √ TC-B3: create SUBSCRIPTION sale does not generate upfront invoices (8 ms)
    √ TC-B4: remove rejects deletion when invoices exist (37 ms)
    √ TC-B5: remove deletes sale when invoice count is zero (9 ms)
    √ TC-B6: UpdateSaleDto rejects clientId and brandId via class-validator validate() (12 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        27.276 s
Ran all test suites matching sales.service.spec.ts.
```

Result:

- The installed Jest version rejects the deprecated `--testPathPattern` flag from the plan.
- The compatible Jest 30 command passed all 6 required backend integration tests.

## Final TypeScript Check

Commands:

```powershell
cd apps/frontend/sales-dashboard
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|use-sales' | Select-Object -First 80

cd apps/backend/core-service
npx tsc --noEmit *>&1 | Select-String -Pattern 'sales|prisma' | Select-Object -First 80
```

Output:

```text
frontend
(no matching output)

backend
(no matching output)
```

Result:

- The final sales-path TypeScript checks remained clean after the Playwright config fix, the storage URL normalization fix, and the PM-access seed update.
