# Sales Dashboard – Comprehensive Improvement Plan

**Scope:** Full Sales Dashboard — Leads · Clients · Brands · Invoices · Emails · KPIs · Teams
**Date:** 2026-03-13
**Status:** Planning — Standalone Reference Document

---

## Table of Contents

1. [System Overview & Current State](#1-system-overview--current-state)
2. [Lead Management — Fixes & Automation](#2-lead-management--fixes--automation)
3. [Bulk Lead Import & External Source Integration](#3-bulk-lead-import--external-source-integration)
4. [Lead-to-Client Conversion Flow](#4-lead-to-client-conversion-flow)
5. [Client Management — Fixes & Improvements](#5-client-management--fixes--improvements)
6. [Brand Management — Fixes & Improvements](#6-brand-management--fixes--improvements)
7. [Invoice Management — Fixes & Improvements](#7-invoice-management--fixes--improvements)
8. [Email Integration with Leads & Clients](#8-email-integration-with-leads--clients)
9. [KPIs & Analytics Dashboard](#9-kpis--analytics-dashboard)
10. [Team-Wise Workflows & Performance Tracking](#10-team-wise-workflows--performance-tracking)
11. [Missing Workflow Integrations](#11-missing-workflow-integrations)
12. [Implementation Priority Matrix](#12-implementation-priority-matrix)

---

## 1. System Overview & Current State

### Architecture Summary

```
sales-dashboard (Next.js)
        │
        ▼
core-service (NestJS, port 3001)        comm-service (NestJS, port 3002)
    ├── Leads                               ├── Gmail OAuth
    ├── Clients                             ├── Thread Archive (MongoDB)
    ├── Brands                              ├── Entity Linking
    ├── Sales                               └── WebSocket /comm
    ├── Invoices
    ├── Analytics
    └── Teams / Users
        │
        ▼
    PostgreSQL (Prisma)   Redis (Cache + BullMQ)   AWS S3 (Files)
```

### What Is Built (Working)

| Module | Status | Notes |
|--------|--------|-------|
| Leads CRUD | ✅ Complete | Status FSM, activity log, role-scoped visibility |
| Lead Kanban / Table view | ✅ Complete | Dual view, filter bar |
| Lead Capture (web form) | ✅ Partial | Single lead, rate-limited public endpoint |
| Lead → Client conversion | ✅ Partial | Transactional DB write; UI partially exposed |
| Clients CRUD | ✅ Complete | Email unique per org, search |
| Brands CRUD | ✅ Complete | Multi-brand, asset upload, public portal lookup |
| Sales CRUD | ✅ Complete | Payment plans, Authorize.net, auto-invoices |
| Invoices CRUD | ✅ Complete | Auto-generation, PDF, payment |
| Email threads (Gmail) | ✅ Complete | OAuth, thread view, entity link in lead sheet |
| Teams & Roles | ✅ Complete | Hierarchy, visibility scoping |
| Analytics summary | ⚠️ Partial | API exists; incorrect revenue figure; no filters |
| Bulk lead import | ❌ Missing | — |
| Facebook / external leads | ❌ Missing | — |
| Automated lead assignment | ❌ Missing | Manual only |
| Lead scoring | ❌ Missing | — |
| Follow-up reminders | ❌ Missing | Field exists, no notification |
| Invoice overdue auto-flag | ❌ Missing | Manual only |
| Team KPI dashboard | ❌ Missing | — |
| Email automation / sequences | ❌ Missing | — |

---

## 2. Lead Management — Fixes & Automation

### 2.1 Current Lead Flow (What Exists)

```
Web Form / Manual Entry
        │
  POST /leads/capture (public) or POST /leads (authenticated)
        │
  Lead created (status = NEW)
        │
  Manual assignment by SALES_MANAGER or ADMIN → PATCH /leads/:id/assign
        │
  Status transitions (FSM):
  NEW → CONTACTED → PROPOSAL → FOLLOW_UP → CLOSED
        │
  On CLOSED + Convert → POST /leads/:id/convert
        │
  Client record created automatically
```

### 2.2 Broken / Incomplete in Lead Flow

---

#### LEAD-FIX-001 — Lead status transition "CLOSED" is ambiguous

**Issue:** The status `CLOSED` combines "won" and "lost" deals into one state. There is no way to distinguish a successfully converted lead from a dropped one in analytics.

**Expected Output:** Two terminal states — `CLOSED_WON` and `CLOSED_LOST`. The conversion action only works from `CLOSED_WON`. `CLOSED_LOST` requires an optional `lostReason` field.

**Steps to Fix:**
1. Add `CLOSED_WON` and `CLOSED_LOST` to the `LeadStatus` enum in Prisma schema.
2. Keep `CLOSED` temporarily as an alias during migration; backfill existing `CLOSED` leads that have `convertedClientId` → `CLOSED_WON`, the rest → `CLOSED_LOST`.
3. Update `LEAD_STATUS_TRANSITIONS` map to route from `PROPOSAL` / `FOLLOW_UP` to both new states.
4. Add `lostReason String?` field to `Lead` schema.
5. Update `change-status.dto.ts` to require `lostReason` when new status is `CLOSED_LOST`.
6. Update Kanban board: add two separate columns for `CLOSED_WON` and `CLOSED_LOST`.
7. Update analytics to use `CLOSED_WON` as the "converted" signal when `convertedClientId` is null but the deal was manually won.

**Testing Requirements:**
- Move a lead to `CLOSED_LOST` without a `lostReason` — expect `400 Bad Request`.
- Move a lead to `CLOSED_WON` — confirm conversion button is now active.
- Analytics conversion rate uses `CLOSED_WON` count only.

**Estimate:** M (4–5 h)
**Dependencies:** DB migration required.

---

#### LEAD-FIX-002 — No follow-up reminder notification

**Issue:** When a lead is moved to `FOLLOW_UP` status and a `followUpDate` is set, nothing happens on that date. The agent must check manually.

**Expected Output:** At the `followUpDate` time (or 8:00 AM org timezone if only a date), a notification is delivered to the assigned agent reminding them to follow up.

**Steps to Fix:**
1. Add a BullMQ delayed job `FollowUpReminderJob` scheduled for each lead's `followUpDate` when status changes to `FOLLOW_UP`.
2. Job payload: `{ leadId, assignedToId, orgId }`.
3. Job processor: look up lead, confirm it is still in `FOLLOW_UP` status (guard against already-contacted), then emit a notification event.
4. Notification channels (Phase 1): in-app notification model (`Notification` table with `userId, type, payload, readAt`). Phase 2: email via comm-service.
5. If `followUpDate` is updated, cancel the previous job and schedule a new one.
6. Frontend: notification bell icon in top nav, polling or WebSocket for unread count.

**Testing Requirements:**
- Set `followUpDate` to `+2 minutes`, confirm job fires and notification appears.
- Change `followUpDate` to tomorrow, confirm old job is cancelled.
- Confirm no job fires if lead status changed away from `FOLLOW_UP` before the date.

**Estimate:** M (5–6 h)
**Dependencies:** BullMQ already installed. Notification model must be added.

---

#### LEAD-FIX-003 — Lead activity log is not visible on the frontend

**Issue:** `GET /leads/:id/activities` endpoint exists and returns a rich history, but the `lead-detail-sheet.tsx` does not render this data. All activity (status changes, notes, assignments) is invisible to the user.

**Expected Output:** "Activity" tab in the lead detail sheet showing a timeline: each event with actor avatar, action description, and timestamp. Notes should be editable/deletable by the author.

**Steps to Fix:**
1. Add `useLeadActivities(leadId)` hook in `use-leads.ts` (calls `GET /leads/:id/activities`).
2. Add "Activity" tab to `lead-detail-sheet.tsx` (alongside Emails tab).
3. Render a vertical timeline list: icon per activity type, actor name, relative time (`2 hours ago`).
4. "Add Note" button opens an inline text area that calls `POST /leads/:id/notes`.
5. Status change entries display `from → to` transition.

**Testing Requirements:**
- Create lead, change status twice, add a note, reassign — Activity tab shows 4 entries in order.
- Add note and confirm it appears immediately (optimistic update).

**Estimate:** M (3–4 h)
**Dependencies:** None (API already exists).

---

#### LEAD-FIX-004 — Lead assignment has no automated rules

**Issue:** Leads can only be manually assigned. When a lead comes in via the capture endpoint, it stays unassigned unless a manager manually acts on it.

**Expected Output:** An assignment rule engine where admins define conditions (e.g., "leads from Brand X → assign to Team A using round-robin"). New leads matching a rule are auto-assigned within seconds.

**Steps to Fix:**
1. Add `LeadAssignmentRule` model to Prisma schema:
   ```
   { id, orgId, brandId?, source?, priority, assignmentType (ROUND_ROBIN, SPECIFIC_USER, TEAM), targetUserId?, targetTeamId?, isActive }
   ```
2. `POST /leads/assignment-rules` — CRUD for rules (ADMIN only).
3. In `LeadsService.create()` and the capture endpoint: after lead is created, call `AssignmentRulesService.applyRules(lead)` which finds matching rules and assigns.
4. Round-robin: track `lastAssignedIndex` per rule in Redis.
5. Frontend: `/settings/lead-assignment` page with a rules list and a form to add rules.
6. Activity log entry created for auto-assignment: `"Auto-assigned to [User] by assignment rule"`.

**Testing Requirements:**
- Create a rule: Brand X → round-robin across 3 agents.
- Submit 6 leads via capture endpoint with Brand X — confirm each of the 3 agents gets 2 leads.
- Disable the rule — confirm subsequent leads stay unassigned.

**Estimate:** L (7–8 h)
**Dependencies:** None.

---

#### LEAD-FIX-005 — No duplicate lead detection

**Issue:** If the same person submits a form twice or is imported twice, duplicate lead records are created with no warning.

**Expected Output:** On lead creation (both manual and capture), check for an existing lead with the same `email` + `organizationId` (or `phone` if email is absent). If a match is found, return a `409` with the existing lead ID and a message allowing the user to merge or update instead.

**Steps to Fix:**
1. In `LeadsService.create()` and `capturePublic()`: query for existing lead with same email (and `deletedAt: null`).
2. If found: return `409 Conflict: { message: 'Lead already exists', existingLeadId }`.
3. Add optional `?allowDuplicate=true` query param to bypass the check for intentional duplicates.
4. Frontend: on `409`, show a modal — "A lead with this email already exists. View existing lead or create anyway?"

**Testing Requirements:**
- Submit two leads with the same email — second returns `409` with existing ID.
- Use `?allowDuplicate=true` — second lead is created without error.

**Estimate:** S (2 h)
**Dependencies:** None.

---

### 2.3 Automated Lead Workflow (Full Flow Definition)

Once all fixes above are applied, the complete automated lead lifecycle is:

```
STEP 1 — CAPTURE
  ├── Web form → POST /leads/capture (public, throttled)
  ├── Manual entry → POST /leads (authenticated, any sales role)
  ├── Bulk CSV import → POST /leads/import (new, see Section 3)
  └── Facebook Lead Ads webhook → POST /webhooks/facebook-leads (new, see Section 3)
              │
              ▼
STEP 2 — DEDUPLICATION (new)
  If email match found → 409; frontend prompts merge or skip
              │
              ▼
STEP 3 — AUTO-ASSIGNMENT (new)
  AssignmentRulesService.applyRules(lead)
  → Match brand, source, etc. → round-robin or specific user
  → LeadActivity: "Auto-assigned by rule"
              │
              ▼
STEP 4 — NOTIFICATION (new)
  Assigned agent receives in-app notification + (Phase 2) email
              │
              ▼
STEP 5 — AGENT WORKS THE LEAD
  Status transitions: NEW → CONTACTED → PROPOSAL → FOLLOW_UP → CLOSED_WON / CLOSED_LOST
  Notes, emails, calls logged as activities
  followUpDate triggers reminder job (LEAD-FIX-002)
              │
              ▼
STEP 6 — CONVERSION (CLOSED_WON only)
  POST /leads/:id/convert → Client created automatically
  (see Section 4 for full conversion flow)
```

---

## 3. Bulk Lead Import & External Source Integration

### 3.1 Bulk CSV Import

#### LEAD-IMPORT-001 — Bulk CSV/Excel Lead Import Endpoint

**Issue:** There is no way to import multiple leads at once. A sales team switching from another CRM or receiving a lead list from a partner has to add leads one by one.

**Expected Output:** Upload a CSV/Excel file of up to 1,000 leads. The system validates each row, skips duplicates (or flags them), creates valid leads, and returns a summary report.

**Steps to Fix:**

**Backend:**
1. Add `POST /leads/import` endpoint (ADMIN and SALES_MANAGER only).
2. Accept `multipart/form-data` with a `file` field (CSV or XLSX, max 5MB) and `brandId`, `source`.
3. Parse file using `csv-parse` (CSV) or `xlsx` (Excel).
4. Expected columns: `name`, `email`, `phone`, `title`, `website`, `notes` (extra columns go into `data` JSON).
5. Validate each row with class-validator DTO.
6. Run deduplication check per row (by email).
7. Batch insert valid rows using `prisma.lead.createMany`.
8. Return import summary:
   ```json
   {
     "total": 120,
     "created": 105,
     "duplicates": 10,
     "errors": 5,
     "errorDetails": [
       { "row": 3, "reason": "Invalid email format" }
     ]
   }
   ```
9. After import: trigger assignment rules for all newly created leads asynchronously (BullMQ job).
10. Create a single `LeadActivity` entry per lead: `type: CREATED, data: { source: 'bulk-import', fileName }`.

**Frontend:**
1. Add "Import Leads" button on the leads list page header.
2. Open a modal: drag-and-drop file zone + brand selector + source label.
3. On submit: show a progress indicator.
4. On complete: show the import summary table (created / duplicates / errors with row details).
5. Provide a CSV template download link.

**Testing Requirements:**
- Upload a 100-row CSV: confirm 100 leads created (or duplicates handled).
- Include a row with invalid email: confirm it appears in `errorDetails`.
- Upload duplicate email: confirm `duplicates` count increments, no new record created.
- Confirm all new leads are auto-assigned if a matching rule exists.

**Estimate:** L (7–8 h)
**Dependencies:** LEAD-FIX-004 (assignment rules), LEAD-FIX-005 (deduplication).

---

### 3.2 Facebook Lead Ads Integration

#### LEAD-IMPORT-002 — Facebook Lead Ads Webhook Receiver

**Issue:** Many marketing teams use Facebook Lead Ads to capture prospects. Currently there is no way to bring these leads into the dashboard automatically — someone has to download them from Facebook and re-import manually.

**Expected Output:** When a Facebook Lead Ad form is submitted, the lead appears in the dashboard within 60 seconds, auto-assigned based on brand rules.

**Steps to Fix:**

**Backend:**
1. Add `FacebookIntegration` model to Prisma:
   ```
   { id, orgId, brandId, pageId, formId, accessToken (encrypted), isActive, createdAt }
   ```
2. Add webhook endpoint: `POST /webhooks/facebook-leads` (public, no auth).
   - Facebook sends a `GET` first for verification (respond with `hub.challenge`).
   - `POST` delivers lead payload: `{ leadgen_id, page_id, form_id, created_time }`.
3. On `POST`: look up `FacebookIntegration` by `pageId + formId`, fetch full lead data from Facebook Graph API using `GET /{leadgen_id}?access_token=...`.
4. Map Facebook fields to `CreateLeadDto`: `{ name, email, phone, source: 'FACEBOOK_ADS', brandId, data: { rawFacebookPayload } }`.
5. Call `LeadsService.captureInternal(dto)` (same as capture but bypasses throttle).
6. Add `POST /integrations/facebook` — ADMIN endpoint to register a Facebook page + form + access token.
7. Add `GET /integrations/facebook` — list active integrations.
8. Encrypt access tokens with AES-256-GCM (same pattern as comm-service).

**Frontend:**
1. New settings page: `/settings/integrations/facebook`.
2. Form: Page ID, Form ID, Access Token (masked after save), Brand assignment.
3. Integration list showing active connections with enable/disable toggle.
4. Test button: sends a test event to verify the webhook is reachable.

**Testing Requirements:**
- Register a Facebook integration, simulate a webhook POST with a test lead payload — confirm lead appears in dashboard.
- Disable the integration — confirm subsequent webhooks are ignored.
- Confirm access token is stored encrypted (verify raw DB value is not plaintext).

**Estimate:** L (8–10 h)
**Dependencies:** LEAD-FIX-004 (assignment rules), LEAD-FIX-005 (dedup).

---

### 3.3 Generic Webhook / Zapier Integration

#### LEAD-IMPORT-003 — Generic Inbound Webhook for External Lead Sources

**Issue:** No standard integration point for other tools (LinkedIn, website forms, Typeform, Zapier, Make.com).

**Expected Output:** Each organization gets a unique webhook URL. Any tool that sends a `POST` to that URL with a lead payload can create a lead in the dashboard.

**Steps to Fix:**
1. Add `WebhookEndpoint` model: `{ id, orgId, brandId, secret (32-byte random), isActive, label }`.
2. `POST /webhooks/inbound/:webhookId` — public endpoint, validates HMAC signature using secret.
3. Map payload fields: `name, email, phone, source` (extra fields → `data` JSON).
4. Frontend: `/settings/integrations/webhooks` — generate webhook URL, show secret, test button.

**Estimate:** M (4–5 h)
**Dependencies:** None.

---

## 4. Lead-to-Client Conversion Flow

### 4.1 Current Conversion (What Works)

```
POST /leads/:id/convert  { brandId, companyName, email?, contactName?, phone? }
    │
    ├── Validates lead status is not already converted
    ├── prisma.$transaction:
    │   ├── prisma.client.create({ email, companyName, password: hashed, brandId, orgId })
    │   └── prisma.lead.update({ convertedClientId: newClient.id })
    └── Returns { client, lead }
```

### 4.2 Conversion Flow Gaps

#### LEAD-CONV-001 — Conversion form is incomplete in the UI

**Issue:** `convert-lead-modal.tsx` exists but does not pass all required fields visible in `convert-lead.dto.ts`. Some fields are silently dropped.

**Expected Output:** Modal collects: `companyName` (pre-filled from lead name), `email` (pre-filled from lead email), `contactName`, `phone`, `brandId` (pre-selected if lead has brand), `address`, `notes`. All fields passed to API.

**Steps to Fix:**
1. Read `convert-lead.dto.ts` fully and map every field to a form input.
2. Pre-populate `email`, `phone`, `contactName` from the lead record.
3. Show `brandId` selector (read-only if lead already has brand, editable otherwise).
4. After successful conversion, redirect to the new client detail page.

**Estimate:** S (2–3 h)
**Dependencies:** None.

---

#### LEAD-CONV-002 — No automatic sale creation prompt after conversion

**Issue:** After a lead is converted to a client, the user has to manually go to the Sales page and create a sale. There is no guided flow from "new client" to "first sale".

**Expected Output:** After conversion, a modal asks: "Create a sale for [Client Name]?" with a pre-filled sale form (client already selected). User can skip or complete immediately.

**Steps to Fix:**
1. After `useConvertLead().mutate()` succeeds, check response for the new `clientId`.
2. Open `sale-form-modal.tsx` with `clientId` pre-populated and the modal prefaced with a "Great — now create their first sale" header.
3. Add a "Skip for now" option that just closes the modal.
4. Track the conversion funnel: log in analytics how many conversions result in a same-session sale.

**Estimate:** S (2 h)
**Dependencies:** LEAD-CONV-001.

---

#### LEAD-CONV-003 — Converted lead does not receive a welcome email

**Issue:** When a lead becomes a client, they should receive a welcome email with their portal login credentials. Currently nothing is sent.

**Expected Output:** On successful conversion, an email is sent to the client's email address with: brand logo, welcome message, portal link (`https://{brand.domain}/login`), and their temporary password.

**Steps to Fix:**
1. After `prisma.$transaction` in `leads.service.ts → convert()`, call `CommService.sendTransactionalEmail({ to, subject, brandId, templateName: 'client-welcome', data: { name, portalUrl, tempPassword } })`.
2. Generate a random temp password (or use the hashed one). Force password reset on first login.
3. Add `mustChangePassword Boolean @default(false)` to `Client` model.
4. Email template: Handlebars/MJML HTML with brand colors + logo.
5. Frontend: show "Welcome email sent to [email]" in the success toast after conversion.

**Estimate:** M (4 h)
**Dependencies:** comm-service email sending capability, brand `logoUrl` + `primaryColor`.

---

## 5. Client Management — Fixes & Improvements

### 5.1 Issues Found

#### CLIENT-FIX-001 — No dedicated client page in the frontend

**Issue:** There is no `/dashboard/clients` page visible. Client management appears to be accessible only through lead conversion or the sale form. There is no way to browse, search, or manage clients directly.

**Expected Output:** A full `/dashboard/clients` page with a DataTable: client name, email, brand, number of active sales, total revenue, last activity date. Clicking a row opens a detail sheet with tabs: Info | Sales | Invoices | Emails.

**Steps to Fix:**
1. Create `/app/dashboard/clients/page.tsx` — fetch from `GET /clients` with pagination + search.
2. Create `client-detail-sheet.tsx` with 4 tabs.
3. "Sales" tab: list of linked sales using `useSales({ clientId })`.
4. "Invoices" tab: list of invoices grouped by sale using `useInvoices({ clientId })`.
5. "Emails" tab: reuse `EntityEmailTimeline` component (set `entityType: 'CLIENT', entityId`).
6. Sidebar: add "Clients" nav item.

**Estimate:** M (5 h)
**Dependencies:** None (all APIs exist).

---

#### CLIENT-FIX-002 — Client delete is hard-blocked by sales

**Issue:** `ClientsService.remove()` throws `400 Bad Request: Client has active sales` when any sale exists. This prevents cleanup of test clients or consolidation of duplicates.

**Expected Output:** Soft-delete clients (same as LEAD-FIX-007 pattern). Add `deletedAt` to `Client`. Hard delete available to ADMIN only after explicitly confirming.

**Steps to Fix:**
1. Add `deletedAt DateTime?` to `Client` Prisma schema. Run migration.
2. Update `remove()` to set `deletedAt` (soft delete).
3. Filter `deletedAt: null` in all `findAll`/`findOne` queries.
4. Add `DELETE /clients/:id/hard` for ADMIN-only permanent deletion (additional confirmation required).

**Estimate:** S (2 h)
**Dependencies:** Migration.

---

#### CLIENT-FIX-003 — No client-level revenue summary

**Issue:** To see how much revenue a client has generated, a user must mentally sum all their sales. No aggregated figure is shown anywhere.

**Expected Output:** Client card/row shows total paid revenue and count of active sales inline.

**Steps to Fix:**
1. In `ClientsService.findAll()`, add `_count: { select: { sales: true } }` and a sub-aggregation for revenue.
2. Alternatively: add a computed column via Prisma `$queryRaw` for performance.
3. Display in the client list table: "3 sales · $12,400".

**Estimate:** S (2 h)
**Dependencies:** CLIENT-FIX-001.

---

## 6. Brand Management — Fixes & Improvements

#### BRAND-FIX-001 — No brand-level analytics

**Issue:** The analytics dashboard shows `salesByBrand` globally. There is no way to drill into a single brand and see its leads, sales, invoices, and team performance.

**Expected Output:** Brand detail page (in settings or a dedicated `/dashboard/brands/:id` view) with mini KPIs: leads this month, clients, revenue, conversion rate.

**Steps to Fix:**
1. Add `GET /analytics/brands/:id/summary` endpoint — same shape as the main summary but scoped to one brand.
2. Frontend: Brand detail sheet gains an "Analytics" tab showing a compact version of the KPI cards.

**Estimate:** M (3–4 h)
**Dependencies:** Analytics refactor (SD-SCALE-001 from the first plan).

---

#### BRAND-FIX-002 — No email alias → lead/client routing

**Issue:** `EmailAlias` model exists and is linked to brands. But there is no logic that auto-links incoming emails to the correct brand's leads. If an email arrives at `sales@brand-x.com`, there is no automatic connection to Brand X's lead pool.

**Expected Output:** When a Gmail identity (email alias) receives an email from an address matching an existing lead's email, the thread is auto-linked to that lead and appears in the lead's Email tab.

**Steps to Fix:**
1. In comm-service `SyncProcessor`: after fetching new messages, extract sender email.
2. Query core-service internal API: `GET /internal/leads?email={sender}&orgId={orgId}`.
3. If a lead is found and thread not yet linked, call `entity-links` service to auto-link.
4. Only auto-link if confidence is high (exact email match). Otherwise surface as "Suggested link" in the UI.

**Estimate:** M (4 h)
**Dependencies:** Requires internal HTTP client between comm-service and core-service (pattern already exists: `InternalContactsClient`).

---

## 7. Invoice Management — Fixes & Improvements

#### INV-FIX-001 — Invoice overdue status never automatically set

**Issue:** Invoices past their `dueDate` stay `UNPAID` indefinitely. No scheduled job exists to flag them.

**Expected Output:** Every night at 00:05 UTC, all `UNPAID` invoices with `dueDate < now()` are marked `OVERDUE`.

**Steps to Fix:**
1. Add `@Cron('5 0 * * *')` in `InvoicesService` (or a dedicated `InvoiceSchedulerService`).
2. `prisma.invoice.updateMany({ where: { status: 'UNPAID', dueDate: { lt: new Date() } }, data: { status: 'OVERDUE' } })`.
3. After update, emit in-app notifications to each sale's owning agent.
4. Frontend: overdue invoices highlighted in red in the invoice list.

**Estimate:** S (2 h)
**Dependencies:** Notification model (see LEAD-FIX-002).

---

#### INV-FIX-002 — Invoice number collisions at high throughput

**Issue:** Invoice number is generated as `INV-${Date.now()}-${index}`. Two simultaneous requests could produce the same millisecond timestamp, causing a `P2002` unique constraint error.

**Expected Output:** Invoice numbers use a sequential per-org counter: `{BRAND_CODE}-{YYYY}-{0001}`, guaranteed unique.

**Steps to Fix:**
1. Add `InvoiceSequence` model: `{ orgId, brandId, year, lastSeq }` with unique index on `(orgId, brandId, year)`.
2. In `InvoicesService`, use an atomic `UPDATE ... SET lastSeq = lastSeq + 1 RETURNING lastSeq` via `$executeRaw` inside the invoice transaction.
3. Format: `${brand.code}-${year}-${padStart(lastSeq, 4, '0')}`.
4. Migrate existing invoices to the new sequence (backfill `lastSeq` based on count per brand per year).

**Estimate:** M (3 h)
**Dependencies:** Migration.

---

#### INV-FIX-003 — Invoice PDF template is not branded

**Issue:** `InvoicePdfService` exists but it is unclear whether it uses brand colors and logos. The PDF should be fully branded per the sale's associated brand.

**Expected Output:** Each PDF invoice renders with the brand's `logoUrl`, `primaryColor`, and `secondaryColor`. The company name, address, and payment portal URL reflect the correct brand.

**Steps to Fix:**
1. In `InvoicePdfService`, load the sale's brand via `prisma.brand.findUnique({ where: { id: invoice.sale.brandId } })`.
2. Embed brand logo as a base64 image in the HTML template.
3. Apply `primaryColor` to headings and the payment button.
4. Include: brand name, brand domain, invoice number, line items table, subtotal, due date, pay-online link.
5. After PDF generation, upload to S3: `invoices/{orgId}/{invoiceId}.pdf`.
6. Set `invoice.pdfUrl` so subsequent requests serve the S3 file directly.

**Estimate:** M (4–5 h)
**Dependencies:** Brand `logoUrl` and `primaryColor` must be set.

---

#### INV-FIX-004 — No bulk invoice export / send

**Issue:** Users must download or email invoices one at a time. Finance teams regularly need to send multiple invoices at once.

**Expected Output:**
- Checkbox selection on invoice list → "Send Selected" → emails each selected invoice PDF to the corresponding client.
- "Export All" → downloads a ZIP of all PDFs matching current filters.

**Steps to Fix:**
1. Add `POST /invoices/bulk-send` accepting `{ ids: string[] }` — generates PDFs for each and sends via comm-service.
2. Add `GET /invoices/export/zip` — streams a ZIP using `archiver` npm package.
3. Frontend: checkbox column + bulk actions bar (same pattern as SD-ADV-004).

**Estimate:** L (6–7 h)
**Dependencies:** INV-FIX-003, SD-ADV-004 (bulk UI pattern).

---

## 8. Email Integration with Leads & Clients

### 8.1 Current Email State

The `comm-service` provides:
- Gmail OAuth per user.
- Thread archive in MongoDB.
- Manual link/unlink of threads to entities.
- `EntityEmailTimeline` component shows threads linked to a lead in the lead detail sheet.
- WebSocket `/comm` namespace for real-time updates.

### 8.2 What Is Missing

---

#### EMAIL-FIX-001 — Auto-linking of incoming emails to leads

*(Defined in BRAND-FIX-002 above — cross-reference)*

---

#### EMAIL-FIX-002 — Email composition not available from the lead sheet

**Issue:** Users can see email threads in the lead's Emails tab, but cannot compose a new email directly from the lead detail sheet. They must switch to the full email view.

**Expected Output:** "New Email" button in the lead's Emails tab opens an inline compose form pre-filled with the lead's email address and the assigned agent's Gmail identity.

**Steps to Fix:**
1. In `EntityEmailTimeline`, add a "Compose" button.
2. Open a compose drawer with: To (lead email), From (user's connected Gmail alias), Subject, Body (rich text).
3. On send: call `POST /comm/threads/send` with `{ to, subject, body, entityType: 'LEAD', entityId }`.
4. New thread is auto-linked to the lead.
5. Thread appears in the timeline immediately (optimistic update).

**Estimate:** M (4 h)
**Dependencies:** Comm-service send API already exists.

---

#### EMAIL-FIX-003 — No email notification for lead assignment

**Issue:** When a lead is assigned to an agent, they find out by checking the dashboard. There is no email notification.

**Expected Output:** On lead assignment, the assigned agent receives an email: "You have been assigned a new lead: [Lead Name] ([email]). View it here: [link]".

**Steps to Fix:**
1. In `LeadsService.assign()`, after updating the lead, call `CommService.sendTransactionalEmail` to the agent's user email.
2. Email template: `lead-assignment` — includes lead name, email, phone, source, link to lead in dashboard.
3. Use the brand's Gmail alias as the sender (so it appears branded).
4. Make this configurable: user can opt out in their notification preferences.

**Estimate:** S (2–3 h)
**Dependencies:** Transactional email capability in comm-service.

---

#### EMAIL-FIX-004 — Email thread unread count not surfaced on leads

**Issue:** The sidebar shows a total unread comm count. But if an agent has 20 open leads, they cannot tell which lead has unread emails without opening each one.

**Expected Output:** Leads list rows and Kanban cards show an unread email badge (e.g., a blue dot or "3 unread") when there are unread threads linked to that lead.

**Steps to Fix:**
1. Add `GET /comm/entity-links/unread-counts?entityType=LEAD&entityIds=id1,id2,...` to comm-service.
2. Returns `{ [leadId]: unreadCount }`.
3. In `leads/page.tsx`: batch-fetch unread counts for the current page of leads.
4. Render a blue badge on rows/cards with `unreadCount > 0`.

**Estimate:** M (3–4 h)
**Dependencies:** Comm-service entity links module (already exists in M2).

---

## 9. KPIs & Analytics Dashboard

### 9.1 Current Analytics Gaps

| Metric | Current | Issue |
|--------|---------|-------|
| Total Revenue | Sum of `sale.totalAmount` for ACTIVE + COMPLETED | Should be sum of `PaymentTransaction.amount WHERE status=SUCCESS` |
| Lead Conversion Rate | `convertedLeads / totalLeads` | Denominator excludes soft-deleted leads; terminal states not split |
| Revenue by Month | Grouped by `sale.createdAt` | Should group by `paymentTransaction.createdAt` |
| Sales by Brand | All-time, no filter | Should respect date range |
| Active Sales | Count with status ACTIVE | Correct |
| Agent Performance | Leads total + converted count | No response time, no revenue attributed per agent |

### 9.2 KPI Fixes

#### KPI-FIX-001 — Revenue accuracy (defined in SD-FIX-001 of first plan — reference)

#### KPI-FIX-002 — Add date range filter to all metrics (defined in SD-FIX-010 of first plan — reference)

---

#### KPI-NEW-001 — Team & Agent KPI Dashboard

**Issue:** There is no team-level performance view. Managers cannot see how their team is performing against targets.

**Expected Output:** A "Team Performance" section on the dashboard (visible to SALES_MANAGER and above) showing:

| Metric | Per Agent | Per Team |
|--------|-----------|----------|
| Leads Assigned | ✓ | ✓ (sum) |
| Leads Contacted | ✓ | ✓ |
| Conversion Rate | ✓ (%) | ✓ (avg) |
| Avg Days to Close | ✓ | ✓ |
| Revenue Generated | ✓ | ✓ |
| Open Follow-ups | ✓ | ✓ |
| Avg Response Time | ✓ (h) | ✓ |

**Steps to Fix:**

**Backend:**
1. Add `GET /analytics/team-performance?teamId=&dateFrom=&dateTo=` endpoint.
2. Query per-agent metrics:
   - `lead.count` grouped by `assignedToId`.
   - `lead.count` where `status IN ['CONTACTED', 'PROPOSAL', 'FOLLOW_UP', 'CLOSED_WON']` grouped by agent.
   - `sale.aggregate _sum(totalAmount)` grouped by agent (via `client.leads.assignedToId`).
   - Average time from `createdAt` to first `LeadActivity` of type `STATUS_CHANGE` (response time proxy).
3. Return `{ agents: [...], teams: [...] }`.

**Frontend:**
1. Add "Team Performance" card below existing KPI cards — visible to SALES_MANAGER+.
2. Table: columns as above, sortable, with sparkline trend indicator.
3. Clicking an agent row opens a drill-down showing their individual leads list.

**Estimate:** L (7–8 h)
**Dependencies:** LEAD-FIX-001 (CLOSED_WON/LOST split).

---

#### KPI-NEW-002 — Sales Targets & Progress Tracking

**Issue:** There is no concept of a sales target. No way to know if a team is on track to hit their monthly goal.

**Expected Output:** Admins can set monthly revenue targets per team or per agent. The dashboard shows a progress bar: "Team A — $45,000 / $80,000 (56%)".

**Steps to Fix:**
1. Add `SalesTarget` model: `{ id, orgId, teamId?, userId?, month (YYYY-MM), targetRevenue, createdBy }`.
2. `POST /targets` — ADMIN/OWNER only.
3. `GET /targets?month=2026-03` — returns targets for the period.
4. `GET /analytics/target-progress?month=2026-03` — joins targets with actual revenue.
5. Frontend: progress bar component under each team card on dashboard.

**Estimate:** M (4–5 h)
**Dependencies:** KPI-NEW-001.

---

#### KPI-NEW-003 — Lead Source Breakdown Chart

**Issue:** The analytics dashboard does not show where leads are coming from. Knowing which acquisition channel is most effective is critical for a sales team.

**Expected Output:** A "Lead Sources" chart showing the count of leads per source (FACEBOOK_ADS, WEB_FORM, MANUAL, IMPORT, WEBHOOK, etc.) for the selected period.

**Steps to Fix:**
1. Add `source` to the `leadsBySource` analytics query: `lead.groupBy({ by: ['source'], _count: true, where: { orgId, createdAt: { gte, lte } } })`.
2. Return in `GET /analytics/summary`.
3. Frontend: a donut or horizontal bar chart for sources.

**Estimate:** S (2 h)
**Dependencies:** SD-FIX-010 (date filter on analytics).

---

## 10. Team-Wise Workflows & Performance Tracking

### 10.1 Current Team Structure

```
Organization
    └── SalesTeam
            ├── SalesTeamManager (user with SALES_MANAGER role)
            └── SalesTeamMember (user with FRONTSELL_AGENT or UPSELL_AGENT role)
```

Data visibility:
- FRONTSELL_AGENT / UPSELL_AGENT → see only their own assigned leads/sales.
- SALES_MANAGER → see all leads/sales assigned to their team members.
- ADMIN / OWNER → see everything.

### 10.2 Team Workflow Gaps

---

#### TEAM-FIX-001 — No team assignment on lead (only user assignment)

**Issue:** Leads can be assigned to a specific user but not to a team. When a manager wants to assign a lead to "whichever available agent on Team A", they must pick a person manually.

**Expected Output:** `PATCH /leads/:id/assign` accepts either `{ assignedToId }` (specific user) OR `{ assignedToTeamId }` (team — auto-pick using round-robin or least-loaded agent).

**Steps to Fix:**
1. Add optional `assignedToTeamId String?` to the `Lead` model.
2. Update `assign-lead.dto.ts` to accept `teamId` as an alternative to `userId`.
3. In `LeadsService.assign()`: if `teamId` provided, call `AssignmentRulesService.pickAgent(teamId, strategy)`.
4. Strategy options: `ROUND_ROBIN` (default) or `LEAST_LOADED` (pick agent with fewest open leads).

**Estimate:** S (2–3 h)
**Dependencies:** LEAD-FIX-004 (assignment rules engine).

---

#### TEAM-FIX-002 — No team-level lead pipeline view

**Issue:** Each agent sees only their own leads. A SALES_MANAGER has no consolidated pipeline view showing all of their team's leads grouped by stage.

**Expected Output:** When a SALES_MANAGER opens the leads page, the Kanban board shows all leads assigned to their team members, with agent avatar shown on each card.

**Steps to Fix:**
1. This is mostly already solved by the visibility scoping logic. The issue is the Kanban card component does not render the assigned agent's avatar.
2. Add `assignedTo: { select: { id, name, avatarUrl } }` to the `LeadsService.findAll()` include.
3. Render avatar + name tooltip on each Kanban card.
4. Add an "Assigned To" filter dropdown on the leads page for managers.

**Estimate:** S (2 h)
**Dependencies:** None (backend scoping already works).

---

#### TEAM-FIX-003 — No workload balancing indicator

**Issue:** When assigning leads manually, a manager has no visibility into each agent's current workload (how many open leads they have).

**Expected Output:** In the lead assignment dropdown (assign lead modal), each agent is shown with their current open lead count: "Alice (12 open)", "Bob (3 open)".

**Steps to Fix:**
1. In `GET /users?teamId=...`: include `_count: { select: { assignedLeads: { where: { deletedAt: null, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } } } } }`.
2. Return as `openLeadCount` per user.
3. Frontend: render "(N open)" next to each agent name in the assignment dropdown.

**Estimate:** S (1–2 h)
**Dependencies:** LEAD-FIX-001 (terminal status names).

---

## 11. Missing Workflow Integrations

### 11.1 Summary of All Missing Workflows

The following workflows are currently absent and must be built to complete the system:

| Workflow | Missing Component | Where Defined |
|----------|-------------------|---------------|
| Bulk lead import | `POST /leads/import` endpoint + frontend file upload | LEAD-IMPORT-001 |
| Facebook Lead Ads auto-capture | Webhook receiver + Graph API fetch | LEAD-IMPORT-002 |
| Generic inbound webhook | Org-specific signed URL | LEAD-IMPORT-003 |
| Lead deduplication | Email-based dupe check on capture | LEAD-FIX-005 |
| Automated lead assignment | `LeadAssignmentRule` model + rules engine | LEAD-FIX-004 |
| Follow-up reminders | BullMQ delayed job → notification | LEAD-FIX-002 |
| Lead activity timeline in UI | "Activity" tab in lead sheet | LEAD-FIX-003 |
| Client welcome email on conversion | Transactional email after `convert()` | LEAD-CONV-003 |
| Auto-sale creation prompt post-conversion | Post-conversion guided flow | LEAD-CONV-002 |
| Invoice overdue auto-flag | Nightly cron job | INV-FIX-001 |
| Email auto-link to leads | Brand alias matching in sync processor | BRAND-FIX-002 |
| Email compose from lead sheet | Inline compose drawer | EMAIL-FIX-002 |
| Unread email badge on leads | Batch unread count endpoint | EMAIL-FIX-004 |
| Team performance dashboard | `GET /analytics/team-performance` | KPI-NEW-001 |
| Sales targets | `SalesTarget` model + progress API | KPI-NEW-002 |
| Client page in frontend | `/dashboard/clients` page | CLIENT-FIX-001 |

### 11.2 Notes on Future Features (Phase 2 Follow-up)

The following are noted here but will be detailed in a separate Phase 2 document:

- **Real-time dashboard updates** via WebSocket (sale created, invoice paid → KPIs refresh automatically).
- **Lead scoring model** — ML-based or rule-based quality score (0–100) per lead.
- **Email sequence automation** — schedule a series of follow-up emails at intervals after lead capture.
- **LinkedIn integration** — import leads from LinkedIn Sales Navigator via CSV or direct API.
- **Revenue forecasting** — project monthly revenue based on current pipeline and historical close rates.
- **Mobile responsive UI** — refactor dashboard for tablet/phone viewports.
- **Two-factor authentication** for ADMIN and OWNER roles.

---

## 12. Implementation Priority Matrix

### Priority Definitions
- **P0** — Broken or blocking; fix immediately.
- **P1** — Important gap; fix in current sprint.
- **P2** — Significant improvement; schedule next sprint.
- **P3** — Enhancement; future sprint.

| ID | Title | Priority | Estimate | Dependencies |
|----|-------|----------|----------|--------------|
| LEAD-FIX-001 | CLOSED_WON / CLOSED_LOST status split | P0 | M | migration |
| LEAD-FIX-005 | Duplicate lead detection | P0 | S | — |
| INV-FIX-001 | Invoice overdue auto-flag cron | P0 | S | — |
| INV-FIX-002 | Invoice number collision fix | P0 | M | migration |
| LEAD-CONV-001 | Conversion form completeness | P0 | S | — |
| CLIENT-FIX-001 | Client page in frontend | P1 | M | — |
| LEAD-FIX-002 | Follow-up reminder notification | P1 | M | BullMQ, Notification model |
| LEAD-FIX-003 | Lead activity timeline UI | P1 | M | — |
| LEAD-FIX-004 | Automated lead assignment rules | P1 | L | — |
| LEAD-CONV-002 | Auto sale creation prompt | P1 | S | CONV-001 |
| LEAD-CONV-003 | Welcome email on conversion | P1 | M | comm-service send |
| LEAD-IMPORT-001 | Bulk CSV import | P1 | L | FIX-004, FIX-005 |
| EMAIL-FIX-002 | Compose email from lead sheet | P1 | M | — |
| EMAIL-FIX-003 | Assignment notification email | P1 | S | — |
| EMAIL-FIX-004 | Unread badge on leads | P1 | M | — |
| KPI-NEW-001 | Team performance dashboard | P1 | L | LEAD-FIX-001 |
| TEAM-FIX-002 | Manager pipeline view (agent avatars) | P1 | S | — |
| TEAM-FIX-003 | Workload indicator in assignment | P1 | S | LEAD-FIX-001 |
| INV-FIX-003 | Branded invoice PDF | P1 | M | brand assets |
| KPI-FIX-001 | Revenue accuracy | P1 | S | (SD-FIX-001) |
| KPI-FIX-002 | Date filter on analytics | P1 | M | KPI-FIX-001 |
| KPI-NEW-003 | Lead source breakdown chart | P1 | S | KPI-FIX-002 |
| BRAND-FIX-002 | Auto-link emails to leads | P2 | M | comm-service |
| CLIENT-FIX-002 | Client soft-delete | P2 | S | migration |
| CLIENT-FIX-003 | Client revenue summary | P2 | S | CLIENT-FIX-001 |
| TEAM-FIX-001 | Team assignment on lead | P2 | S | LEAD-FIX-004 |
| KPI-NEW-002 | Sales targets & progress | P2 | M | KPI-NEW-001 |
| BRAND-FIX-001 | Brand-level analytics page | P2 | M | SD-SCALE-001 |
| INV-FIX-004 | Bulk invoice send / export zip | P2 | L | INV-FIX-003 |
| LEAD-IMPORT-002 | Facebook Lead Ads webhook | P2 | L | FIX-004, FIX-005 |
| LEAD-IMPORT-003 | Generic inbound webhook | P2 | M | — |

---

## Sizing Legend

| Size | Time |
|------|------|
| XS | < 1 h |
| S | 1–3 h |
| M | 3–6 h |
| L | 6–10 h |
| XL | 10+ h |
