# PM Frontend Production-Readiness Ticket Pack

**Milestone:** M2 Frontend Closure
**Status:** Dependent on M1 Backend Closure
**Client Approval Flow:** DEFERRED (HOLD)

---

## P0: Critical Blockers (No-Ship Items)

### FE-P0-001: Build & Lint Restoration
- **Problem:** `pm-dashboard` build fails on `file-list.tsx` and linting is overwhelmed by `.next` noise.
- **Scope:** `apps/frontend/pm-dashboard/.eslintrc.json`, `file-list.tsx`.
- **Acceptance Criteria:**
  - Fix implicit `any` type in `file-list.tsx` mapping.
  - Update ESLint config to ignore `.next` and `dist` directories.
  - `npx nx run pm-dashboard:build` must pass 100%.
- **Risk:** Low
- **Estimate:** S
- **Verification:** Run build and lint commands.

### FE-P0-002: API Client Consolidation
- **Problem:** Threads, Files, and Archive/Duplicate actions bypass `lib/api.ts` abstraction.
- **Scope:** `api.ts`, `thread-pane.tsx`, `file-uploader.tsx`, `templates/page.tsx`.
- **Acceptance Criteria:**
  - Zero raw `api.fetch` calls in components.
  - All calls moved to `ApiClient` methods in `lib/api.ts`.
  - Consistent error handling via `api.ts` interceptors.
- **Dependencies:** None (Surgical refactor).
- **Risk:** Medium (Potential breakages in response handling).
- **Estimate:** M
- **Verification:** Manual check of all network calls in DevTools.

### FE-P0-003: Task Submission Workflow (QC Loop)
- **Problem:** "Coming soon" banner blocks production flow for QC tasks.
- **Scope:** `task-detail-drawer.tsx`.
- **Acceptance Criteria:**
  - Replace "coming soon" with a submission form (notes + file selection).
  - Submit to `POST /tasks/:taskId/submissions` (Requires **BE-P0-002**).
  - UI reflects `UNDER_REVIEW` status immediately after submission.
- **Dependencies:** **BE-P0-002**.
- **Risk:** High (Core UI flow).
- **Estimate:** M
- **Verification:** End-to-end task submission -> QC list verification.

---

## P1: UX Reliability & Navigation

### FE-P1-001: Stage Lifecycle UI Implementation
- **Problem:** Stages are visible but immutable in the UI.
- **Scope:** `StageCard.tsx`.
- **Acceptance Criteria:**
  - Add buttons for `Activate Stage` and `Mark Completed`.
  - Connect to backend lifecycle endpoints.
  - Show "Blocked" reason clearly if stage is blocked.
- **Risk:** Medium
- **Estimate:** S
- **Verification:** Manual stage transition testing.

### FE-P1-002: UX Honesty & Cleanup
- **Problem:** Disabled buttons like "Timeline" and "Project Settings" produce a "dead" feel.
- **Scope:** `ProjectDetailPage.tsx`, `EngagementsPage.tsx`.
- **Acceptance Criteria:**
  - Remove "coming soon" buttons that have no underlying backend support yet.
  - Add "Empty State" illustrations for empty task/project lists.
  - Implement confirmation modals for Archive/Delete actions.
- **Risk:** Low
- **Estimate:** S
- **Verification:** UX walkthrough.

---

## Deferred (Hold) - Client Approval Workflow
*These tickets are blocked by `comm-service` dependency.*

### FE-HOLD-001: Client Approval Request Modal
- **Problem:** UI cannot trigger external approvals.
- **Status:** ON HOLD.

---

## Milestone Plan
1. **M2 Frontend Closure:** Fix P0 items sequentially (ETA: 3 days).
2. **M3 Hardening:** Perf audit of `ThreadPane` polling (Requires **BE-P1-001**).
3. **M4 Release Readiness:** Final E2E smoke test.
