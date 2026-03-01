# Feature 01: Template Engine

## Goal

Provide reusable workflow blueprints so projects are not built manually every time.

## Business Outcome

- repeatable delivery structure
- predictable stage sequencing
- faster project creation
- easier SLA planning
- safer parallel stage control through explicit dependencies

## Core Tables

- `pm_service_templates`
- `pm_template_stages`
- `pm_template_stage_dependencies`
- `pm_template_tasks`
- `pm_template_checklists`

## Core Rules

- templates can be organization-wide or brand-scoped
- templates support versioning
- templates can be active or archived
- stages belong to a template and carry department ownership metadata
- stage dependencies define sequencing or parallel behavior
- tasks are starter tasks, not fixed forever
- checklists define self-QC and QC expectations

## Required Backend Capabilities

### Template CRUD

- create template
- update template metadata
- archive template
- duplicate template
- list templates with filters by:
  - `serviceType`
  - `brandId`
  - `isActive`

### Stage Management

- create stage
- reorder stage
- update stage rules
- soft-remove optional stage
- define stage dependencies

### Task Management

- create starter task under a template stage
- reorder template tasks
- mark task as required or optional
- define task-level default QC behavior

### Checklist Management

- create self-QC checklist items
- create QC review checklist items
- order checklist items

## API Direction

Recommended initial endpoints:

- `POST /api/pm/templates`
- `GET /api/pm/templates`
- `GET /api/pm/templates/:id`
- `PATCH /api/pm/templates/:id`
- `POST /api/pm/templates/:id/duplicate`
- `POST /api/pm/templates/:id/stages`
- `PATCH /api/pm/templates/stages/:stageId`
- `POST /api/pm/templates/stages/:stageId/dependencies`
- `POST /api/pm/templates/stages/:stageId/tasks`
- `PATCH /api/pm/templates/tasks/:taskId`
- `POST /api/pm/templates/checklists`

## Validation Rules

- a template must belong to the caller's organization
- brand-scoped templates must reference a brand from the same organization
- stage dependencies must not create cycles
- `sortOrder` should remain stable after reordering
- stage names should be unique within a template

## Performance Notes

- index template list by `(organizationId, isActive, serviceType)`
- index template stages by `(templateId, sortOrder)`
- index dependencies by `templateStageId`
- template details should load with batched relations, not one query per stage
- support paginated list endpoints even if the first UI looks small

## What Not To Do

- do not hardcode templates inside code
- do not skip version tracking
- do not allow cross-organization brand references
- do not let the project creation flow depend on ad hoc JSON blobs
