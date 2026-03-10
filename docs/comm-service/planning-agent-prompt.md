# Comm Service Planning Agent Prompt

Use this prompt with Claude or another planning-focused coding agent.

```text
You are not implementing code in this pass.

You are producing a locked execution plan and ticket pack for `comm-service` in this repository.

Your job is to create a production-ready planning set inside `docs/comm-service/`.

Read these sources first and treat them as the current repo truth:

1. docs/comm-service/README.md
2. docs/comm-service-architecture.md
3. docs/deployment/testinglinq-vps.md
4. apps/backend/comm-service/**
5. apps/frontend/sales-dashboard/**
6. apps/frontend/pm-dashboard/**

Source-of-truth rule:

- Treat the codebase as the primary source of truth
- Treat older comm docs as secondary context only
- Do not assume `docs/comm-backend-ticket-pack.md` or `docs/comm-frontend-ticket-pack.md` are complete or accurate
- If old docs conflict with the code, prefer the code
- If old docs have gaps, derive the missing truth from code exploration and the stated product goals

Product goal:

The portal should become the primary place where users handle email work instead of switching to Gmail.

The resulting plan must cover:

- Gmail OAuth connect/reconnect flow
- user-scoped vs admin-visible identity model
- inbox, threads, messages, and timeline correctness
- read/unread accuracy
- new-mail notifications and sidebar badge correctness
- reply/send/forward reliability
- Gmail-like UX improvements where needed
- sync and token-refresh reliability
- production readiness, observability, and regression protection

Do not produce a refactor-only plan.

Do not anchor the plan to outdated comm docs.

Build the plan from:

- actual backend behavior in `apps/backend/comm-service`
- actual frontend behavior in `apps/frontend/sales-dashboard`
- actual frontend behavior in `apps/frontend/pm-dashboard`
- the current product intent and live issues visible in the repo

Refactors are allowed only when they clearly support:

- product correctness
- reliability
- testability
- maintainability of active bug areas

Your deliverables must be written as docs files under `docs/comm-service/`.

Required output files:

1. `docs/comm-service/current-state-audit.md`
2. `docs/comm-service/master-plan.md`
3. `docs/comm-service/phase-01-foundations.md`
4. `docs/comm-service/phase-02-identity-and-access.md`
5. `docs/comm-service/phase-03-inbox-and-threading.md`
6. `docs/comm-service/phase-04-compose-reply-and-send.md`
7. `docs/comm-service/phase-05-notifications-and-unread.md`
8. `docs/comm-service/phase-06-production-readiness.md`
9. `docs/comm-service/backend-ticket-pack.md`
10. `docs/comm-service/frontend-ticket-pack.md`
11. `docs/comm-service/qa-ticket-pack.md`
12. `docs/comm-service/verification-matrix.md`

Planning rules:

1. First audit the current implementation and list:
   - what already works
   - what partially works
   - what is broken
   - what is architecturally unclear
   - what is missing for production
   - what existing docs appear stale, incomplete, or misleading

2. Then define a locked execution order by phase.

3. Each phase must be broken into features or modules.

4. Each feature must be broken into tickets.

5. Each ticket must be broken into small agent tasks.

6. Every task must include:
   - exact scope
   - output expectation
   - verification expectation

7. Every ticket must include:
   - ticket id
   - title
   - why this ticket exists
   - affected backend files/modules
   - affected frontend files/modules
   - acceptance criteria
   - tests to run
   - evidence expected before closure
   - dependencies
   - explicit non-goals

8. Every phase must define:
   - entry criteria
   - exit criteria
   - risk notes
   - rollback or fallback notes if relevant

9. No ticket should be considered complete until all required tests pass.

10. Test planning must be specific. Include:
   - unit tests
   - integration tests
   - API contract tests where needed
   - websocket/realtime verification where needed
   - manual smoke tests where automation is not practical

11. The plan must account for both backend and frontend changes. Do not leave frontend as a vague follow-up.

11a. If current docs are incomplete, write the missing planning context explicitly instead of inheriting outdated assumptions.

12. The plan must explicitly cover permission behavior:
   - standard user mailbox visibility
   - admin cross-mailbox visibility
   - send/reply authority rules
   - audit implications

13. The plan must explicitly cover unread behavior:
   - how unread is stored
   - how badge counts are derived
   - how reload persistence works
   - how websocket events interact with server truth

14. The plan must explicitly cover Gmail-like UX expectations:
   - thread list behavior
   - thread detail behavior
   - reply enablement/disablement rules
   - sender selection
   - empty states
   - reconnect/error handling
   - polling/realtime freshness expectations

15. The plan must explicitly cover production readiness:
   - env and secret handling
   - background worker reliability
   - degraded identity handling
   - logging and metrics
   - operational runbooks
   - regression testing before deploy

Ticket writing rules:

- keep tickets small enough for an agent to complete in a focused pass
- do not mix unrelated backend and frontend concerns into one giant ticket
- do not create hand-wavy tickets like "fix bugs"
- if a feature is risky, split it into schema/API/UI/testing tickets
- if a ticket changes contracts, include required follow-up tickets

Required planning themes:

Phase 1: Foundations and current-state audit
Phase 2: Identity ownership, org/admin visibility, and access rules
Phase 3: Inbox/thread/message correctness and data model fixes
Phase 4: Compose/reply/send/reconnect behavior
Phase 5: Realtime notifications, unread counts, badges, and UX polish
Phase 6: Production hardening, observability, test stabilization, and rollout readiness

Expected quality bar:

- implementation-ready
- phase-ordered
- dependency-aware
- test-gated
- explicit enough that an agent cannot silently skip important work

When you finish, the docs should be clear enough that future implementation agents can work ticket-by-ticket without replanning the entire comm-service.
```
