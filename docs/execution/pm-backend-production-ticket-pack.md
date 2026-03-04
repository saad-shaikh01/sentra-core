# PM Backend Production-Readiness Ticket Pack

**Milestone:** M1 Backend Closure / Hardening
**Status:** Authoritative Dependency Source
**Client Approval Flow:** DEFERRED (HOLD)

---

## P0: Critical Infrastructure & Stability

### BE-P0-001: CI/CD Hardening & Schema Validation
- **Problem:** Build passes but lacks strict schema enforcement during runtime for some edge cases in `pm-service`.
- **Scope:** Audit all DTOs in `modules/engagements-projects`, `modules/stages-tasks`, and `modules/templates`.
- **Acceptance Criteria:**
  - `class-validator` `whitelist: true` and `forbidNonWhitelisted: true` enforced globally.
  - All response shapes strictly follow `wrapSingle` or `{ data, meta }` pattern.
  - 100% Build pass in CI environment without `--quiet` flags.
- **Risk:** Low
- **Estimate:** S
- **Verification:** `npm run build` and `npm run test` (unit tests for ProjectService).

### BE-P0-002: Task Submission & QC Integrity
- **Problem:** Frontend reports "coming soon" for QC submissions, but backend endpoints exist. Need to verify state machine integrity.
- **Scope:** `QcApprovalsController` and `SubmissionsService`.
- **Acceptance Criteria:**
  - Create submission endpoint handles file attachments correctly.
  - Task status automatically moves to `UNDER_REVIEW` upon submission.
  - Prevent duplicate active submissions for the same task.
- **API Impact:** `POST /tasks/:taskId/submissions`
- **Risk:** Medium (State machine complexity)
- **Estimate:** M
- **Verification:** Postman/Insomnia tests for submission flow.

---

## P1: Performance & Feature Completeness

### BE-P1-001: Thread Polling Optimization
- **Problem:** Frontend is polling messages every 10s. Backend needs a lightweight endpoint to reduce DB load.
- **Scope:** `ThreadsController`.
- **Acceptance Criteria:**
  - Implement `GET /threads/:id/head` returning only `lastMessageAt` and `messageCount`.
  - Frontend can use this to skip full message fetch if nothing changed.
- **Risk:** Low
- **Estimate:** S
- **Verification:** Compare latency of `/messages` vs `/head`.

### BE-P1-002: Stage Reordering Implementation
- **Problem:** Backend has the logic but needs to ensure transactional integrity when reordering stages.
- **Scope:** `TemplateStagesService.reorderStages`.
- **Acceptance Criteria:**
  - Reordering stages within a template uses a single transaction.
  - Prevent duplicate `sortOrder` values.
- **Risk:** Medium
- **Estimate:** S
- **Verification:** Unit test for reorder logic with 10+ stages.

---

## Deferred (Hold) - Client Approval Workflow
*These tickets are blocked by `comm-service` dependency.*

### BE-HOLD-001: External Approval Request Dispatch
- **Problem:** Cannot send approval emails to clients without `comm-service`.
- **Scope:** `ApprovalsService`.
- **Status:** ON HOLD.

---

## Milestone Plan
1. **M1 Backend Closure:** Complete BE-P0-001, BE-P0-002 (ETA: 2 days).
2. **M2 Frontend Closure:** (See Frontend Ticket Pack).
3. **M3 Hardening:** Load testing on Threads and Files.
4. **M4 Release Readiness:** Final sign-off.
