# PM Service Backend Ticket Pack

Status: Ready for backend agent handoff
Purpose: Give a backend agent a concrete implementation queue for `pm-service`.

## Delivery Rules

- backend-first slices only
- each ticket should be independently reviewable
- all endpoints must be tenant-scoped
- all list endpoints must be paginated
- every hot table must ship with indexes
- rate limiting, cache strategy, and query shape must be considered while building

## Phase A: Service Bootstrap and Foundations

### `PM-BE-001` Bootstrap `pm-service`

Scope:

- create `apps/backend/pm-service`
- add NestJS bootstrap
- add configuration module
- add health endpoint
- add global validation
- add `/api/pm` base prefix

Acceptance criteria:

- service boots locally
- environment variables are documented in code
- module layout is ready for domain modules

### `PM-BE-002` Wire Postgres access for `pm-service`

Scope:

- define how `pm-service` consumes Prisma or a PM-specific Prisma client path
- prepare PM schema ownership strategy
- ensure tenant-aware DB access conventions are explicit

Acceptance criteria:

- backend can read and write PM domain tables cleanly
- ownership boundaries with `core-service` are documented in code comments or module naming

### `PM-BE-003` Create PM shared enums, DTO base types, and route conventions

Scope:

- add PM enums
- add pagination DTOs
- add shared PM response patterns
- freeze route naming

Acceptance criteria:

- first PM controllers can be implemented without naming drift

## Phase B: Template Engine

### `PM-BE-004` Implement template schema and migrations

Scope:

- `pm_service_templates`
- `pm_template_stages`
- `pm_template_stage_dependencies`
- `pm_template_tasks`
- `pm_template_checklists`

Acceptance criteria:

- migrations apply
- indexes exist for template list and stage ordering

### `PM-BE-005` Build template CRUD APIs

Scope:

- template create/list/detail/update/archive
- template duplicate

Acceptance criteria:

- org-scoped validation is enforced
- paginated list exists
- duplicate creates a safe copy

### `PM-BE-006` Build template stage, task, and dependency APIs

Scope:

- stage CRUD and reorder
- task CRUD and reorder
- dependency CRUD
- checklist CRUD

Acceptance criteria:

- cycle detection exists for dependencies
- stage and task ordering stays stable after edits

## Phase C: Engagements and Project Creation

### `PM-BE-007` Implement engagement and project schema

Scope:

- `pm_engagements`
- `pm_projects`
- `pm_project_stages`
- `pm_stage_dependencies`
- `pm_tasks`

Acceptance criteria:

- project creation can target client-owned or internal-brand-owned work
- project, stage, and task indexes are included

### `PM-BE-008` Build manual engagement and project CRUD APIs

Scope:

- create/list/detail/update for engagements
- create/list/detail/update for projects

Acceptance criteria:

- all queries are paginated where list-shaped
- project detail is separate from project list summary

### `PM-BE-009` Build template-to-project generation flow

Scope:

- generate stages from template
- generate starter tasks from template
- copy dependency graph into runtime stage dependencies

Acceptance criteria:

- one request can create a ready project skeleton
- created project is internally consistent

## Phase D: Stage and Task Execution

### `PM-BE-010` Build stage operations

Scope:

- stage detail
- stage update
- lead ownership update
- block/unblock
- skip optional stage
- activate eligible next stages

Acceptance criteria:

- dependency checks are enforced
- invalid activation is rejected

### `PM-BE-011` Build task CRUD and assignment APIs

Scope:

- task create/update/detail/list
- assign
- claim
- reassign
- block/unblock

Acceptance criteria:

- assignment history is preserved in `pm_task_assignments`
- task lists are index-friendly and paginated

### `PM-BE-012` Build task worklogs and "my tasks" query paths

Scope:

- worklog create/list
- assignee-centric task lists
- due-soon and blocked filters

Acceptance criteria:

- `my tasks` endpoints are optimized for assignee and status filters

## Phase E: QC, Revisions, and Approvals

### `PM-BE-013` Build submission and self-QC flow

Scope:

- create task submission
- store self-QC responses
- update task state

Acceptance criteria:

- multiple submissions per task are supported
- a submission freezes the review target

### `PM-BE-014` Build QC review and bypass flow

Scope:

- QC approve/reject
- rejection feedback
- bypass records
- escalation hook points

Acceptance criteria:

- bypass requires reason
- review history is immutable

### `PM-BE-015` Build revision, deliverable, and approval flows

Scope:

- revision requests
- deliverable package creation
- approval request creation
- approval decision capture
- project closeout

Acceptance criteria:

- both internal and external approval targets are supported
- approval snapshots are immutable

## Phase F: Threads, Files, and Events

### `PM-BE-016` Build thread and message APIs

Scope:

- thread create/detail
- message create/edit
- replies
- mentions

Acceptance criteria:

- messages are paginated by thread
- mention records are explicit, not string-only

### `PM-BE-017` Build file metadata and linking layer

Scope:

- file asset
- file version
- file link
- signed URL request path
- upload completion path

Acceptance criteria:

- files are reusable across scopes
- versioning is append-only

### `PM-BE-018` Emit first PM domain events

Scope:

- emit:
  - `pm.project_created`
  - `pm.task_assigned`
  - `pm.task_submitted`
  - `pm.qc_review_completed`
  - `pm.mention_created`
  - `pm.approval_requested`
  - `pm.approval_decided`

Acceptance criteria:

- event payloads match `docs/phase-0-event-contracts.md`

## Phase G: Hardening and Performance

### `PM-BE-019` Add rate limiting, safe caching, and query guards

Scope:

- rate-limit write-heavy endpoints
- identify cache-safe read endpoints
- enforce hard tenant scoping everywhere

Acceptance criteria:

- no cache is added to mutating flows
- all cache keys are tenant-aware

### `PM-BE-020` Add performance indexes, list optimization, and seed data

Scope:

- finalize DB indexes for hot read paths
- verify list endpoints return summary shapes
- add seed data for PM flows

Acceptance criteria:

- local seeded testing is possible
- no obvious full-tree list endpoints remain

### `PM-BE-021` Add integration tests for the first vertical slices

Scope:

- template creation
- project creation from template
- task assignment
- submission and QC review

Acceptance criteria:

- backend critical paths have automated coverage

## Recommended Backend Build Order

1. `PM-BE-001` to `PM-BE-003`
2. `PM-BE-004` to `PM-BE-009`
3. `PM-BE-010` to `PM-BE-012`
4. `PM-BE-013` to `PM-BE-015`
5. `PM-BE-016` to `PM-BE-018`
6. `PM-BE-019` to `PM-BE-021`
