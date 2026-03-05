# PM Feature Ticket: Templates

## Meta
- Feature ID: `PM-FEAT-002`
- Priority: `P0 -> P1`
- Owner Area: `pm-service` + `pm-dashboard`
- Current Status: `Backend near-complete, Frontend partial parity`

## Goal
Template module ko backend contract ke mutabiq fully usable banana:
- create/edit/archive/duplicate template
- stage/task/checklist lifecycle complete
- no dead buttons
- no invalid payloads

## Current Gaps (Verified)
1. Template detail `Template Settings` button dead hai.
2. Stage create call me `sortOrder: 0` ja sakta hai (DTO `Min(1)`).
3. Task create call me unsupported `priority` field bheja ja raha hai.
4. Checklist create call me required `checklistType` missing hai.
5. Task delete icon UI me hai lekin delete mutation wired nahi hai.
6. Reorder/dependency backend endpoints available hain, lekin UI flows missing hain.
7. Backend template cache invalidation stage/task/checklist writes ke baad fully consistent nahi.

## API Contracts (Reference)
- `POST /api/pm/templates`
- `PATCH /api/pm/templates/:id`
- `POST /api/pm/templates/:id/archive`
- `POST /api/pm/templates/:id/duplicate`
- `POST /api/pm/templates/:id/stages`
- `PATCH /api/pm/templates/:id/stages/reorder`
- `POST /api/pm/templates/stages/:stageId/tasks`
- `PATCH /api/pm/templates/stages/:stageId/tasks/reorder`
- `DELETE /api/pm/templates/tasks/:taskId`
- `POST /api/pm/templates/stages/:stageId/dependencies`
- `DELETE /api/pm/templates/stages/:stageId/dependencies/:depId`
- `POST /api/pm/templates/checklists`
- `PATCH /api/pm/templates/checklists/:checklistId`
- `DELETE /api/pm/templates/checklists/:checklistId`

## Execution Tickets

### TMP-P0-01 - Fix Invalid Frontend Payloads
Severity: `P0`

Scope:
- stage create payload DTO-compliant banao.
- task create payload se unsupported fields hatao.
- checklist create payload me mandatory `checklistType` add karo.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`

Acceptance:
- stage/task/checklist create actions 400 ke baghair succeed.
- frontend payloads DTO validation pass karein.

---

### TMP-P0-02 - Wire Task Delete Action
Severity: `P0`

Scope:
- task row delete icon ko real mutation (`DELETE /templates/tasks/:taskId`) se wire karo.
- delete pe confirmation modal mandatory.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`
- `apps/frontend/pm-dashboard/src/stores/ui-store.ts` (agar additional confirm config required ho)

Acceptance:
- task delete action works.
- accidental delete prevent hota hai (confirm required).

---

### TMP-P0-03 - Remove Dead "Template Settings" Action
Severity: `P0`

Scope (choose one and lock):
- Option A: button remove/hide until implemented, OR
- Option B: button ko existing edit template modal se wire karo.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/_components/template-form-modal.tsx` (if Option B)

Acceptance:
- template detail me koi dead CTA na rahe.

---

### TMP-P1-01 - Stage Reorder UI
Severity: `P1`

Scope:
- drag/drop ya move-up/down based stage reorder UI.
- save pe `PATCH /templates/:id/stages/reorder` call with full ID list.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`

Acceptance:
- reorder persist hota hai, refresh ke baad order retained.

---

### TMP-P1-02 - Task Reorder UI
Severity: `P1`

Scope:
- each stage ke tasks reorder karne ka UI.
- save pe `PATCH /templates/stages/:stageId/tasks/reorder` with full task IDs.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`

Acceptance:
- task order saved and reflected consistently.

---

### TMP-P1-03 - Stage Dependency UI (Minimal)
Severity: `P1`

Scope:
- stage card par dependency summary show karo.
- add/remove dependency actions provide karo (minimal modal/dropdown).

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/templates/[id]/page.tsx`

Acceptance:
- dependency create/delete from UI works.
- cycle/conflict errors user-friendly toast/callout me show hon.

---

### TMP-BE-P1-01 - Template Cache Invalidation Hardening
Severity: `P1`

Scope:
- stage/task/checklist writes ke baad template list/detail cache reliably invalidate karo.

Files:
- `apps/backend/pm-service/src/modules/templates/template-stages.service.ts`
- `apps/backend/pm-service/src/modules/templates/template-tasks.service.ts`
- `apps/backend/pm-service/src/modules/templates/template-checklists.service.ts`
- `apps/backend/pm-service/src/modules/templates/templates.service.ts` (if shared helper exposed)

Acceptance:
- create/update/delete/reorder ke baad stale template detail/list serve na ho.

## Definition of Done
- Template feature ke P0 tickets complete.
- No dead buttons in template pages.
- All template CRUD-related frontend actions backend DTOs ke mutabiq.
- Build/lint green for touched apps/services.

## Test Plan
1. Create template -> open detail -> add stage -> add task -> add checklist.
2. Edit checklist inline, delete checklist.
3. Delete task with confirmation.
4. Archive + duplicate template from list page.
5. (P1) Reorder stages/tasks and verify persistence.
6. Hard refresh ke baad data consistency (cache stale issue absent).

## Out of Scope (This Feature Ticket)
- Client approval execution flow
- Template analytics dashboards
- Advanced dependency graph visualization
