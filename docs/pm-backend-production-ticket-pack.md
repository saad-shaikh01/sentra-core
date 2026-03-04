# PM Backend Production-Readiness Ticket Pack

**Release Strategy:** P0 Blockers -> P1 Parity -> P2 Optimization
**Status:** Authoritative
**Note:** Client Approval flow (comm-service) is on **HOLD**.

---

### [P0: Blockers & Broken Loops]

#### BE-P0-001: Structured Logging & OrgContext Injection
- **Severity:** P0
- **Module:** Common / Core
- **Current Behavior:** Logs are plain text; debugging multitenant issues is difficult without automatic OrgId/UserId context in every log line.
- **Expected Behavior:** Every request log must include `organizationId`, `userId`, and `requestId`.
- **Files to Change:**
  - `apps/backend/pm-service/src/common/interceptors/logging.interceptor.ts`
  - `apps/backend/pm-service/src/common/decorators/org-context.decorator.ts`
- **API Contract:** N/A (Internal Logging)
- **Acceptance Criteria:**
  - [ ] All logs in `pm-service` show OrgContext.
  - [ ] No sensitive data (tokens/passwords) in logs.
- **Test Plan:** Manual check of container logs during API calls.
- **Dependencies:** None
- **Estimate:** S

#### BE-P0-002: DTO Whitelisting & Strict Validation Hardening
- **Severity:** P0
- **Module:** API / Security
- **Current Behavior:** `ValidationPipe` exists but `whitelist: true` and `forbidNonWhitelisted: true` are not strictly enforced globally, allowing "garbage" data in requests.
- **Expected Behavior:** API rejects any request containing fields not defined in the DTO.
- **Files to Change:**
  - `apps/backend/pm-service/src/main.ts`
- **API Contract:** Global `ValidationPipe` config.
- **Acceptance Criteria:**
  - [ ] Sending `unknownField: "test"` to `/projects` returns 400 Bad Request.
- **Test Plan:** Integration test using `supertest` for any POST endpoint with extra fields.
- **Dependencies:** None
- **Estimate:** S

#### BE-P0-003: Task Submission State Machine Verification
- **Severity:** P0
- **Module:** QC Approvals
- **Current Behavior:** Submission logic exists but status transitions (READY -> UNDER_REVIEW) need validation for edge cases (e.g., resubmission after rejection).
- **Expected Behavior:** Submission creates a `QcSubmission` record and locks the task status to `UNDER_REVIEW`.
- **Files to Change:**
  - `apps/backend/pm-service/src/modules/qc-approvals/submissions.service.ts`
- **API Contract:** `POST /api/pm/tasks/:taskId/submissions` -> `CreateSubmissionDto`
- **Acceptance Criteria:**
  - [ ] Task status moves to `UNDER_REVIEW`.
  - [ ] `submissionNumber` increments correctly.
- **Test Plan:** Unit test for `SubmissionsService.create`.
- **Dependencies:** None
- **Estimate:** M

---

### [P1: Parity Gaps & UX Dead-ends]

#### BE-P1-001: Project/Template Soft-Archive Consistency
- **Severity:** P1
- **Module:** Engagements / Templates
- **Current Behavior:** Archive endpoints exist but "Deleted" vs "Archived" logic is inconsistent across modules.
- **Expected Behavior:** Standardized `archivedAt` and `isActive` fields for Projects and Templates.
- **Files to Change:**
  - `apps/backend/pm-service/src/modules/engagements-projects/projects.service.ts`
  - `apps/backend/pm-service/src/modules/templates/templates.service.ts`
- **API Contract:** `POST /api/pm/projects/:id/archive`, `POST /api/pm/templates/:id/archive`
- **Acceptance Criteria:**
  - [ ] Archived items are filtered out from default LIST views unless `includeArchived=true`.
- **Test Plan:** Integration tests for LIST endpoints with filters.
- **Dependencies:** None
- **Estimate:** S

---

### [P2: Optimization]

#### BE-P2-001: Thread Polling "Head" Endpoint
- **Severity:** P2
- **Module:** Threads
- **Current Behavior:** FE polls full message list to check for updates.
- **Expected Behavior:** Lightweight endpoint returns only `lastMessageAt` and `count`.
- **Files to Change:**
  - `apps/backend/pm-service/src/modules/threads/threads.controller.ts`
- **API Contract:** `GET /api/pm/threads/:id/head` -> `{ lastMessageAt: Date, count: number }`
- **Acceptance Criteria:**
  - [ ] Endpoint returns correct metadata without fetching full message bodies.
- **Test Plan:** Benchmarking latency against full `/messages` endpoint.
- **Estimate:** S

---

### [Not in this phase]
- **HOLD:** Client Approval email dispatch (Blocked by `comm-service`).
- **HOLD:** External approval decision webhook (Blocked by `comm-service`).
