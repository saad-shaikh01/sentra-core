# Schema Review Notes

Status: Current-state review
Purpose: Explain what the current schema already covers and what must change before PM work begins.

## What Exists Today

The current Prisma schema is still a core-domain schema only.

It contains:

- tenant core:
  - `Organization`
  - `Brand`
- IAM:
  - `User`
  - `BrandAccess`
  - `Invitation`
- email setup placeholders:
  - `UserEmailConfig`
  - `EmailAlias`
- CRM and billing:
  - `Lead`
  - `LeadActivity`
  - `Client`
  - `Sale`
  - `Invoice`
  - `PaymentTransaction`
- reliability:
  - `OutboxEvent`

It does not contain any PM tables yet.

## Important Current Observations

### 1. `Organization.subscription` is a string

Current state:

- free-form string default

Recommendation:

- move to a proper enum later, such as `FREE`, `PRO`, `ENTERPRISE`
- keep plan logic explicit and index-friendly

### 2. `Brand.domain` is too narrow for the final white-label plan

Current state:

- one optional unique domain field

Recommendation:

- evolve this into a clearer brand-domain model later
- at minimum, plan for:
  - portal domain
  - optional verified custom domain
  - brand theme metadata

### 3. `Client` currently mixes account identity with a simple portal credential model

Current state:

- `Client` directly stores `email` and `password`

Recommendation:

- this may be acceptable short-term
- but long-term you may want separate client access or membership records if one client account needs richer portal access behavior

### 4. `BrandAccess` exists but is still simple

Current state:

- basic relation with a string role

Recommendation:

- keep it for now
- but do not rely on this alone for PM runtime authorization
- PM role and stage/task ownership should be handled in PM domain logic too

### 5. `OutboxEvent` exists and is useful

Current state:

- simple outbox model already exists

Recommendation:

- keep using the outbox pattern for cross-service reliability
- it is a good bridge between current monorepo development and future service separation

## PM Schema Recommendation

Do not overload the current core schema with PM concepts without a PM-specific structure.

Recommended direction:

- keep current schema as the core-domain baseline
- add PM domain tables in a clearly separated PM schema path
- maintain strict `organizationId` ownership across PM tables

Use:

- `docs/pm-service-schema-outline.md`

as the source of truth for the initial PM table set.

## Migration Strategy

1. keep current core models stable
2. add PM schema in a dedicated implementation pass
3. do not refactor core billing and CRM models at the same time as the first PM rollout
4. add cross-domain references through IDs and clear service boundaries, not by collapsing the domains together

## Performance Guidance for Schema Work

- index every hot foreign key and hot status filter
- prefer explicit summary endpoints over giant nested eager loads
- keep audit/history tables append-only where possible
- design for pagination from the first table
