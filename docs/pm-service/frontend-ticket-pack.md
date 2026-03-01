# PM Service Frontend Ticket Pack

Status: Follow-up ticket pack for frontend agents after backend slices land
Purpose: Ensure frontend work stays aligned with backend-first delivery and performance constraints.

## Frontend Rules

- build against merged backend APIs, not guessed contracts
- prefer server-side pagination
- use route-level and component-level code splitting
- keep role-based views focused:
  - PM sees projects first
  - lead sees stages first
  - team member sees tasks first
- optimize for real work speed, not only visual polish

## Shared UI Direction

Recommended architecture:

- move reusable primitives into a shared frontend library
- keep app-specific composite components inside each app

Good shared candidates:

- buttons
- inputs
- labels
- badges
- cards
- dialogs
- toasts
- table shell primitives
- pagination primitives
- empty states
- loading skeletons

Do not force all app-specific layouts into one shared library.

Keep local to the app:

- PM board lanes
- client-portal approval cards
- sales-specific modals
- module-specific shells

## Phase A: Frontend Foundation

### `PM-FE-001` Create shared frontend UI library

Scope:

- extract stable primitives from `sales-dashboard`
- create a reusable UI package structure
- keep theme tokens and base styles centralized

Acceptance criteria:

- at least the current primitive components can be reused by `sales-dashboard` and `client-portal`

### `PM-FE-002` Create shared data-view primitives

Scope:

- paginated table shell
- list skeletons
- empty state
- filter bar shell
- status badge primitives

Acceptance criteria:

- data-heavy modules do not duplicate the same table mechanics in each app

## Phase B: PM Shell

### `PM-FE-003` Build PM route shell in the internal app

Scope:

- add PM navigation entry
- create PM layout shell
- add loading and error boundaries

Acceptance criteria:

- PM section can host the first backend-driven screens cleanly

### `PM-FE-004` Build project and engagement list screens

Scope:

- paginated project list
- engagement list
- filtering by status, brand, service type, due date

Acceptance criteria:

- list screens use server-side pagination
- project list does not fetch full project trees

## Phase C: Template and Project Creation

### `PM-FE-005` Build template management UI

Scope:

- template list
- template create/edit
- stage and starter task editor

Acceptance criteria:

- template editing works against the real template APIs

### `PM-FE-006` Build project creation UI

Scope:

- create engagement
- create project
- select template
- preview generated stages

Acceptance criteria:

- generation flow uses backend-generated structures, not local stage mocks

## Phase D: Workflow UI

### `PM-FE-007` Build PM project workspace

Scope:

- stage-centric project view
- expandable stage cards
- summary counts

Acceptance criteria:

- stage expansion lazy-loads deeper task data where possible

### `PM-FE-008` Build lead stage queue and task management

Scope:

- lead sees owned stages
- lead can assign and reassign tasks
- task create and edit

Acceptance criteria:

- task actions update server state cleanly and refresh only required queries

### `PM-FE-009` Build team member "My Tasks" view

Scope:

- assignee-centric task list
- due-soon and blocked filters
- task detail drawer

Acceptance criteria:

- task lists are paginated or cursor-based if large
- task detail is loaded on demand

## Phase E: Review, Files, and Communication

### `PM-FE-010` Build review queue and QC screens

Scope:

- reviewer queue
- submission detail
- approve/reject flow

### `PM-FE-011` Build file upload and file reference UX

Scope:

- upload intent flow
- file version display
- linked file references in task and message context

### `PM-FE-012` Build thread UX

Scope:

- project, stage, and task discussion panes
- replies
- mentions
- unread state

## Frontend Performance Requirements

- use server-side pagination for large lists
- do not prefetch every nested relation
- code-split PM routes and heavy modals
- lazy-load task detail, reviews, and thread history
- show lightweight skeleton states
- keep query keys tenant-aware and role-aware
- prefer incremental fetch over giant workspace payloads
