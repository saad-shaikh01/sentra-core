# Phase 0 Agent Tickets

Status: Ready
Purpose: Define the first bounded work packages for Phase 0 and the first implementation wave after Phase 0 approval.

## Delivery Rule

The team will use backend-first feature slices.

For each feature slice:

1. backend implementation lands first
2. backend is merged into `integration`
3. local verification happens
4. frontend is built against the merged backend
5. the full slice is tested again locally

This rule is the default development flow unless a planning-only task is explicitly assigned.

## Branch and Worktree Naming

Branch naming:

- `arch/*` for architecture and planning implementation
- `feat/*` for new feature work
- `fix/*` for defect work
- `docs/*` for documentation work

Worktree naming:

- `sentra-arch-phase0`
- `sentra-pm-foundation`
- `sentra-platform-shell`

Recommended branch to worktree mapping:

- `arch/phase-0-foundation` -> `sentra-arch-phase0`
- `feat/pm-service-bootstrap` -> `sentra-pm-foundation`
- `feat/platform-shell-foundation` -> `sentra-platform-shell`

## Phase 0 Ticket: Architecture Owner

### `ARCH-001`

Title:

- Lock service boundaries and shared contracts

Owner:

- Architecture agent

Suggested branch:

- `arch/phase-0-foundation`

Suggested worktree:

- `sentra-arch-phase0`

In scope:

- finalize service boundaries for `api-gateway`, `core-service`, `pm-service`, `comm-service`, and future `hrms-service`
- convert the PM conceptual entity map into a schema outline
- define the first stable shared enums and IDs
- define the first inter-service event contracts
- define naming and module conventions
- define domain and host resolution assumptions

Out of scope:

- full production implementation of business features
- frontend UI work

Acceptance criteria:

- service boundary document exists and is internally consistent
- first ADR set exists
- PM schema outline is ready for implementation
- first event list is ready
- initial branch and worktree naming is frozen

Verification:

- reviewed against product direction
- reviewed against multi-agent execution plan

## First Implementation Wave After Phase 0 Approval

These are the first three bounded agent streams after `ARCH-001` is accepted.

### `PLAT-001`

Title:

- Bootstrap `pm-service`

Owner:

- Backend platform agent

Suggested branch:

- `feat/pm-service-bootstrap`

Suggested worktree:

- `sentra-pm-foundation`

In scope:

- scaffold `apps/backend/pm-service`
- add base NestJS bootstrap
- add config and health path
- prepare Postgres integration path
- create PM module layout
- prepare shared auth verification assumptions

Out of scope:

- full PM feature implementation
- gateway routing
- frontend

Acceptance criteria:

- `pm-service` boots
- structure is ready for schema and module implementation
- base folders match agreed domain layout

### `PLAT-002`

Title:

- Activate `api-gateway` and `comm-service` foundations

Owner:

- Platform routing and communication agent

Suggested branch:

- `feat/platform-shell-foundation`

Suggested worktree:

- `sentra-platform-shell`

In scope:

- turn `api-gateway` into a real routing shell
- add request context model
- prepare host-to-brand resolution path
- turn `comm-service` into a real communication foundation
- define notification and outbound mail bootstrap structure

Out of scope:

- full PM domain logic
- deep frontend work

Acceptance criteria:

- gateway no longer behaves like a starter app
- comm-service no longer behaves like a starter app
- routing and communication foundations are ready for feature slices

### `PLAT-003`

Title:

- Prepare frontend shell for internal modules and brand-aware client portal

Owner:

- Frontend foundation agent

Suggested branch:

- `feat/frontend-multibrand-shell`

Suggested worktree:

- `sentra-portal-shell`

In scope:

- align the internal app shell for Sales, PM, and future HRMS modules
- prepare client portal shell beyond starter state
- define brand-aware theming and host context approach
- prepare routing assumptions for white-label portal access

Out of scope:

- full PM screens
- final client portal business flows
- backend domain implementation

Acceptance criteria:

- internal shell is ready for new modules
- client portal shell is ready for brand-based rendering
- frontend assumptions align with gateway/domain decisions

## Practical Order of Work

1. Complete `ARCH-001`
2. Review and approve the Phase 0 outputs
3. Start `PLAT-001` and `PLAT-002` in parallel
4. Start `PLAT-003` once host/domain assumptions are stable enough for frontend shell work
5. Begin backend-first feature slices after the platform foundations are merged into `integration`

## First Backend-First Feature Slice Recommendation

After the platform foundations are merged, the first true vertical feature slice should be:

- project template creation in backend
- project creation API in backend
- local verification
- then frontend admin UI for templates and project creation

This is the safest first PM slice because it unlocks later workflow features without forcing full task/QC UI on day one.
