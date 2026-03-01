# Feature 02: Engagements and Projects

## Goal

Create the live execution layer that sits under a client or internal brand and holds service-specific projects.

## Business Outcome

- same client can have multiple related projects
- internal and external work use one PM engine
- upsells can be handled without corrupting delivery history

## Ownership Model

- `Engagement` is the umbrella container
- `Project` is a service-specific execution unit

Examples:

- one client -> one engagement -> multiple projects
- one internal brand -> one engagement -> multiple internal projects

## Core Tables

- `pm_engagements`
- `pm_projects`
- `pm_project_stages`
- `pm_stage_dependencies`
- `pm_tasks`

## Core Rules

- engagement owner can be:
  - `CLIENT`
  - `INTERNAL_BRAND`
- external work uses `clientId`
- internal work uses `ownerBrandId`
- projects can be:
  - template-created
  - manually created
- one engagement can contain multiple service lines

## Project Creation Paths

### Automatic

- payment or sale confirmation occurs in `core-service`
- `core.payment_confirmed` event is emitted
- `pm-service` creates:
  - engagement if needed
  - project
  - stages
  - starter tasks

### Manual

- PM or Admin creates engagement
- PM or Admin creates project
- selected template generates stages and tasks

## Upsell Rule

- same service extra scope can stay in the same project if it is clearly an add-on
- a different service line should create a new linked project under the same engagement

## API Direction

Recommended initial endpoints:

- `POST /api/pm/engagements`
- `GET /api/pm/engagements`
- `GET /api/pm/engagements/:id`
- `PATCH /api/pm/engagements/:id`
- `POST /api/pm/projects`
- `GET /api/pm/projects`
- `GET /api/pm/projects/:id`
- `PATCH /api/pm/projects/:id`
- `POST /api/pm/projects/:id/stages`
- `POST /api/pm/projects/:id/regenerate-from-template`

## Status Direction

Recommended project statuses:

- `DRAFT`
- `ACTIVE`
- `BLOCKED`
- `WAITING_APPROVAL`
- `REVISION_REQUIRED`
- `COMPLETED`
- `CANCELLED`

Recommended stage statuses:

- `PENDING`
- `READY`
- `ACTIVE`
- `IN_REVIEW`
- `BLOCKED`
- `COMPLETED`
- `SKIPPED`

## Performance Notes

- index engagements by `(organizationId, status, createdAt)`
- index projects by `(organizationId, brandId, status, deliveryDueAt)`
- index stages by `(projectId, sortOrder, status)`
- project list endpoints should return summary shapes, not full nested payloads
- stage details should be loaded only on project detail or stage-specific views

## What Not To Do

- do not force all work for a client into one giant project
- do not allow projects to exist without tenant ownership
- do not return full project tree in every list API
