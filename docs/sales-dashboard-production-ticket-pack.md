# Sales Dashboard Production Ticket Pack

**Module:** Leads / Global
**Status:** Dependent on Core Service Pack

---

### [P0: Infrastructure & Blockers]

#### CORE-FE-001: Build & Lint Restoration
- **Severity:** P0
- **Module:** Global
- **Current Behavior:** Build fail on `file-list.tsx`. Lint 29k errors.
- **Expected Behavior:** Build 100% success. Lint ignores `.next`.
- **Files:** `file-list.tsx`, `.eslintrc.json`
- **Estimate:** S

#### LEAD-FE-001: Advanced Conversion Form
- **Severity:** P0
- **Module:** Leads / Sales
- **Current Behavior:** Simple conversion.
- **Expected Behavior:** Modal to select Package, add Custom Pricing, and upload Contract (Optional).
- **Files:** `lead-detail-sheet.tsx`, `api.ts`
- **Estimate:** M

---

### [P1: UX & Parity]

#### LEAD-FE-002: Timeline & Activity View
- **Severity:** P1
- **Module:** Leads
- **Current Behavior:** Activities listed as raw text.
- **Expected Behavior:** Visual timeline (Status changes, Notes, Assignments).
- **Files:** `lead-detail-sheet.tsx`
- **Estimate:** S

#### LEAD-FE-003: Overdue Follow-ups Dashboard
- **Severity:** P1
- **Module:** Dashboard
- **Current Behavior:** No overdue tracking.
- **Expected Behavior:** Dashboard cards showing leads with passed `followUpDate`.
- **Estimate:** S

---

### [P2: Enhancements]

#### LEAD-FE-004: Bulk Action Bar
- **Severity:** P2
- **Module:** Leads Table
- **Current Behavior:** One by one action only.
- **Expected Behavior:** Select multiple leads to Bulk Assign or Bulk Delete.
- **Estimate:** S

#### LEAD-FE-005: Role-Filtered Assignment UI
- **Severity:** P1
- **Module:** Leads / UI
- **Current Behavior:** Dropdown shows all users.
- **Expected Behavior:** 
  - Filter agents by Role (Upsell/Frontsell/PM) during assignment.
  - Show agent's current load (e.g., "John - 5 active leads").
- **Files:** `lead-detail-sheet.tsx`, `api.ts`
- **Estimate:** S

#### LEAD-FE-006: Advanced Lead Filter Bar
- **Severity:** P1
- **Module:** Leads / UI
- **Current Behavior:** Simple list with no multi-dimensional filtering.
- **Expected Behavior:** 
  - Filter by: Assignee (Agent), Brand, Source, Status, and Date Range.
  - Search by: Name, Email, or Phone.
  - URL-synced filters (taake link share karne par filters save rahein).
- **Files:** `leads/page.tsx`, `hooks/use-leads.ts`
- **Estimate:** S

#### LEAD-QA-001: Leads Module Testing & Type Safety
- **Severity:** P0
- **Module:** Testing / QA
- **Rule 1:** 0 usage of `any` in leads-related code.
- **Rule 2:** Unit tests for `LeadsService.convert` logic (Sale -> Client promotion).
- **Rule 3:** Integration tests for Public API security.
- **Rule 4:** E2E smoke test for the Lead-to-Sale lifecycle.
- **Estimate:** M

### [P0: Advanced Sales UI]

#### SALE-FE-001: Quick Sale Action & Modal
- **Severity:** P0
- **Module:** Sales / UI
- **Current Behavior:** No quick sale option.
- **Expected Behavior:** 
  - "Create Sale" icon on Lead/Client table rows.
  - Multi-step modal: 1. Service/Package Selection -> 2. Payment Plan (Partial/Full) -> 3. Contract/Details.
- **Files:** `leads/page.tsx`, `clients/page.tsx`, `sales/create-sale-modal.tsx`
- **Estimate:** M

#### SALE-FE-002: Service/Package Selector Component
- **Severity:** P1
- **Module:** Sales / UI
- **Current Behavior:** Raw amount input.
- **Expected Behavior:** 
  - Searchable dropdown for Standard Packages.
  - "Add Custom Item" button to define unique services and prices in the same sale.
- **Estimate:** S

#### SALE-FE-003: Payment Plan & Installment Builder
- **Severity:** P1
- **Module:** Sales / UI
- **Current Behavior:** No partial payment UI.
- **Expected Behavior:** 
  - Toggle for "Partial Payment".
  - Ability to add rows for installments (Amount + Due Date).
  - Validation: Sum of installments must equal Total Amount.
- **Estimate:** M
