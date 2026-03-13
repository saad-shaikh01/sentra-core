# Sales Dashboard & Backend – Improvement Plan

**Scope:** `apps/frontend/sales-dashboard` + `apps/backend/core-service` (sales, invoices, analytics)
**Date:** 2026-03-13
**Status:** Planning

---

## Table of Contents

1. [Feature Review & Gap Analysis](#1-feature-review--gap-analysis)
2. [Task-Level Fixes](#2-task-level-fixes)
3. [Scalability & System Optimization](#3-scalability--system-optimization)
4. [Advanced Features & Enhancements](#4-advanced-features--enhancements)
5. [Code Refactoring & Maintainability](#5-code-refactoring--maintainability)
6. [Field-Level Optimization & Validation](#6-field-level-optimization--validation)

---

## 1. Feature Review & Gap Analysis

### 1.1 Analytics Dashboard

| Area | Current State | Expected Output | Gap |
|------|--------------|-----------------|-----|
| Revenue KPI | Sums ACTIVE + COMPLETED sales | Show total collected (paid invoices) + projected (pending) | Revenue figure includes uncollected amounts |
| Revenue Chart | 12-month columns, CSS only | Accurate monthly-collected revenue from `PaymentTransaction.SUCCESS` rows | Reads from `sale.totalAmount`, not actual payments |
| Sales by Brand | Horizontal bars, counts + revenue | Reflect current-period filter, not all-time | No date filter applied to brand chart |
| Lead Conversion | Agent table with % bar | Include dropped/archived leads in denominator | Missing leads with `deletedAt` set |
| KPI Refresh | 60 s stale time | Auto-refresh on new sale or invoice event | No WebSocket push; chart can be stale |

### 1.2 Sales List Page

| Area | Current State | Expected Output | Gap |
|------|--------------|-----------------|-----|
| Search | Filter-only (status, client, brand, date) | Full-text search by client name, invoice number, amount | No search input |
| Export | None | CSV export of current filtered view | Missing |
| Bulk Actions | None | Bulk status change, bulk delete | Missing |
| Mobile Layout | Desktop-only | Responsive table → card view on small screens | Missing |
| Sale Status Display | Badge only | Show paid invoice count / total invoices inline | Not visible without opening detail sheet |
| Empty State | Generic spinner | Contextual empty-state illustration + CTA | Incomplete |

### 1.3 Sale Form (Create/Edit)

| Area | Current State | Expected Output | Gap |
|------|--------------|-----------------|-----|
| Payment Plan field | Not visible in `sale-form-modal.tsx` | Required — ONE_TIME / INSTALLMENTS / SUBSCRIPTION | Schema has it; form missing it |
| Installment count | Not in form | Show numeric input when INSTALLMENTS selected | Conditional field missing |
| Sale Items | Not in form | Add line items (name, qty, unit price) before save | `SaleItem[]` schema exists; UI omits it |
| Currency selector | Defaults to USD only | Show currency dropdown from org settings | Hard-coded |
| Client lookup | Basic dropdown (loads all) | Paginated search-as-you-type | Loads entire client list — scales poorly |
| Brand lookup | Basic dropdown (loads all) | Filtered to brands user has access to | Same scale issue |

### 1.4 Invoice Module

| Area | Current State | Expected Output | Gap |
|------|--------------|-----------------|-----|
| Overdue detection | `status = OVERDUE` must be set manually | Auto-flag invoices past `dueDate` where status = UNPAID | No scheduled job running |
| PDF generation | `GET /invoices/:id/pdf` endpoint | Renders branded PDF via Puppeteer/PDFKit | Not confirmed working end-to-end |
| Public payment page | Client Portal only | Allow unauthenticated payment via token link | `CLIENT-FE-001` still on hold |
| Bulk send | None | Send multiple invoice emails at once | Missing |
| Invoice notes | Field exists | Render notes in PDF and detail view | Not rendered in UI |

### 1.5 Backend – Core Service

| Area | Current State | Expected Output | Gap |
|------|--------------|-----------------|-----|
| Audit trail | No audit logging on sales/invoices | Every state change logged with actor + diff | `AuditLog` table not wired to sales |
| Error responses | Some endpoints return raw Prisma errors | Uniform `{ error, message, code }` shape | Inconsistent error handling |
| Rate limiting | Only charge/subscribe endpoints | All write endpoints (min. 60 req/min) | Missing on CRUD |
| Input sanitization | Whitelist DTO validation | Strip HTML/script from string fields | No sanitizer applied |
| Transaction safety | Create sale + invoices — two DB writes | Wrap in `prisma.$transaction` | Not atomic; partial failure possible |

---

## 2. Task-Level Fixes

### SD-FIX-001 — Revenue KPI shows wrong number

**Issue:** `analytics.service.ts` aggregates `sale.totalAmount` for all ACTIVE + COMPLETED sales. This represents contracted value, not collected revenue.

**Expected Output:** "Total Revenue" KPI = sum of `PaymentTransaction.amount` where `status = SUCCESS`.

**Task Breakdown:**
1. Add `prisma.paymentTransaction.aggregate({ _sum: { amount }, where: { status: 'SUCCESS', ... } })` to `getSummary()`.
2. Return both `collectedRevenue` (actual) and `projectedRevenue` (contracted) in the API response.
3. Update `dashboard/page.tsx` KPI card to show `collectedRevenue` with a secondary `+$X projected` label.
4. Update `IAnalyticsSummary` interface in `libs/shared/types`.

**Testing:** Create a sale ($1000), charge $500, verify KPI shows $500 collected / $1000 projected.

**Estimate:** S (2–3 h)

**Dependencies:** None.

---

### SD-FIX-002 — Revenue chart uses contracted amount, not actual payments

**Issue:** `revenueByMonth` in analytics groups sales by `createdAt` month using `totalAmount`. Chart should reflect actual payments by their transaction date.

**Expected Output:** Column chart heights represent cash received in that month, not contracts signed.

**Task Breakdown:**
1. Replace `sale.findMany` loop with `paymentTransaction.groupBy({ by: ['createdAt'], _sum: { amount }, where: { status: 'SUCCESS' } })`.
2. Bucket transactions into YYYY-MM keys server-side.
3. Ensure all 12 months appear (fill missing with `0`).
4. No frontend changes needed if API shape matches existing `{ month, revenue }`.

**Testing:** Create transactions in different months; verify chart columns reflect transaction dates.

**Estimate:** S (2 h)

**Dependencies:** SD-FIX-001 (shared analytics refactor).

---

### SD-FIX-003 — Invoice overdue status never set automatically

**Issue:** Invoices past their `dueDate` remain `UNPAID` in the database. No job transitions them to `OVERDUE`.

**Expected Output:** Every night, all unpaid invoices with `dueDate < now()` are marked `OVERDUE`.

**Task Breakdown:**
1. Add `OverdueInvoiceProcessor` BullMQ processor in `core-service` (or a NestJS `@Cron`).
2. Schedule: daily at 00:05 UTC.
3. Query: `prisma.invoice.updateMany({ where: { status: 'UNPAID', dueDate: { lt: new Date() } }, data: { status: 'OVERDUE' } })`.
4. Emit audit log entry per invoice updated.
5. Optionally: push notification to sales rep (wire up later with comm-service).

**Testing:** Create invoice with `dueDate = yesterday`, trigger cron manually, verify status = OVERDUE.

**Estimate:** S (2 h)

**Dependencies:** Redis/BullMQ already installed.

---

### SD-FIX-004 — Sale creation not atomic (partial failure risk)

**Issue:** `SalesService.create()` does `prisma.sale.create()` then loops to create invoices separately. If the process crashes between the two, a sale exists without invoices.

**Expected Output:** Sale + all invoices created in a single database transaction. Either all succeed or all roll back.

**Task Breakdown:**
1. Wrap `sales.service.ts → create()` in `prisma.$transaction(async (tx) => { ... })`.
2. Replace all `prisma.*` calls inside the method with `tx.*`.
3. Verify rollback: temporarily throw after sale create, confirm no orphan sale row.

**Testing:** Mock a DB error after sale creation; confirm no sale row exists.

**Estimate:** XS (1 h)

**Dependencies:** None.

---

### SD-FIX-005 — Sale form missing Payment Plan, Installment Count, and Sale Items

**Issue:** `sale-form-modal.tsx` only captures `clientId, brandId, totalAmount, currency, description`. The backend schema supports `paymentPlan`, `installmentCount`, and `SaleItem[]`, but the form never sends them. All sales default to `ONE_TIME` with no line items.

**Expected Output:** Form includes a Payment Plan radio group, conditional installment count input, and a dynamic line-items section (add/remove rows). `totalAmount` auto-calculated from items × quantity.

**Task Breakdown:**
1. Add `paymentPlan` field (Radio: ONE_TIME / INSTALLMENTS / SUBSCRIPTION).
2. Show `installmentCount` numeric input only when INSTALLMENTS is selected (conditional render via `watch('paymentPlan')`).
3. Add a `SaleItems` sub-form: `useFieldArray` for `items[]` (name, qty, unitPrice).
4. Auto-compute `totalAmount = sum(items.unitPrice * qty)` using `watch`.
5. Update `CreateSaleDto` in the backend to make `items` optional (already exists in schema).
6. Update `useCreateSale` / `useUpdateSale` hooks to pass `items`.

**Testing:** Create sale with 3 items, 2 installments → verify 2 invoices generated with correct amounts.

**Estimate:** M (4–5 h)

**Dependencies:** None.

---

### SD-FIX-006 — Client/Brand dropdowns load entire dataset

**Issue:** `sale-form-modal.tsx` calls `useClients()` and `useBrands()` which fetch all records with no limit. As the database grows, this causes slow renders and large payloads.

**Expected Output:** Combobox with debounced search (`?search=...`), limited to 20 results at a time.

**Task Breakdown:**
1. Update `GET /clients` and `GET /brands` to accept `?search=` query param (backend: `contains` in Prisma `where`).
2. Replace `<Select>` with a `<Combobox>` component in the sale form.
3. Use `useDebounce(query, 300)` + `useQuery(['clients', query])` to fetch on keystroke.
4. Show selected item label even when search is cleared.

**Testing:** Load form with 500+ clients; confirm initial request returns ≤ 20 records.

**Estimate:** M (3–4 h)

**Dependencies:** None.

---

### SD-FIX-007 — Delete sale blocked even for soft-deletable data

**Issue:** `SalesService.remove()` throws if any invoice exists, preventing deletion of test/demo sales. There is no soft-delete, so the only path is a hard block.

**Expected Output:** Implement soft-delete on `Sale` (`deletedAt DateTime?`). Deleting a sale sets `deletedAt`; it no longer appears in list queries but history is preserved.

**Task Breakdown:**
1. Add `deletedAt DateTime?` to `Sale` prisma schema. Run migration.
2. Update `findAll` / `findOne` to filter `deletedAt: null`.
3. Change `remove()` to `prisma.sale.update({ data: { deletedAt: new Date() } })`.
4. Add admin-only `DELETE /sales/:id/hard` for permanent deletion (with confirmation).
5. Cascade soft-delete to related invoices (set `deletedAt` on child records).

**Testing:** Delete a sale with invoices; confirm it disappears from list but exists in DB with `deletedAt` set.

**Estimate:** S (2–3 h)

**Dependencies:** Migration required.

---

### SD-FIX-008 — Inconsistent API error responses

**Issue:** Some endpoints return raw Prisma exceptions (`P2025`, `P2002`) that leak internal details to the client. Frontend error handling breaks when shape differs.

**Expected Output:** All errors return `{ statusCode, error, message }` (NestJS standard). Prisma `PrismaClientKnownRequestError` mapped to HTTP codes.

**Task Breakdown:**
1. Create `PrismaExceptionFilter` in `core-service/src/common/filters/`.
2. Map: `P2025` → 404, `P2002` → 409, `P2003` → 422.
3. Register globally in `main.ts` with `app.useGlobalFilters(new PrismaExceptionFilter())`.
4. Add unit tests covering each error code mapping.

**Testing:** Attempt to create a duplicate `Invoice.invoiceNumber`; confirm response is `409 Conflict` with clean message.

**Estimate:** S (2 h)

**Dependencies:** None.

---

### SD-FIX-009 — Lead conversion rate denominator is incorrect

**Issue:** `analytics.service.ts` counts `lead.count({ where: { status: 'CONVERTED' } })` for `convertedLeads`. The denominator `totalLeads` only counts active (non-deleted) leads, making the conversion rate artificially high if leads are soft-deleted.

**Expected Output:** Conversion rate = converted / (converted + dropped + archived + active). Query must include all leads created within the period regardless of status.

**Task Breakdown:**
1. Update `getSummary()` to query `totalLeads` with `deletedAt: undefined` (include all).
2. Separate `activeLeads` (excludes deleted) from `totalLeads` (includes all, for conversion math).
3. Update the API response shape to include both `activeLeads` and `totalLeadsForConversion`.
4. Update the frontend KPI card to display the correct figure and add a tooltip explaining the denominator.

**Testing:** Create 10 leads, convert 3, soft-delete 2 others → conversion rate = 3/10 = 30%.

**Estimate:** XS (1 h)

**Dependencies:** Soft-delete must exist on Lead model.

---

### SD-FIX-010 — Charts have no date-range filter

**Issue:** The analytics dashboard shows all-time or last-12-months data with no user-controlled date range. Users cannot compare Q1 2025 vs Q1 2024.

**Expected Output:** Date-range picker at top of dashboard applies to all chart queries simultaneously.

**Task Breakdown:**
1. Add `dateFrom` / `dateTo` query params to `GET /analytics/summary`.
2. Propagate params into all sub-queries (revenue, leads, brand groupings).
3. Add a `<DateRangePicker>` component to `dashboard/page.tsx`.
4. Store selection in URL state via `nuqs` (`parseAsString` for ISO dates).
5. Pass params to `useAnalyticsSummary(params)` hook, updating React Query key.

**Testing:** Select Jan–Mar 2025; confirm chart only shows data in that window.

**Estimate:** M (3–4 h)

**Dependencies:** SD-FIX-001, SD-FIX-002.

---

## 3. Scalability & System Optimization

### SD-SCALE-001 — Analytics query N+1 and full-table scans

**Issue:** `analytics.service.ts` fetches all sales via `findMany({ include: { brand } })` then groups in JavaScript. At 10k+ sales this is a full table scan.

**Solution:**
- Replace JS grouping with `prisma.sale.groupBy({ by: ['brandId'], _sum: { totalAmount }, _count: true })`.
- Join brand name in a second targeted query (`findMany({ where: { id: { in: brandIds } } })`).
- For monthly revenue: move to `paymentTransaction.groupBy` (SD-FIX-002).
- Add composite index `(organizationId, createdAt)` on `Sale` for the date-filtered queries.

**Implementation Steps:**
1. Add migration: `@@index([organizationId, createdAt])` on `Sale`.
2. Rewrite `getRevenueByMonth()` using `groupBy`.
3. Rewrite `getSalesByBrand()` using `groupBy`.
4. Benchmark: query time should be < 50ms at 10k rows.

**Estimate:** M (4 h)

**Dependencies:** SD-FIX-001, SD-FIX-002.

---

### SD-SCALE-002 — Sales list pagination loads relations eagerly

**Issue:** `SalesService.findAll()` always includes `{ client, brand, items, invoices, transactions }`. On page 1 (20 items) this loads potentially hundreds of related rows.

**Solution:** Split into list view (lean) and detail view (full).
- List: `include: { client: { select: { id, companyName } }, brand: { select: { id, name } } }` only.
- Detail (`findOne`): full include as today.
- Add `SaleSummaryDto` for list responses.

**Estimate:** S (2 h)

---

### SD-SCALE-003 — Cache invalidation too broad

**Issue:** Any sale mutation calls `cache.delByPrefix('sales:{orgId}:')` which wipes all paginated list caches for the org. With high-frequency writes this causes cache stampedes.

**Solution:**
- Use `sales:{orgId}:list:{hash}` keys.
- On create: only delete list keys (not detail keys).
- On update/delete: delete specific detail key + list keys.
- Set a short TTL (30 s) on list caches rather than relying solely on explicit invalidation.

**Estimate:** S (2 h)

---

### SD-SCALE-004 — Invoice list has no index on `organizationId`

**Issue:** `GET /invoices` queries `invoice.findMany({ where: { sale: { organizationId } } })` — this joins through `Sale` with no direct index on `Invoice.organizationId`.

**Solution:**
- Add `organizationId` directly to the `Invoice` model (denormalize) — set via `beforeCreate` hook or on creation.
- Add index: `@@index([organizationId, status, dueDate])`.
- Update all queries to use the direct field.

**Estimate:** M (3 h, includes migration + backfill script)

**Dependencies:** Migration.

---

### SD-SCALE-005 — Frontend chart re-renders entire dashboard on any state change

**Issue:** `dashboard/page.tsx` is a single large component. Any URL state change (e.g., date-range picker) triggers a full re-render including all chart components.

**Solution:**
- Extract `<RevenueChart>`, `<BrandChart>`, `<AgentTable>` into individual components each with its own `useQuery`.
- Use `React.memo` + stable query keys to prevent unnecessary re-renders.
- Skeleton loaders per chart (not a full-page spinner).

**Estimate:** S (2–3 h)

---

### SD-SCALE-006 — Add global rate limiting to all API write endpoints

**Issue:** Only `POST /sales/:id/charge` and `POST /sales/:id/subscribe` are throttled. All other write endpoints are unprotected.

**Solution:**
- Apply NestJS `ThrottlerModule` globally: 60 requests / 60s per IP.
- Override with stricter limits on auth endpoints (5 req/15min).
- Add `X-RateLimit-Remaining` headers.

**Estimate:** XS (1 h)

---

### SD-SCALE-007 — API response compression

**Issue:** Large list responses (with `include` relations) are sent uncompressed. For slow connections this delays dashboard paint.

**Solution:**
- Enable `compression` middleware in `core-service/main.ts`.
- Configure `threshold: 1024` (only compress responses > 1KB).

**Estimate:** XS (30 min)

---

## 4. Advanced Features & Enhancements

### SD-ADV-001 — CSV Export for Sales & Invoices

**Priority:** P1

**Description:** Allow users to export the current filtered view to CSV without performance degradation.

**Expected Output:** "Export CSV" button on sales list → downloads `sales-YYYY-MM-DD.csv` with current filters applied (no pagination cap).

**Task Breakdown:**
1. Add `GET /sales/export` endpoint (same filter params as list, no `page/limit`).
2. Stream response using Node.js `Readable` + `csv-stringify` to avoid loading all rows into memory.
3. Set `Content-Type: text/csv` + `Content-Disposition: attachment` headers.
4. Frontend: `<a>` tag download via `api.exportSales(params)` that builds the query string.
5. Columns: ID, Client Name, Brand, Total Amount, Currency, Status, Payment Plan, Invoice Count, Created Date.
6. Guard: max 10,000 rows per export; return `422` if exceeded with pagination suggestion.

**Testing Requirements:**
- Export 5,000 rows; confirm file downloads without timeout.
- Verify filtered export respects all active filters.
- Confirm `422` at 10,001 rows.

**Estimate:** M (4 h)

**Dependencies:** None.

---

### SD-ADV-002 — Real-Time Dashboard Updates via WebSocket

**Priority:** P2

**Description:** Push live updates to the dashboard when a sale is created/updated or an invoice is paid — without requiring a manual refresh.

**Expected Output:** KPI cards and charts update within 2 seconds of a change made by any user in the organization.

**Task Breakdown:**
1. Add Socket.io to `core-service` (or reuse comm-service gateway pattern at port 3001).
2. Namespace: `/sales`, room: `org:{organizationId}`.
3. Emit events: `sale:created`, `sale:updated`, `invoice:paid` with minimal payload `{ orgId, saleId }`.
4. Frontend: `useSalesSocket(orgId)` hook — on event, call `queryClient.invalidateQueries(analyticsKeys.summary())`.
5. Show a pulsing green dot on the dashboard header while socket is connected.

**Testing Requirements:**
- Open two browser tabs; create a sale in tab 1; verify tab 2 KPIs update automatically.

**Estimate:** L (6–8 h)

**Dependencies:** SD-SCALE-005 (individual chart components needed for targeted invalidation).

---

### SD-ADV-003 — Advanced Multi-Parameter Search

**Priority:** P1

**Description:** Add a global search box to the sales list that matches against client name, brand name, invoice number, and sale description simultaneously.

**Expected Output:** Typing "Acme" returns all sales linked to clients or brands containing "Acme". Results appear within 300ms.

**Task Breakdown:**
1. Add `?search=` param to `GET /sales`.
2. Backend: `prisma.sale.findMany({ where: { OR: [ { client: { companyName: { contains: search, mode: 'insensitive' } } }, { brand: { name: { contains: search } } }, { description: { contains: search } }, { invoices: { some: { invoiceNumber: { contains: search } } } } ] } })`.
3. Add `@@index([description])` (for text search) or switch to Postgres `tsvector` full-text index if needed.
4. Frontend: `<Input placeholder="Search sales...">` in the filter bar, debounced 300ms, updates URL via nuqs.
5. Highlight matched text in table rows.

**Testing Requirements:**
- Search "INV-001" returns the sale with that invoice.
- Search returns results < 300ms on 5k row dataset.

**Estimate:** M (3–4 h)

**Dependencies:** SD-FIX-006 (combobox pattern reuse).

---

### SD-ADV-004 — Bulk Operations on Sales List

**Priority:** P2

**Description:** Allow ADMIN/SALES_MANAGER to select multiple sales and perform a batch action.

**Expected Output:** Checkbox column on sales table → "Bulk Actions" dropdown appears when any row is selected: Bulk Export, Bulk Delete, Bulk Status Update.

**Task Breakdown:**
1. Add `POST /sales/bulk-delete` accepting `{ ids: string[] }`. Soft-deletes each.
2. Add `POST /sales/bulk-status` accepting `{ ids: string[], status: SaleStatus }`.
3. Frontend: Add checkbox column to `<DataTable>`.
4. Track `selectedIds: Set<string>` in component state.
5. "Select All" selects current page only.
6. Render `<BulkActionsBar>` sticky at bottom when count > 0.
7. On success: invalidate list + show `"X sales updated"` toast.

**Testing Requirements:**
- Select 5 sales, change status to CANCELLED — confirm all 5 updated.
- Bulk delete 3 sales — confirm they no longer appear in list.

**Estimate:** M (4–5 h)

**Dependencies:** SD-FIX-007 (soft-delete required).

---

### SD-ADV-005 — Sale Audit Log

**Priority:** P1

**Description:** Every state change on a sale (create, update, status change, payment) is recorded with actor, timestamp, and a before/after diff.

**Expected Output:** "History" tab in `sale-detail-sheet.tsx` showing timeline of changes.

**Task Breakdown:**
1. Wire `AuditService` (already global in core-service) to `SalesService`.
2. Inject `AuditService` and call `audit.log({ entity: 'Sale', entityId, action, actorId, before, after })` on every mutation.
3. Add `GET /sales/:id/audit` endpoint returning paginated audit entries.
4. Frontend: Add "History" tab to `sale-detail-sheet.tsx` using the new endpoint.
5. Render timeline: avatar + actor name + action label + timestamp + collapsible diff.

**Testing Requirements:**
- Create sale, update amount, charge payment — history tab shows 3 entries in order.
- Verify `before/after` diff on amount change.

**Estimate:** M (4 h)

**Dependencies:** AuditModule must be globally registered (already done per memory).

---

### SD-ADV-006 — PDF Invoice Branding & Delivery

**Priority:** P1

**Description:** Invoices download as a branded PDF with the org's brand colors, logo, and client details. PDF is generated server-side and stored in S3 for re-download.

**Expected Output:** `GET /invoices/:id/pdf` returns a branded PDF in < 3 seconds. If already generated and invoice not changed, serve from S3 directly.

**Task Breakdown:**
1. Install `puppeteer` (headless Chrome) or `@pdfkit/pdfkit` in core-service.
2. Create `InvoicePdfService` that renders a Handlebars/Nunjucks HTML template with brand styles.
3. Template fields: org logo, brand colors, invoice number, due date, line items, total, payment link.
4. After first generation, upload to S3 (`invoices/{orgId}/{invoiceId}.pdf`) and store URL on `invoice.pdfUrl`.
5. On re-request: if `pdfUrl` set and invoice not `updatedAt` changed since last gen, redirect to S3 URL.
6. Cache S3 URL in Redis (1h TTL).

**Testing Requirements:**
- Generate PDF for an invoice; confirm file downloads with correct brand logo + colors.
- Request same invoice PDF twice; second request should be an S3 redirect (check response headers).

**Estimate:** L (6–8 h)

**Dependencies:** Brand must have `logoUrl` + `primaryColor` (BRAND-BE-001).

---

### SD-ADV-007 — Sales Pipeline / Deal Stages

**Priority:** P2

**Description:** Add a kanban-style pipeline view where sales move through custom stages (e.g., Prospecting → Proposal → Negotiation → Closed Won / Closed Lost).

**Expected Output:** Pipeline page at `/dashboard/pipeline` with drag-and-drop columns per stage. Sales cards show client, amount, and age.

**Task Breakdown:**
1. Schema: Add `PipelineStage` model (`id, name, order, orgId`) and `Sale.pipelineStageId`.
2. Migration + seed default stages (Prospecting, Proposal, Negotiation, Won, Lost).
3. `GET /pipeline/stages` — returns stages with paginated sale cards per stage.
4. `PATCH /sales/:id/stage` — moves a sale to a stage, emits audit log.
5. Frontend: Install `@dnd-kit/core` for drag-and-drop.
6. `PipelinePage` renders `<KanbanBoard>` with columns per stage.
7. On drop: call `useMoveStage()` mutation + optimistic update.

**Testing Requirements:**
- Drag a sale from Proposal to Negotiation; confirm `pipelineStageId` updated in DB.
- Load 50 sales across 5 stages; confirm board renders < 1 s.

**Estimate:** XL (10–12 h)

**Dependencies:** SD-FIX-007.

---

## 5. Code Refactoring & Maintainability

### SD-REF-001 — Extract analytics into dedicated `AnalyticsModule`

**Issue:** `analytics.service.ts` mixes revenue, lead, and brand queries in one monolithic method. Adding date filters and new metrics is risky.

**Solution:**
- Split into `RevenueAnalyticsService`, `LeadAnalyticsService`, `SalesAnalyticsService`.
- Each service owns its sub-queries and can be tested independently.
- `AnalyticsService.getSummary()` becomes an orchestrator that calls the three.
- Each sub-service accepts a standard `{ orgId, dateFrom, dateTo }` context object.

**Estimate:** M (3 h)

---

### SD-REF-002 — Centralize API client methods in `lib/api.ts`

**Issue:** Some fetch calls are duplicated between `use-sales.ts`, `use-invoices.ts`, and direct `fetch()` calls in page components. Any base URL change requires multiple edits.

**Solution:**
- All network calls go through `lib/api.ts` (already partially done).
- Hook files only use `api.*` methods — no raw `fetch` calls.
- Group methods by domain: `api.sales.*`, `api.invoices.*`, `api.analytics.*`.

**Estimate:** S (2 h)

---

### SD-REF-003 — Separate `SalesService` into `SalesCommandService` and `SalesQueryService` (CQRS-lite)

**Issue:** `sales.service.ts` is growing — handles CRUD, payment processing, subscription management, and caching. Difficult to unit test in isolation.

**Solution:**
- `SalesCommandService`: create, update, delete, charge, subscribe (write path).
- `SalesQueryService`: findAll, findOne (read path, owns caching logic).
- `SalesController` injects both.
- This aligns with CQRS without adding a full library.

**Estimate:** M (4 h)

**Dependencies:** None, but should be done before SD-ADV-002 (WebSocket).

---

### SD-REF-004 — Shared `PaginationHelper` already exists — enforce usage

**Issue:** Several services reimplement `skip = (page-1) * limit` inline. The `PaginationHelper` in `common/helpers/pagination.helper.ts` exists but isn't used everywhere.

**Solution:**
- Audit all `service.findAll()` methods.
- Replace inline `skip/take` math with `PaginationHelper.toSkipTake(page, limit)`.
- Enforce via ESLint rule or code review checklist.

**Estimate:** XS (1 h)

---

### SD-REF-005 — Consolidate duplicate status badge logic in frontend

**Issue:** `status-badge.tsx` has variant logic; several components also inline their own `colorMap` for statuses. Changes require edits in multiple files.

**Solution:**
- Extend `<StatusBadge>` to accept all status types (`SaleStatus`, `InvoiceStatus`, `LeadStatus`).
- Remove inline `colorMap` objects from `sale-form-modal.tsx`, `sale-detail-sheet.tsx`, `invoice-detail-sheet.tsx`.

**Estimate:** XS (1 h)

---

## 6. Field-Level Optimization & Validation

### SD-VAL-001 — `Sale.totalAmount` precision and input validation

| Field | Current | Issue | Fix |
|-------|---------|-------|-----|
| `totalAmount` | `Decimal(10,2)` | Frontend sends string; backend may lose precision | Add `@Transform(({ value }) => new Decimal(value))` in DTO |
| `totalAmount` | No min/max | Allows $0 and $99,999,999.99 silently | Add `@Min(0.01)` `@Max(9_999_999)` |
| `currency` | Free string | Any string accepted (e.g., "XYZ") | Add `@IsIn(SUPPORTED_CURRENCIES)` — define enum in shared types |
| `installmentCount` | Optional Int | Allows `0` or negative if provided | Add `@Min(2) @Max(120)` when `paymentPlan = INSTALLMENTS` |
| `description` | Optional String | No length limit | Add `@MaxLength(2000)` |

**Estimate:** XS (1 h)

---

### SD-VAL-002 — `Invoice` field hardening

| Field | Current | Issue | Fix |
|-------|---------|-------|-----|
| `invoiceNumber` | Auto-generated (likely `INV-{timestamp}`) | No visible format standard | Standardize to `{BRAND_CODE}-{YYYY}-{NNNN}` (4-digit sequence per brand per year) |
| `dueDate` | Set to +7 days | No validation if user overrides to past date | `@IsDateString()` + custom `@IsFutureDate()` decorator |
| `amount` | Decimal | No minimum | `@Min(0.01)` |
| `notes` | Optional String | Unlimited length | `@MaxLength(5000)` |

**Estimate:** XS–S (1–2 h)

---

### SD-VAL-003 — `SaleItem` validation

| Field | Current | Issue | Fix |
|-------|---------|-------|-----|
| `quantity` | Int | Allows 0 | `@Min(1)` |
| `unitPrice` | Decimal | Allows 0 and negatives | `@Min(0.01)` |
| `customPrice` | Optional Decimal | No bounds | `@Min(0)` if provided |
| `name` | String | No length limit | `@IsNotEmpty() @MaxLength(255)` |

**Estimate:** XS (30 min)

---

### SD-VAL-004 — Strip HTML from all user-supplied string fields

**Issue:** `description`, `notes`, `name` fields accept raw strings. A user could store `<script>alert(1)</script>` which would execute if rendered as `dangerouslySetInnerHTML`.

**Fix:**
1. Add `sanitize-html` or `dompurify` (server-side) to core-service.
2. Create `@SanitizeHtml()` custom class-transformer decorator.
3. Apply to: `Sale.description`, `SaleItem.name`, `SaleItem.description`, `Invoice.notes`.
4. Frontend: never use `dangerouslySetInnerHTML` for user content (audit all occurrences).

**Estimate:** S (2 h)

---

### SD-VAL-005 — `Client.email` validation and deduplication messaging

| Field | Current | Issue | Fix |
|-------|---------|-------|-----|
| `email` | `@unique([email, organizationId])` | Unique constraint exists but returns raw Prisma P2002 | Map to `409 Conflict: "A client with this email already exists"` via `PrismaExceptionFilter` (SD-FIX-008) |
| `email` | String | No format validation | `@IsEmail()` in DTO |
| `phone` | Optional String | No format | Add `@Matches(/^\+?[\d\s\-().]{7,20}$/)` |
| `companyName` | String | No length limit | `@MaxLength(200)` |

**Estimate:** XS (1 h)

**Dependencies:** SD-FIX-008.

---

## Implementation Priority Matrix

| ID | Title | Priority | Estimate | Depends On |
|----|-------|----------|----------|------------|
| SD-FIX-004 | Atomic sale creation | P0 | XS | — |
| SD-FIX-008 | Prisma exception filter | P0 | S | — |
| SD-FIX-001 | Revenue KPI accuracy | P0 | S | — |
| SD-FIX-002 | Revenue chart accuracy | P0 | S | FIX-001 |
| SD-FIX-003 | Overdue invoice cron | P0 | S | — |
| SD-FIX-005 | Sale form completeness | P1 | M | — |
| SD-FIX-006 | Client/Brand combobox | P1 | M | — |
| SD-FIX-007 | Sale soft-delete | P1 | S | migration |
| SD-FIX-009 | Lead conversion rate fix | P1 | XS | — |
| SD-FIX-010 | Dashboard date filter | P1 | M | FIX-001, FIX-002 |
| SD-SCALE-001 | Analytics N+1 fix | P1 | M | FIX-001, FIX-002 |
| SD-SCALE-002 | Lean list response | P1 | S | — |
| SD-SCALE-003 | Cache key strategy | P1 | S | — |
| SD-SCALE-004 | Invoice index | P1 | M | migration |
| SD-SCALE-005 | Chart component split | P1 | S | — |
| SD-SCALE-006 | Global rate limiting | P1 | XS | — |
| SD-SCALE-007 | Response compression | P2 | XS | — |
| SD-VAL-001..005 | All field validations | P1 | S total | FIX-008 |
| SD-REF-001..005 | Refactors | P2 | M total | — |
| SD-ADV-001 | CSV export | P1 | M | — |
| SD-ADV-003 | Advanced search | P1 | M | — |
| SD-ADV-005 | Audit log | P1 | M | — |
| SD-ADV-006 | PDF branding | P1 | L | BRAND-BE-001 |
| SD-ADV-002 | WebSocket updates | P2 | L | SCALE-005 |
| SD-ADV-004 | Bulk operations | P2 | M | FIX-007 |
| SD-ADV-007 | Pipeline / Kanban | P3 | XL | FIX-007 |

---

## Sizing Legend

| Size | Time |
|------|------|
| XS | < 1 h |
| S | 1–3 h |
| M | 3–6 h |
| L | 6–10 h |
| XL | 10+ h |
