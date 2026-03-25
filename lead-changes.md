# Lead Changes Plan

## Purpose

This file defines the planned redesign for lead ownership, visibility, and shared follow-up workflows in the Sales Dashboard.

This is a planning/specification document only.
It is intentionally detailed so an implementation agent can work from it without guessing.

---

## Confirmed Current State In Repo

### Current lead data model

From `libs/backend/prisma-client/prisma/schema.prisma`:

- `Lead` has:
  - `assignedToId`
  - `teamId`
  - `brandId`
  - `organizationId`
  - `activities`
- `Lead` does **not** currently have:
  - multiple assignees
  - collaborators
  - shared ownership
  - outreach lock / active outreach owner

### Current scope behavior

From `apps/backend/core-service/src/modules/scope/user-scope.class.ts`:

- `OWNER` and `ADMIN` get full lead access.
- `SALES_MANAGER` gets team-brand scoped lead access.
- `FRONTSELL_AGENT` gets only `assignedToId = self` lead access.
- `UPSELL_AGENT` gets only `assignedToId = self` lead access.
- `PROJECT_MANAGER` gets no lead access.

For clients:

- `OWNER` and `ADMIN` get full client access.
- `SALES_MANAGER` gets team-brand scoped client access.
- `FRONTSELL_AGENT` gets team-brand client access only when `memberVisibleTeamIds.length > 0`.
- `UPSELL_AGENT` gets only `upsellAgentId = self`.
- `PROJECT_MANAGER` gets only `projectManagerId = self`.

### Current team visibility concept

From `apps/backend/core-service/src/modules/scope/scope.service.ts` and `docs/tickets/sales-teams/DS-010-team-visibility-setting.md`:

- Team-level `allowMemberVisibility` already exists in the scope system.
- That setting is currently designed around `client`, `sale`, and `invoice` visibility for team members.
- It is **not** currently the mechanism for shared multi-user lead collaboration.

### Current frontend direction

From `docs/tickets/sales-teams/DS-011-frontend-route-scoping.md`:

- Frontend should not implement its own data scope logic.
- Backend must remain the source of truth for scope.
- Frontend should only:
  - render scoped data
  - show/hide filters/actions per role
  - provide role-appropriate tabs/views

---

## Problems To Solve

### Problem 1: Shared lead work is not supported

Current system assumes one lead belongs to one user via `assignedToId`.

Real-world sales usage needs support for cases where:

- a lead is still unassigned
- multiple frontsell agents are pitching or following up
- a manager wants multiple frontsell users to collaborate before final ownership is decided

### Problem 2: Visibility and ownership are coupled

Right now, for leads, visibility is effectively tied to assignment for agent roles.

This causes these gaps:

- if a lead is unassigned, relevant users may not see it
- if multiple users should collaborate, only the assigned user has first-class visibility
- team-level workflows cannot be expressed cleanly

### Problem 3: Current team visibility is too coarse for the desired flow

The repo already has `allowMemberVisibility`, but the desired business flow is more specific:

- `FRONTSELL_AGENT` may need team-wide lead visibility
- `UPSELL_AGENT` should still focus on their own clients, not all team leads
- `PROJECT_MANAGER` should still focus on their own clients/projects, not team leads

So the future model should not rely on a single generic visibility flag for every role and module.

---

## Design Principles

### Principle 1: Separate ownership from visibility

These must be treated as different concepts:

- `ownership`: who is primarily responsible
- `visibility`: who can see the record
- `collaboration`: who can actively participate without becoming the primary owner

### Principle 2: Backend remains the source of truth

No frontend-only role or data filtering should be used for correctness.

Frontend may:

- request different tabs/views
- show/hide buttons
- render status badges

Backend must decide what data is returned.

### Principle 3: One primary owner, many collaborators

The system should still keep one canonical owner for reporting, attribution, and accountability.

Shared work should be represented via collaborators, not via multiple primary assignees.

### Principle 4: Team lead visibility must be explicit and role-aware

The system should not expose all team lead data to all sales-side roles by default.

Role-specific target behavior must be encoded directly.

---

## Final Target Behavior

## Ownership Model

Every lead should support these concepts:

- `Primary Owner`
  - stored in `assignedToId`
  - exactly one or null
- `Owning Team`
  - stored in `teamId`
  - determines team pool / team-scoped visibility
- `Collaborators`
  - additional frontsell users who can work on the lead
  - do not replace the primary owner

### Meaning of states

- `assignedToId = null`
  - lead is in the team pool
- `assignedToId = userId`
  - lead has a primary owner
- collaborator exists for a user
  - that user can see/work the lead via collaboration flow even if not owner

---

## Visibility Model

### OWNER

- Can view all leads
- Can view all clients
- Can claim, reassign, remove collaborators

### ADMIN

- Same as owner for this feature set

### SALES_MANAGER

- Can view all leads belonging to their scoped team brands
- Can view all clients belonging to their scoped team brands
- Can view unassigned team leads
- Can add/remove collaborators
- Can claim or reassign ownership

### FRONTSELL_AGENT

Must be able to see the following lead buckets:

- `My Leads`
  - leads where `assignedToId = self`
- `Collaborating`
  - leads where the user is a collaborator but not the primary owner
- `Unassigned Pool`
  - team leads where `assignedToId = null`
  - only if their team lead visibility mode allows it
- `Team Leads`
  - leads assigned to other frontsell users in the same team
  - only if their team lead visibility mode allows it

For clients:

- frontsell client visibility should remain separate from lead visibility
- frontsell should not automatically inherit all client visibility just because lead visibility is enabled

### UPSELL_AGENT

Target behavior for this plan:

- should not get team-wide lead visibility
- should not see the team unassigned lead pool
- should not see all team leads
- should only work from clients assigned to them

If the business later needs upsell review of a lead, that should be a separate explicit sharing feature, not default lead scope.

### PROJECT_MANAGER

Target behavior for this plan:

- no lead list visibility
- no team lead visibility
- only own assigned clients / downstream work items

---

## Team Visibility Model

## Decision

Do **not** overload existing `allowMemberVisibility` for the new lead-sharing flow.

Reason:

- existing repo direction already ties `allowMemberVisibility` to downstream team data visibility
- lead collaboration and lead pool workflows need more granular behavior
- using one boolean for everything will become ambiguous and hard to reason about

## Proposed Team-Level Settings

Keep current:

- `allowMemberVisibility`
  - continue to mean team shared visibility for downstream records where already planned

Add new lead-specific team setting:

- `leadVisibilityMode`

### `leadVisibilityMode` values

- `OWN_ONLY`
  - frontsell sees only:
    - own assigned leads
    - leads where they are collaborator
- `TEAM_UNASSIGNED_ONLY`
  - frontsell sees:
    - own assigned leads
    - collaborating leads
    - unassigned pool for their team
- `TEAM_ALL`
  - frontsell sees:
    - own assigned leads
    - collaborating leads
    - unassigned pool
    - all frontsell leads for their team

### Why this is the recommended setting shape

This directly matches the business discussion:

- some teams may want strict ownership
- some may want shared pickup of unassigned leads only
- some may want fully transparent team-wide frontsell lead visibility

This also prevents accidental exposure of all team leads when only pool access was intended.

---

## Shared Lead Collaboration Model

## New concept: Lead Collaborators

Add a new many-to-many relation for collaborative work on leads.

### Proposed table

`LeadCollaborator`

Required fields:

- `id`
- `leadId`
- `userId`
- `addedByUserId`
- `createdAt`

Recommended constraints:

- unique on `[leadId, userId]`

### Who can be a collaborator

For this phase:

- `FRONTSELL_AGENT`
- `SALES_MANAGER`
- `ADMIN`
- `OWNER`

Do not allow by default:

- `UPSELL_AGENT`
- `PROJECT_MANAGER`

Reason:

- the desired role model from business direction says upsell and PM should remain client-centric

### Collaborator capabilities

A collaborator can:

- view the lead
- add notes / activity
- send follow-ups if the outreach workflow permits it

A collaborator does **not** automatically:

- become the primary owner
- change lead attribution/reporting ownership
- gain access to unrelated team leads

---

## Unassigned Pool Rules

## Definition

A lead belongs to the unassigned pool when:

- `assignedToId = null`
- `teamId != null`

### Who can see the pool

- `OWNER`
- `ADMIN`
- `SALES_MANAGER`
- `FRONTSELL_AGENT` only if `leadVisibilityMode` is:
  - `TEAM_UNASSIGNED_ONLY`
  - `TEAM_ALL`

### Who cannot see the pool

- `UPSELL_AGENT`
- `PROJECT_MANAGER`

### Allowed actions from pool

- `Claim`
  - set `assignedToId = currentUserId`
- `Join as Collaborator`
  - keep `assignedToId = null`
  - add collaborator row
- `Manager Assign`
  - manager/admin assigns directly to a frontsell user

---

## Outreach Coordination

## Goal

Prevent accidental duplicate outreach without blocking legitimate collaboration.

## Decision

Start with a **soft coordination model**, not a hard lock.

### Soft coordination means

Show warnings based on recent activity instead of preventing work.

Examples:

- “This lead was contacted 18 minutes ago by Ahmed.”
- “This lead already has 2 collaborators.”
- “Follow-up was sent today by Sara.”

### Why not hard lock in phase 1

- the business explicitly needs cases where 2 or 3 users may pitch/follow up
- hard locks would conflict with the shared-work requirement

### Data source for warnings

Recommended approach:

- extend `LeadActivityType` with outreach-related activity types
- compute recent outreach indicators from the activity timeline

Proposed new activity types:

- `OUTREACH_STARTED`
- `OUTREACH_SENT`
- `OUTREACH_REPLIED`
- `COLLABORATOR_ADDED`
- `COLLABORATOR_REMOVED`
- `CLAIMED`
- `UNCLAIMED`

No separate lock table is required in the first implementation phase.

---

## Backend Scope Changes

## Source of truth

All scope changes must be implemented through:

- `apps/backend/core-service/src/modules/scope/scope.service.ts`
- `apps/backend/core-service/src/modules/scope/user-scope.class.ts`
- service `findAll()` methods that already rely on scope

## Lead scope target rules

### OWNER / ADMIN

- unchanged
- full org lead visibility

### SALES_MANAGER

- unchanged in principle
- team-brand scoped lead visibility
- includes:
  - assigned team leads
  - unassigned team leads
  - collaborative team leads

### FRONTSELL_AGENT

Lead scope should no longer be only `assignedToId = self`.

Instead it must be derived from:

- own assigned leads
- own collaborator leads
- own team unassigned pool if mode allows
- own team all leads if mode allows

This likely means `LeadScopeFilter` needs to support `OR` conditions instead of only a single flat `assignedToId`.

### UPSELL_AGENT

Target lead scope:

- empty by default

This is a deliberate change from current repo behavior, where upsell currently gets own assigned leads.

### PROJECT_MANAGER

- unchanged in spirit
- no leads

## Client scope target rules

### OWNER / ADMIN

- unchanged

### SALES_MANAGER

- unchanged in principle

### FRONTSELL_AGENT

Client visibility must remain a separate rule from lead visibility.

Do not automatically make frontsell see all clients just because `leadVisibilityMode = TEAM_ALL`.

### UPSELL_AGENT

- own assigned clients only

### PROJECT_MANAGER

- own assigned clients only

---

## API Changes

## Existing APIs to keep using

- `PATCH /leads/:id/assign`
  - for manager/admin assignment changes

## New APIs to add

### 1. Claim Lead

`POST /leads/:id/claim`

Behavior:

- current user becomes primary owner
- sets `assignedToId = currentUserId`
- allowed for:
  - frontsell on visible pool/collab leads
  - manager/admin/owner

### 2. Unclaim Lead

`POST /leads/:id/unclaim`

Behavior:

- sets `assignedToId = null`
- lead returns to team pool
- manager/admin/owner only

### 3. Add Collaborator

`POST /leads/:id/collaborators`

Body:

- `userId`

Behavior:

- creates `LeadCollaborator`

### 4. Remove Collaborator

`DELETE /leads/:id/collaborators/:userId`

Behavior:

- removes collaborator link

### 5. Lead list view selectors

Recommended query support on `GET /leads`:

- `view=my`
- `view=pool`
- `view=team`
- `view=collaborating`

These should still be validated against backend scope.

The query should change presentation semantics, not bypass role rules.

---

## Frontend UX Plan

## Leads Page

Recommended tabs for frontsell:

- `My Leads`
- `Collaborating`
- `Unassigned Pool`
- `Team Leads`

Tabs should only appear when the backend scope / team mode makes them relevant.

### Row/Card metadata to display

- primary owner
- team
- collaborator count
- latest outreach actor/time
- assignment state:
  - `Assigned`
  - `Unassigned`
  - `Shared`

### Lead actions

- `Claim`
- `Join`
- `Leave Collaboration`
- `Assign`
  - manager/admin only

## Sidebar / route availability

Target role behavior:

- `FRONTSELL_AGENT`
  - keep Leads page
- `UPSELL_AGENT`
  - remove Leads page from normal navigation
- `PROJECT_MANAGER`
  - keep Leads page hidden

If a user deep-links into a disallowed route, backend should still return scoped empty results or explicit unauthorized behavior depending on existing platform conventions.

---

## Reporting And Attribution Rules

## Decision

Keep conversion and ownership attribution tied to `assignedToId`, not collaborator count.

### Rationale

- reporting needs one canonical owner
- commissions / KPIs need deterministic ownership
- collaborators are operational participants, not automatic attribution owners

### What collaborators affect

- visibility
- workflow
- activity timeline

### What collaborators do not affect by default

- primary sales attribution
- lead ownership KPIs
- conversion ownership

If future business wants split attribution, that should be a separate reporting project.

---

## Schema Changes Required

## Required

### 1. `LeadCollaborator` model

Add a new model linked to:

- `Lead`
- `User`
- `addedByUserId`

### 2. Team lead visibility setting

Add a new field on `Team`:

- `leadVisibilityMode`

Recommended enum:

- `OWN_ONLY`
- `TEAM_UNASSIGNED_ONLY`
- `TEAM_ALL`

## Optional but recommended

### 3. Additional lead activity types

Extend lead activity enum to support:

- collaboration changes
- claim/unclaim
- outreach events

---

## Migration Strategy

## Team setting migration

For existing teams:

- default `leadVisibilityMode = OWN_ONLY`

Reason:

- this preserves the safest current behavior
- no surprise visibility expansion after deploy

## Existing leads migration

No lead row backfill is required for the first phase because:

- `assignedToId`
- `teamId`

already exist.

Only new collaborator relationships will be created going forward.

---

## Implementation Phases

## Phase 1: Foundations

Goal:

- establish correct data model and backend scope primitives

Tickets:

- `LC-001` Add `leadVisibilityMode` to `Team`
- `LC-002` Add `LeadCollaborator` schema and relations
- `LC-003` Extend lead activity types for collaboration and outreach
- `LC-004` Expose new team lead visibility setting in team APIs

## Phase 2: Backend Scope And Lead Workflow

Goal:

- make backend return correct scoped lead data for each role/view

Tickets:

- `LC-005` Update `UserScope` and lead scope filters for:
  - frontsell team/pool/collaborating logic
  - upsell no-lead behavior
  - PM no-lead behavior
- `LC-006` Add collaborator-aware lead query logic
- `LC-007` Add claim/unclaim/collaborator APIs
- `LC-008` Ensure cache invalidation for:
  - team visibility change
  - collaborator changes
  - claim/unclaim

## Phase 3: Frontend Lead Workspace

Goal:

- expose the new workflow clearly in the UI

Tickets:

- `LC-009` Add lead page tabs:
  - My
  - Collaborating
  - Pool
  - Team
- `LC-010` Add row badges and metadata:
  - owner
  - collaborator count
  - assignment state
  - last outreach
- `LC-011` Add actions:
  - claim
  - join
  - leave collaboration
- `LC-012` Update sidebar/filters per new role behavior

## Phase 4: Coordination And Guardrails

Goal:

- reduce duplicate outreach and improve operator confidence

Tickets:

- `LC-013` Add outreach-related lead activities
- `LC-014` Show recent outreach warnings in list/detail views
- `LC-015` Add “someone already contacted this lead recently” warning before follow-up

## Phase 5: Tests And Regression Coverage

Goal:

- protect scope logic and collaboration behavior

Tickets:

- `LC-016` Add scope tests for:
  - frontsell own-only
  - frontsell pool-only
  - frontsell team-all
  - upsell no leads
  - PM no leads
- `LC-017` Add collaborator visibility tests
- `LC-018` Add claim/unclaim API tests
- `LC-019` Add frontend role-based navigation and tab rendering coverage

---

## Ticket Details

## LC-001: Team Lead Visibility Mode

### Goal

Add a lead-specific team setting without breaking existing `allowMemberVisibility`.

### Files likely affected

- `libs/backend/prisma-client/prisma/schema.prisma`
- team DTOs / services in HRMS and core-service
- any team settings UI currently used for team configuration

### Acceptance

- team can store `leadVisibilityMode`
- default is `OWN_ONLY`
- API returns the value

## LC-002: Lead Collaborator Schema

### Goal

Allow shared lead work without multiple primary owners.

### Acceptance

- one lead can have many collaborators
- one user can collaborate on many leads
- duplicates prevented

## LC-005: Lead Scope Redesign

### Goal

Replace simple `assignedToId=self` lead visibility for frontsell with structured scope logic.

### Acceptance

- frontsell receives correct leads for each allowed view
- upsell receives no lead list by default
- PM receives no lead list

## LC-007: Claim / Collaborator APIs

### Goal

Provide explicit workflow actions for shared and pooled leads.

### Acceptance

- claim works
- unclaim works
- add/remove collaborator works
- activity log records events

## LC-009: Frontend Lead Tabs

### Goal

Make the workflow understandable and navigable for frontsell users.

### Acceptance

- frontsell sees tabs relevant to their team visibility mode
- upsell and PM do not see lead workspace they should not operate

## LC-013: Outreach Warnings

### Goal

Reduce collisions without preventing collaboration.

### Acceptance

- recent outreach indicator appears
- user sees warning before duplicate follow-up
- no hard lock is introduced in this phase

---

## Test Matrix

### Lead scope

- owner sees all leads
- admin sees all leads
- manager sees team-brand leads
- frontsell with `OWN_ONLY` sees:
  - own assigned
  - collaborating
  - not team-assigned leads of others
- frontsell with `TEAM_UNASSIGNED_ONLY` sees:
  - own assigned
  - collaborating
  - unassigned pool
  - not all assigned team leads
- frontsell with `TEAM_ALL` sees:
  - own assigned
  - collaborating
  - unassigned pool
  - all team leads
- upsell sees no lead list
- PM sees no lead list

### Collaborators

- collaborator can see lead even when not owner
- collaborator removal removes visibility if no other rule grants access
- owner remains unchanged when collaborator is added

### Pool

- unassigned lead is visible only to allowed roles
- claim removes it from pool and moves it to owner view
- unclaim returns it to pool

### Clients

- upsell still sees only own clients
- PM still sees only own clients
- frontsell client visibility remains governed separately from lead visibility

---

## Non-Goals For This Plan

- split commission / split attribution
- upsell default access to raw leads
- project manager access to raw leads
- hard-locking a lead so only one user can contact it

---

## Final Implementation Guidance

If this plan is implemented, the implementation agent should follow this order:

1. schema and enums
2. scope primitives
3. API routes and cache invalidation
4. frontend tabs/actions
5. tests

Do not start with frontend-only behavior.
Do not reuse `allowMemberVisibility` for lead-sharing behavior.
Do not preserve current `UPSELL_AGENT -> own leads` behavior if the target product direction is client-only access for upsell.
