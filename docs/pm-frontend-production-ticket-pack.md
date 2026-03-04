# PM Frontend Production-Readiness Ticket Pack

**Release Strategy:** P0 Blockers -> P1 Parity -> P2 Optimization
**Status:** Dependent on Backend Sequence
**Note:** Client Approval flow (comm-service) is on **HOLD**.

---

### [P0: Blockers & Broken Loops]

#### FE-P0-001: Build & Lint Config Restoration
- **Severity:** P0
- **Module:** DevOps / Infra
- **Current Behavior:** Build fails on implicit `any` in `file-list.tsx`. Lint reports 29k errors (includes `.next`).
- **Expected Behavior:** 0 errors in domain code. Build passes 100%.
- **Files to Change:**
  - `apps/frontend/pm-dashboard/.eslintrc.json` (add ignorePatterns: [".next", "dist"])
  - `apps/frontend/pm-dashboard/src/components/shared/files/file-list.tsx`
- **Acceptance Criteria:**
  - [ ] `nx lint pm-dashboard` passes.
  - [ ] `nx build pm-dashboard` passes.
- **Test Plan:** CI pipeline run.
- **Estimate:** S

#### FE-P0-002: API Client Consolidation (lib/api.ts)
- **Severity:** P0
- **Module:** Shared / API
- **Current Behavior:** Threads/Files bypass `api.ts` class, causing inconsistent auth/error handling.
- **Expected Behavior:** All network calls use the `api` singleton methods.
- **Files to Change:**
  - `apps/frontend/pm-dashboard/src/lib/api.ts`
  - `apps/frontend/pm-dashboard/src/components/shared/threads/thread-pane.tsx`
  - `apps/frontend/pm-dashboard/src/components/shared/files/file-uploader.tsx`
- **Acceptance Criteria:**
  - [ ] 0 direct `fetch()` calls in components.
- **Test Plan:** Verify all API calls in Network tab have `Authorization` header and correct base URL.
- **Estimate:** M

#### FE-P0-003: Task Submission UI (QC Loop Closure)
- **Severity:** P0
- **Module:** Tasks
- **Current Behavior:** "Coming soon" placeholder for QC submissions.
- **Expected Behavior:** Full form to submit work (notes + attachment links).
- **Files to Change:**
  - `apps/frontend/pm-dashboard/src/app/dashboard/my-tasks/_components/task-detail-drawer.tsx`
- **API Contract:** `POST /tasks/:taskId/submissions`
- **Acceptance Criteria:**
  - [ ] User can enter submission notes.
  - [ ] Task status updates to `UNDER_REVIEW` in UI after success.
- **Test Plan:** E2E: Task -> Submit -> Status Change.
- **Dependencies:** **BE-P0-003**.
- **Estimate:** M

---

### [P1: Parity Gaps & UX Dead-ends]

#### FE-P1-001: UI State Consistency (Loading/Empty/Error)
- **Severity:** P1
- **Module:** Shared Components
- **Current Behavior:** Some lists show blank screens while loading; errors fail silently.
- **Expected Behavior:** Standardized `LoadingSpinner`, `EmptyState` (with illustrations), and `ErrorCallout` in all main views.
- **Files to Change:**
  - `apps/frontend/pm-dashboard/src/components/shared/data-table.tsx`
  - All Dashboard `page.tsx` files.
- **Acceptance Criteria:**
  - [ ] No "blank" pages during network lag.
  - [ ] Empty lists show specific messaging (e.g., "No active projects found").
- **Test Plan:** Throttled network testing (Fast 3G).
- **Estimate:** M

#### FE-P1-002: Project/Stage Lifecycle UI
- **Severity:** P1
- **Module:** Projects / Stages
- **Current Behavior:** Stage "Complete" or "Activate" actions are missing or disabled.
- **Expected Behavior:** Buttons for `Activate`, `Complete`, `Block` (with reason) are functional.
- **Files to Change:**
  - `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/_components/stage-card.tsx`
- **API Contract:** `POST /stages/:id/activate`, `POST /stages/:id/complete`
- **Acceptance Criteria:**
  - [ ] Stage status updates reactively in UI.
- **Test Plan:** Manual transition of a project through all stages.
- **Estimate:** S

#### FE-P1-003: UX Safety (Destructive Action Confirmations)
- **Severity:** P1
- **Module:** Global
- **Current Behavior:** Archiving/Deleting happens instantly without warning.
- **Expected Behavior:** "Are you sure?" modal for all destructive actions.
- **Files to Change:**
  - `apps/frontend/pm-dashboard/src/components/shared/index.ts` (Add `ConfirmationModal`)
- **Acceptance Criteria:**
  - [ ] No accidental deletions possible.
- **Test Plan:** Manual click testing on all Delete/Archive buttons.
- **Estimate:** S

---

### [Not in this phase]
- **HOLD:** "Request Client Approval" UI (Dead button to remain or be hidden until `comm-service` ready).
- **HOLD:** External Approval Request Modal.
