# PM Service Backend Agent Prompt

Use this prompt with a backend-focused coding agent.

```text
You are implementing the backend foundation for `pm-service` in this repository.

Read these files first and treat them as the current source of truth for this task:

1. docs/phase-0-service-boundaries.md
2. docs/pm-system-baseline.md
3. docs/pm-service-schema-outline.md
4. docs/phase-0-event-contracts.md
5. docs/pm-service/feature-01-template-engine.md
6. docs/pm-service/feature-02-engagements-projects.md
7. docs/pm-service/feature-03-stage-task-workflows.md
8. docs/pm-service/feature-04-qc-approvals.md
9. docs/pm-service/feature-05-threads-files-notifications.md
10. docs/pm-service/backend-ticket-pack.md

Your target for this pass:

- start backend work only
- do not build frontend in this pass
- follow backend-first vertical slices
- keep the implementation performance-aware from day one

Implementation priorities:

1. Bootstrap `apps/backend/pm-service`
2. Establish PM domain module structure
3. Prepare PM schema path and migrations
4. Implement the first backend slice:
   - templates
   - engagements
   - projects
   - project stages
   - tasks

Required engineering rules:

- every list endpoint must be paginated
- every list query must be tenant-scoped
- all hot tables must ship with indexes
- avoid N+1 loading patterns
- write-heavy endpoints should be ready for rate limiting
- do not build giant nested list payloads
- keep route naming aligned with the docs
- preserve clear service boundaries:
  - `core-service` owns auth, org, users, CRM, billing
  - `pm-service` owns PM workflow state
  - `comm-service` owns communication delivery

Do not:

- put PM domain logic into `core-service`
- mix communication delivery logic into `pm-service`
- hardcode templates in source instead of storing them
- skip validation for organization and brand ownership

Expected output:

- real code changes in the repo
- a concise summary of what was implemented
- a list of any blockers or assumptions
- mention which backend tickets from `docs/pm-service/backend-ticket-pack.md` were completed or partially completed
```
