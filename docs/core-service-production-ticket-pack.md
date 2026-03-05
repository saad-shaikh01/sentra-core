# Core Service Production Ticket Pack

**Module:** Leads (Production-Readiness)
**Status:** Authoritative
**Hold:** Client Approval (comm-service)

---

### [P0: Blockers & Foundation]

#### LEAD-BE-001: Soft-Delete Implementation
- **Severity:** P0
- **Module:** Leads / Prisma
- **Current Behavior:** Leads delete hone par database se permanent remove ho jati hain.
- **Expected Behavior:** `deletedAt` field use ho. Archived leads filter views mein na dikhein.
- **Files:** `prisma/schema.prisma`, `leads.service.ts`
- **Acceptance Criteria:**
  - [ ] `npx prisma migrate` completed with `deletedAt` field.
  - [ ] `leadsService.remove` marks `deletedAt` instead of `delete`.
- **Estimate:** S

#### LEAD-BE-002: Public Lead Capture API
- **Severity:** P0
- **Module:** Leads / API
- **Current Behavior:** Saare endpoints Auth token mangte hain.
- **Expected Behavior:** `/api/leads/capture` route Public ho (unauthenticated) taake landing pages se data aa sake.
- **Files:** `leads.controller.ts`, `leads.module.ts`
- **Acceptance Criteria:**
  - [ ] Public endpoint accepts `name, email, phone, brandId, source`.
  - [ ] Rate limiting applied to prevent spam.
- **Estimate:** S

#### LEAD-BE-003: Task/Follow-up State Machine Update
- **Severity:** P0
- **Module:** Leads
- **Current Behavior:** Follow-up dates track nahi ho rahi.
- **Expected Behavior:** Agar status `FOLLOW_UP` hai, to `followUpDate` mandatory huga.
- **Files:** `leads.service.ts`, `create-lead.dto.ts`
- **Acceptance Criteria:**
  - [ ] Validation fails if status is FOLLOW_UP but date is missing.
- **Estimate:** S

---

### [P1: Feature Parity & Scaling]

#### LEAD-BE-004: Bulk Import Service (CSV/Excel)
- **Severity:** P1
- **Module:** Leads / Utils
- **Current Behavior:** No bulk upload.
- **Expected Behavior:** Endpoint to upload CSV/Excel and batch-create leads.
- **Files:** `leads.service.ts`, `leads.controller.ts`
- **Acceptance Criteria:**
  - [ ] Handle 1000+ leads in one upload.
  - [ ] Skip duplicates based on Email+Brand.
- **Estimate:** M

#### LEAD-BE-005: Advanced Role-Based Assignment & Metrics
- **Severity:** P0
- **Module:** Leads / IAM
- **Current Behavior:** Manual assignment to any user. No tracking of why or how.
- **Expected Behavior:** 
  - Assignment validates agent role (e.g., Frontsell lead can only go to FRONTSELL_AGENT).
  - Track "Assignment Type" (Upsell, Frontsell, PM).
  - Increment `assignedLeadsCount` on User model for performance tracking.
- **Files:** `leads.service.ts`, `prisma/schema.prisma`
- **Acceptance Criteria:**
  - [ ] Role validation on `leadsService.assign`.
  - [ ] LeadActivity logs the specific assignment category (Frontsell/Upsell).
- **Estimate:** M

#### CORE-BE-001: Real-time Notification Engine (Firebase + WebSockets)
- **Severity:** P1
- **Module:** Notifications
- **Current Behavior:** No notifications.
- **Expected Behavior:** New lead arrival par assigned agent ko Push + Dashboard notification mile.
- **Estimate:** L

### [P0: Advanced Sales Engine]

#### SALE-BE-001: Advanced Sales Schema (Packages & Partial Payments)
- **Severity:** P0
- **Module:** Sales / Prisma
- **Current Behavior:** Basic sale with total amount only.
- **Expected Behavior:** 
  - `SaleType` Enum (FRONTSELL, UPSELL).
  - `SaleItem` model for line items (Standard Packages or Custom Services).
  - `Invoice` relation updated to support Multiple Invoices per Sale (Partial Payments).
  - `contractUrl` field for signed agreements.
- **Files:** `prisma/schema.prisma`, `sales.service.ts`
- **Estimate:** M

#### SALE-BE-002: Automatic Invoice & Payment Link Generation
- **Severity:** P0
- **Module:** Sales / Payments
- **Current Behavior:** Manual invoice creation.
- **Expected Behavior:** 
  - Sale creation automatically generates Invoices based on chosen Payment Plan (Full/Partial).
  - Optional integration with Authorize.Net to generate hosted payment links.
- **Estimate:** M

#### SALE-BE-003: Refund & Transaction Lifecycle
- **Severity:** P1
- **Module:** Sales
- **Current Behavior:** No refund logic.
- **Expected Behavior:** 
  - API to process full/partial refunds via Authorize.Net.
  - Transaction status updates (SUCCESS, FAILED, REFUNDED).
- **Estimate:** S

---

### [Not in this phase]
- Client Approval flow (HOLD).
- Complex Tax/Currency logic.
