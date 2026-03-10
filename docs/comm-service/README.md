# Comm Service Planning Pack

Status: Planning handoff pack
Purpose: Give a planning-focused agent a strict structure to produce a locked, production-ready roadmap and ticket breakdown for `comm-service`.

## Goal

Turn `comm-service` into a production-ready communication system where:

- users can operate email from inside the portal instead of living in Gmail
- Gmail accounts are connected through OAuth, not raw password capture
- inbox, unread, notifications, reply, compose, and sync behavior are reliable
- permissions are explicit:
  - normal users see only what they should see
  - admins can monitor org-connected identities where product rules allow it
- backend, frontend, QA, and rollout work are all planned and test-gated

## What This Pack Is For

This pack is not the implementation itself.

This pack is for producing:

- a locked multi-phase execution plan
- feature-by-feature tickets
- small task breakdowns for each ticket
- acceptance criteria per ticket
- explicit verification steps per ticket
- backend + frontend + QA coverage

## Required Planning Principles

- plan by phases first
- break phases into modules/features
- break features into tickets
- break tickets into small agent tasks
- every task must define expected output
- no ticket is complete until verification passes
- verification must include automated tests where practical
- user-facing bugs and product gaps must be planned, not only refactors

## Primary Product Themes The Plan Must Cover

1. Gmail connection and OAuth reliability
2. identity ownership and visibility rules
3. inbox/thread/message correctness
4. unread state, read state, and badge accuracy
5. reply/send/forward reliability
6. notifications and realtime updates
7. Gmail-like usability improvements in portal UX
8. sync reliability, token lifecycle, background jobs
9. admin oversight and mailbox visibility rules
10. production hardening, observability, and regression coverage

## Suggested Output Files

The planning agent should create or update these files:

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

## Recommended Read Order For The Planning Agent

1. `docs/comm-service-architecture.md`
2. `docs/comm-backend-ticket-pack.md`
3. `docs/comm-frontend-ticket-pack.md`
4. `docs/deployment/testinglinq-vps.md`
5. `apps/backend/comm-service`
6. `apps/frontend/sales-dashboard`
7. `apps/frontend/pm-dashboard`
8. `docs/comm-service/planning-agent-prompt.md`
9. `docs/comm-service/ticket-template.md`

## Delivery Rule

The planning output should be implementation-ready.

That means:

- no vague buckets like "fix inbox"
- no giant tickets with mixed concerns
- no acceptance criteria without measurable output
- no phase can hide testing in a later phase

Every feature slice should make it obvious:

- what backend changes are needed
- what frontend changes are needed
- what permission rules apply
- what tests must pass
- what evidence proves the slice is done
