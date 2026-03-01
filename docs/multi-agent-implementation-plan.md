# Multi-Agent Implementation Plan

Status: Working execution plan
Purpose: Define how to implement the full SaaS product using 2-3 parallel agents without creating avoidable merge conflicts or architectural drift.

## Product Context

The target is the full SaaS platform, not only the PM module.

Planned product domains:

- CRM / Sales
- PM / production workflow
- Client portal
- Communication service
- Future HRMS
- Shared multi-tenant SaaS platform

The implementation strategy must support:

- multi-tenant access
- multi-brand white-label portals
- scalable service separation
- performance-aware development from day one

## Core Delivery Strategy

Use phased parallelism.

This means:

- work in parallel only after shared contracts are locked
- use separate branches and worktrees for each agent
- avoid overlapping ownership on shared contracts, schema definitions, and gateway integration points

Recommended branch flow:

- `main` = stable production-intent branch
- `integration` = merge and verification branch
- each agent gets one bounded feature branch

Recommended work rule:

- no direct merge to `main`
- merge into `integration`
- verify locally
- then promote to `main`

## Phase 0: Foundation Lock

This phase should be handled by one architecture-focused agent first.

Goal:

- lock the foundation so later parallel work is safe

Primary outputs:

- service boundaries
- shared domain contracts
- initial ADRs
- PM entity map translated into schema outline
- naming conventions
- cross-service event list

Key deliverables:

1. Final service responsibility document
2. Initial schema outline for `pm-service`
3. Shared enums and stable cross-service types
4. Event contract list for inter-service workflows
5. Branch and worktree naming convention

Suggested owner:

- architecture-focused agent such as Codex

Suggested branch:

- `arch/platform-boundaries`

Why this phase is required:

- without a locked foundation, parallel agents will collide on schema, auth assumptions, type contracts, and service responsibilities

## Phase 1: Platform Skeleton

After Phase 0 is accepted, two agents can work in parallel.

### Agent 1: Backend Platform

Suggested branch:

- `feat/pm-service-bootstrap`

Responsibilities:

- scaffold `pm-service`
- add NestJS bootstrap and config layout
- define Postgres integration strategy
- create base module structure
- prepare shared auth verification path
- establish service folder conventions

### Agent 2: Gateway Activation

Suggested branch:

- `feat/api-gateway-routing`

Responsibilities:

- turn `api-gateway` into a real routing service
- define route forwarding structure
- establish auth validation strategy
- define request context injection
- prepare brand/domain resolution middleware

This phase is about architecture shell, not full feature implementation.

## Phase 2: Domain Build

Once service boundaries and platform skeleton are ready, three agents can work safely in parallel.

### Agent 1: PM Service Core

Suggested branch:

- `feat/pm-core-domain`

Responsibilities:

- PM schema
- templates
- engagements
- projects
- stages
- tasks
- assignment model
- lifecycle statuses
- initial PM APIs

### Agent 2: Comm Service Foundation

Suggested branch:

- `feat/comm-service-foundation`

Responsibilities:

- notification model
- outbound mail pipeline
- event consumer setup
- mention notification hooks
- Mongo communication models

Start with internal notifications and outbound communication first.

### Agent 3: Frontend Product Shell

Suggested branch:

- `feat/frontend-platform-shell`

Responsibilities:

- make the internal frontend multi-module ready
- prepare Sales / PM / future HRMS navigation
- turn the client portal into a real shell
- prepare brand-aware theming structure
- prepare host/domain-based brand context handling

## Phase 3: Workflow Features

With the PM domain in place, feature-level streams can run in parallel.

### Workflow Engine Stream

- stage dependencies
- controlled parallel stages
- self-QC
- QC review
- bypass records
- approval flow
- revision flow

### Files and Communication Stream

- file asset/version/link model
- signed URL flow
- project/stage/task threads
- replies
- mentions
- attachments

### PM Frontend Stream

- PM workspace
- stage board
- my tasks
- review queue
- approval queue
- task drawer
- file UX

## Phase 4: SaaS and White-Label Layer

This phase makes the product commercially usable as a hosted SaaS platform.

Key scope:

- subscription plans
- feature gating
- tenant provisioning
- payment profile onboarding
- brand domain configuration
- host-based brand routing
- white-labeled client portal access

Recommended domain direction:

- internal staff app on central domain
- public API on central API domain
- brand-based client portals on brand-specific domains or subdomains

## Phase 5: HRMS Domain

This phase should start after the PM and SaaS core is stable.

Recommended branch:

- `feat/hrms-foundation`

Planned scope:

- employee profiles
- device mapping
- attendance events
- shift policies
- leave management
- payroll skeleton

This should be treated as its own product domain, not as a small add-on inside PM.

## Best Current 3-Agent Split

If three agents are used now, the best initial split is:

1. Architecture / Backend Foundation
   - service boundaries
   - PM schema outline
   - `pm-service` bootstrap
   - shared contracts
   - branch: `arch/pm-foundation`

2. Gateway / Comm Foundation
   - `api-gateway` activation
   - `comm-service` foundation
   - event and notification plumbing
   - branch: `feat/platform-routing-comm`

3. Frontend Shell / Portal Foundation
   - internal app shell alignment
   - client portal shell
   - brand-aware frontend base
   - branch: `feat/frontend-multibrand-shell`

This split minimizes overlap and keeps all work aligned with the final product direction.

## Coordination Rules

The following rules should be enforced across all agents:

- each agent gets one bounded task area
- shared types should have a single owner during a phase
- schema changes should have a designated owner
- API contract changes should be reviewed before parallel consumers depend on them
- each agent should document assumptions and verification notes
- integration happens through `integration`, not `main`

## Immediate Recommendation

Yes, Phase 0 should start now.

Reason:

- the current product direction is now broad enough that parallel implementation without a locked architecture would create unnecessary rework
- Phase 0 is the shortest path to safe parallel development

## Phase 0 Starting Checklist

Start Phase 0 by completing these items first:

1. Lock final service boundaries for `core-service`, `pm-service`, `comm-service`, `api-gateway`, and future `hrms-service`
2. Convert the PM conceptual entity map into a schema outline
3. Define shared enums, IDs, and stable cross-service types
4. Define the first event contracts, such as payment-confirmed to project-created
5. Freeze naming, module, and branch conventions

Once those are approved, parallel implementation can begin with much lower risk.
