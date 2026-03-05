# PM Feature Ticket: Projects (Frontend Backend-Parity)

## Meta
- Feature ID: `PM-FEAT-004`
- Scope: `Frontend only (pm-dashboard)`
- Target: `Projects UI parity with current pm-service contracts`
- Constraint: `Client approval execution remains HOLD`

## Completion Definition (for current backend)
Frontend must fully support currently-available backend project capabilities:
- create project
- list projects (paginated + backend-supported filters used by UI)
- project detail
- update project metadata
- stage/task execution from project detail where backend endpoints already exist

Not required in this phase:
- project archive/delete (no dedicated projects endpoint in current controller)
- external/client approval execution flow (HOLD)
- timeline page (no dedicated timeline endpoint exposed)

## Backend Contract (Reference)
- `POST /api/pm/projects`
- `GET /api/pm/projects`
- `GET /api/pm/projects/:id`
- `PATCH /api/pm/projects/:id`
- `GET /api/pm/projects/:projectId/stages`
- `POST /api/pm/stages/:id/activate`
- `POST /api/pm/stages/:id/complete`
- `POST /api/pm/stages/:id/block`
- `POST /api/pm/stages/:id/unblock`
- `POST /api/pm/stages/:id/skip`
- `GET /api/pm/stages/:stageId/tasks`
- `POST /api/pm/stages/:stageId/tasks?projectId=:id`
- `GET /api/pm/tasks/:id`
- `PATCH /api/pm/tasks/:id`

## Verified Current Gaps
1. `Project Settings` button disabled/dead on project detail.
2. `Timeline` button disabled/dead on project detail.
3. Stage lifecycle actions not wired in stage cards (`activate/complete/block/unblock/skip`).
4. Stage card action menu is non-functional (`MoreVertical` placeholder).
5. Task rows in stage card look actionable but no task detail open behavior.
6. Project list filters are partial vs backend DTO capability.
7. No explicit UX note in-project for HOLD status of client approval execution.

## Tickets

### PRJ-FE-P0-01 - Project Settings Flow (Update Metadata)
Severity: `P0`

Scope:
- Wire `Project Settings` CTA to real edit flow.
- Implement update form with backend-supported fields only:
  - `name`, `description`, `status`, `priority`, `healthStatus`, `deliveryDueAt`, `clientId`
- Use `PATCH /projects/:id` and refresh list/detail cache.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/_components/project-settings-modal.tsx` (new)
- `apps/frontend/pm-dashboard/src/hooks/use-projects.ts` (if key invalidation refinement needed)

Acceptance:
- Update succeeds without sending unsupported fields.
- Updated values reflect immediately on detail and list views.

---

### PRJ-FE-P0-02 - Stage Lifecycle Actions in Project Detail
Severity: `P0`

Scope:
- Replace placeholder stage actions with real mutations:
  - Activate, Complete, Block (reason required), Unblock, Skip (optional stages only)
- Surface backend validation errors (dependency rules, required tasks incomplete).
- Invalidate stage/task queries after mutation.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/_components/stage-card.tsx`

Acceptance:
- All supported lifecycle actions callable from UI.
- Invalid transitions show clear user feedback (toast/callout).

---

### PRJ-FE-P0-03 - Task Drill-Down from Stage Card
Severity: `P0`

Scope:
- Make task rows open task detail drawer/sheet.
- Ensure task actions (start/submit/assign/block/worklog) remain usable from project context.
- Avoid dead “action icon” behavior.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/_components/stage-card.tsx`
- `apps/frontend/pm-dashboard/src/components/shared/tasks/task-detail-drawer.tsx` (new or shared extraction)
- `apps/frontend/pm-dashboard/src/app/dashboard/my-tasks/_components/task-detail-drawer.tsx` (if shared migration)

Acceptance:
- Clicking a task from project stages opens detail panel reliably.
- Mutations from drawer revalidate project-stage task data.

---

### PRJ-FE-P0-04 - Project List Filter Parity (Pragmatic)
Severity: `P0`

Scope:
- Extend filter bar with currently high-value backend filters not yet exposed:
  - `priority`, `healthStatus`, `projectType`
- Keep existing filters (`search`, `status`, `brandId`, `serviceType`).
- URL query state + API params stay in sync.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/page.tsx`

Acceptance:
- Applied filters are reflected in URL and backend query.
- Pagination works correctly with active filters.

---

### PRJ-FE-P1-01 - Remove/Replace Dead Timeline CTA
Severity: `P1`

Scope:
- Since no timeline endpoint exists in this phase:
  - remove button, OR
  - convert to non-interactive info label with explicit “not available yet”.
- No dead disabled control should remain.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/page.tsx`

Acceptance:
- No misleading dead timeline button on detail page.

---

### PRJ-FE-P1-02 - HOLD Clarity for Client Approval Execution
Severity: `P1`

Scope:
- Keep client approval execution disabled as per hold.
- Improve contextual note to explain dependency (`deliverable + comm-service/client portal flow`).
- Ensure read-only approval log remains available.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/page.tsx`

Acceptance:
- Users clearly understand why action is unavailable.
- No invalid API call attempts for approval request creation.

---

### PRJ-BE-P2-01 - Project Archive/Cancel Policy Endpoint (Optional Next)
Severity: `P2`

Scope:
- Decide and implement one policy:
  - dedicated archive endpoint (`POST /projects/:id/archive`) OR
  - strict cancel semantics via `PATCH status=CANCELLED` with guard rules
- Align controller/docs/UI expectations.

Files:
- `apps/backend/pm-service/src/modules/engagements-projects/projects.controller.ts`
- `apps/backend/pm-service/src/modules/engagements-projects/projects.service.ts`
- DTO/docs updates

Acceptance:
- Project lifecycle closure behavior is explicit and API-level consistent.

## Test Plan
1. Create project (with and without template), verify stage/task generation behavior.
2. Open project detail, edit metadata via settings, verify immediate refresh.
3. Run stage lifecycle actions across valid and invalid transitions.
4. Open task detail from stage card and execute at least one mutation.
5. Apply project list filters + pagination; verify URL/API sync.
6. Confirm no dead timeline/settings controls remain.

## Definition of Done
- Feature 4 frontend has no dead CTA for implemented backend paths.
- All P0 tickets above are complete.
- All touched pages build successfully.
- Client approval execution remains safely on HOLD (explicit UX note, no fake flow).
