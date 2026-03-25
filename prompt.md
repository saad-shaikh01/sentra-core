Task: Fix Invoice Visibility and Dashboard Invoice Summary Scoping

Context:
We already have role-based scope logic in the sales CRM, and `Leads` / `Sales` are mostly scoped correctly by role. But `Invoices` currently have inconsistent behavior.

Problem to fix:
Invoice visibility must never be broader than the related Sale visibility.

Current issue observed in codebase:
1. `GET /invoices` list is scoped using `scope.toInvoiceFilter()` and appears mostly correct.
2. Dashboard invoice summary in analytics is NOT scoped by user role and can show org-wide invoice data.
3. `GET /invoices/summary` is also NOT scoped by user role; it currently only uses `orgId` and optional `brandId`.
4. `GET /invoices/:id` and `GET /invoices/:id/pdf` only validate `orgId`, not the requesting user’s role-based scope.
This creates a risk where a user may not see other users’ leads/sales, but can still see invoice totals or access invoice details/PDFs that belong to other users within the same org.

Goal:
Make invoice access consistent with sale access everywhere.

Required behavior:
1. Invoice access must inherit sale scope.
2. A user must only be able to:
   - list invoices for sales they are allowed to access
   - see invoice summary for sales they are allowed to access
   - open invoice detail only if the related sale is in their scope
   - download invoice PDF only if the related sale is in their scope
   - pay invoice only if the related sale is in their scope, in addition to any existing role/payment restrictions
3. Dashboard invoice summary cards must use the same scoped invoice visibility as the invoices module.
4. Do not widen access for any role.

Expected role behavior:
- OWNER / ADMIN:
  - full org invoice access
- SALES_MANAGER:
  - invoices only for their scoped brands / teams / sales
- FRONTSELL_AGENT:
  - invoices only for sales they are allowed to access
- UPSELL_AGENT:
  - invoices only for their scoped client sales
- PROJECT_MANAGER:
  - follow existing scope rules strictly; do not assume broader invoice access unless current sale scope explicitly allows it

Implementation guidance:
1. Reuse existing scope infrastructure.
2. Prefer using `ScopeService` + `scope.toInvoiceFilter()` or sale-scope derived filtering as the single source of truth.
3. Fix these backend areas:
   - analytics summary invoice cards
   - invoices summary endpoint
   - invoice detail endpoint
   - invoice PDF endpoint
   - invoice pay endpoint if needed for scope consistency
4. If necessary, add a helper method to centralize “can current user access this invoice?” logic by checking the related sale against scope.
5. Preserve existing non-scope business rules unless they conflict with security.

Files likely involved:
- `apps/backend/core-service/src/modules/analytics/analytics.service.ts`
- `apps/backend/core-service/src/modules/invoices/invoices.controller.ts`
- `apps/backend/core-service/src/modules/invoices/invoices.service.ts`
- `apps/backend/core-service/src/modules/scope/user-scope.class.ts`
- any related tests

Testing requirements:
Add or update tests to verify:
1. Invoice list remains scoped.
2. Dashboard invoice summary is scoped by role.
3. `/invoices/summary` is scoped by role.
4. `/invoices/:id` blocks access to invoices outside user scope.
5. `/invoices/:id/pdf` blocks access to invoices outside user scope.
6. Existing allowed access still works for authorized roles.
7. No regression for OWNER / ADMIN full access.

Important constraints:
- Do not change unrelated behavior.
- Do not remove existing role restrictions already present on controller methods.
- Do not assume current behavior is correct if it conflicts with scope consistency.
- Security/correct scoping is the priority.

Deliverables:
1. Implement the fix.
2. Add/update tests.
3. Briefly summarize what was changed and any assumptions made.
