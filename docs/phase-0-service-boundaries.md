# Phase 0 Service Boundaries

Status: Approved working draft
Purpose: Lock service ownership before parallel implementation begins.

## Why This Exists

The product is not only a PM module. It is a full multi-tenant SaaS platform with:

- CRM and sales
- PM workflow engine
- client portal
- communication infrastructure
- future HRMS
- multi-brand white-label access

To keep implementation clean, each service must have a clear ownership boundary.

## Platform-Level Rules

- One hosted SaaS platform serves many organizations.
- `Organization` is the tenant boundary.
- `Brand` is the public-facing business identity inside an organization.
- Internal staff use a central internal app domain.
- External clients use brand-scoped portal domains.
- Shared types are allowed for stable contracts only.
- Services may share the same PostgreSQL cluster, but they should not behave like a free-for-all shared database.
- Each service owns its own domain tables and business logic.

## Recommended Domain Layout

```text
api-gateway
  -> routes external requests

core-service
  -> auth, org, CRM, billing core

pm-service
  -> project execution engine

comm-service
  -> notifications and communication workflows

hrms-service
  -> employee operations, attendance, payroll
```

## Service Ownership

### 1. `api-gateway`

Primary role:

- single public entry point

Responsibilities:

- receive external web requests
- validate auth at the edge where appropriate
- route requests to internal services
- inject request context such as:
  - `organizationId`
  - `brandId`
  - `host`
  - actor identity metadata
- handle host-based brand resolution for client portals
- centralize request tracing and gateway-level rate limiting

Should not own:

- business workflows
- domain-specific write logic
- tenant business state

### 2. `core-service`

Primary role:

- business core, tenancy, CRM, and billing foundation

Responsibilities:

- authentication
- access and refresh token handling
- users
- roles and authorization hierarchy
- organizations
- brands
- brand domain configuration
- clients
- leads
- sales
- invoices
- subscription and plan state
- payment profile onboarding
- tenant-level limits and plan gating

This service is the source of truth for:

- tenant identity
- user identity
- brand identity
- commercial customer records
- commercial payment state

Should not own:

- PM workflow engine
- stage/task execution logic
- communication delivery pipelines
- payroll logic

### 3. `pm-service`

Primary role:

- production workflow and delivery engine

Responsibilities:

- service templates
- template stages
- template tasks
- template dependencies
- engagements
- projects
- project stages
- stage dependencies
- tasks
- task assignments
- task submissions
- self-QC responses
- QC reviews
- bypass records
- revision requests
- deliverable packages
- approval requests
- approval snapshots
- project closure
- project/stage/task discussions
- PM file metadata and linking
- PM activity log
- PM performance metrics

This service is the source of truth for:

- execution state
- task ownership
- production review state
- delivery and approval state

Should not own:

- user authentication
- billing source of truth
- outbound communication delivery engines
- payroll source of truth

### 4. `comm-service`

Primary role:

- communication and notification infrastructure

Responsibilities:

- outbound transactional email delivery
- notification fanout
- mention alerts
- in-app notification persistence
- email-to-thread sync
- inbox/event ingestion
- communication retry logic
- delivery logs
- future digesting and channel delivery logic

Recommended storage:

- MongoDB for communication-heavy and unstructured records

This service is the source of truth for:

- communication delivery state
- outbound mail jobs
- inbound communication sync records
- notification dispatch status

Should not own:

- CRM source records
- PM workflow state
- payroll logic

### 5. `hrms-service`

Primary role:

- employee operations and workforce management

Responsibilities:

- employee profiles
- employee device mapping
- attendance events
- attendance sessions
- shift policies
- shift assignments
- leave requests
- holiday calendars
- payroll profiles
- payroll runs
- payroll line items
- payslips

This service is the source of truth for:

- workforce attendance
- payroll calculations
- employee operational status

Should not own:

- CRM customer state
- PM workflow state
- communication delivery pipelines

## Shared Data Strategy

Recommended database direction:

- shared PostgreSQL cluster for `core-service`, `pm-service`, and future `hrms-service`
- MongoDB for `comm-service`

Recommended logical ownership:

- `core` schema owned by `core-service`
- `pm` schema owned by `pm-service`
- `hrms` schema owned by `hrms-service`

Rules:

- services can share the same database infrastructure
- services must not directly treat another service's tables as their writable domain
- cross-service coordination should happen through API calls or events

## Shared Types Strategy

Use shared libraries for:

- stable enums
- ID/value object contracts
- event payloads
- cross-service request/response contracts that are intentionally shared

Do not use shared libraries for:

- copying entire internal service models across services
- bypassing service ownership

## Domain and Access Model

Recommended domain shape:

- internal staff app: `app.xyz.com`
- public API: `api.xyz.com`
- brand-based client portals:
  - `portal.pulphousepublishing.com`
  - `portal.urbanquillpublishing.com`

Routing behavior:

- gateway reads the incoming host
- gateway resolves the host to a `Brand`
- brand context is attached to the request
- downstream services enforce `organizationId` and `brandId` boundaries as needed

## Cross-Service Event Direction

These are the first critical event flows to support:

1. Payment confirmed in `core-service` -> project or engagement creation in `pm-service`
2. Task submitted in `pm-service` -> review notification in `comm-service`
3. Mention created in `pm-service` -> mention alert in `comm-service`
4. Approval decision in `pm-service` -> status notification in `comm-service`
5. Subscription or plan change in `core-service` -> feature limit update for downstream services
6. Future attendance updates in `hrms-service` -> availability or reporting signals for other modules

## Implementation Rule for Parallel Work

Parallel agents may work across services only after these boundaries are treated as locked for the current phase.

For Phase 0:

- `core-service` remains the source of truth for auth, tenant, CRM, and billing
- `pm-service` is introduced as a separate service for the PM domain
- `comm-service` is activated only for communication responsibilities
- `api-gateway` becomes the public routing layer
- `hrms-service` is reserved as a future service boundary and should not be mixed into PM

## Immediate Next Steps

1. Convert PM conceptual entities into a schema outline for `pm-service`
2. Freeze the initial shared enums and event contracts
3. Scaffold `pm-service`
4. Activate `api-gateway` and `comm-service` as real services
5. Begin backend-first feature slices before frontend work for each slice
