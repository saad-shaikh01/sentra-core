# PM Service Documentation Pack

Status: Phase 0 handoff pack
Purpose: Give a backend agent enough structure to start `pm-service` implementation without re-planning the domain.

## What This Pack Covers

- PM domain scope
- feature-by-feature backend requirements
- backend-first ticket breakdown
- frontend follow-up ticket breakdown
- performance expectations
- implementation order
- a ready prompt for a backend agent such as Claude

## Read Order

1. `docs/phase-0-service-boundaries.md`
2. `docs/pm-system-baseline.md`
3. `docs/pm-service-schema-outline.md`
4. `docs/phase-0-event-contracts.md`
5. `docs/pm-service/feature-01-template-engine.md`
6. `docs/pm-service/feature-02-engagements-projects.md`
7. `docs/pm-service/feature-03-stage-task-workflows.md`
8. `docs/pm-service/feature-04-qc-approvals.md`
9. `docs/pm-service/feature-05-threads-files-notifications.md`
10. `docs/pm-service/backend-ticket-pack.md`
11. `docs/pm-service/backend-agent-prompt.md`

## Backend-First Delivery Rule

Each feature slice should be delivered like this:

1. backend schema and APIs
2. merge backend into `integration`
3. local verification
4. frontend implementation against the merged backend
5. end-to-end local verification

## First Recommended Backend Slice

Do not start with files or full QC.

Start with the smallest useful chain:

- templates
- engagements
- projects
- stages
- tasks

This gets the core PM engine visible quickly and unlocks all later feature layers.

## Performance Expectations

The PM service should be performance-aware from day one:

- all list endpoints are paginated
- all list endpoints are tenant-scoped
- avoid N+1 relation loading
- add indexes with each hot table
- cache only read-heavy summaries and lists
- use rate limits on write-heavy endpoints
- move slow work to async processing when possible

## Current Schema Reality

The current Prisma schema only covers the core CRM and billing domain. There are no PM models yet.

Use:

- `docs/schema-review-notes.md`

before attempting to mix PM tables into the current model.
