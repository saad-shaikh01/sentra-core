# Feature 03: Stage and Task Workflows

## Goal

Implement the day-to-day execution engine with lead ownership, task assignment, and controlled progress.

## Business Outcome

- PM controls project flow
- department leads own active stages
- team members execute concrete tasks
- the UI can stay simple while the system remains audit-friendly

## Core Tables

- `pm_project_stages`
- `pm_stage_dependencies`
- `pm_tasks`
- `pm_task_assignments`
- `pm_task_worklogs`

## Ownership Model

- PM oversees the project
- each active stage belongs to a department lead
- the lead manually assigns tasks to team members
- the stage owner and task assignee may be different users

## Core Rules

- a stage becomes active when dependencies are satisfied
- parallel stages are allowed only when dependency rules allow them
- a task is the execution unit
- a stage is the workflow gate
- tasks can be split, reordered, blocked, reassigned, or completed

## Assignment Modes

Support now:

- `MANUAL`
- `CLAIM`
- `REASSIGN`

Reserve for later if needed:

- `AUTO_BALANCED`

## Task Lifecycle Direction

Recommended statuses:

- `PENDING`
- `READY`
- `IN_PROGRESS`
- `SUBMITTED`
- `IN_QC`
- `REVISION_REQUIRED`
- `COMPLETED`
- `BLOCKED`
- `CANCELLED`

## Required Backend Capabilities

### Stage Operations

- activate next eligible stages
- skip optional stages
- re-order manually added stages where allowed
- assign or change stage lead
- mark stage blocked with reason

### Task Operations

- create task
- update task
- assign task
- claim task
- reassign task
- block/unblock task
- submit task
- complete task after review path succeeds

### Work History

- record assignment history
- support current assignee lookups
- support time or worklog entries for later analytics

## API Direction

Recommended initial endpoints:

- `GET /api/pm/projects/:id/stages`
- `GET /api/pm/stages/:id`
- `PATCH /api/pm/stages/:id`
- `POST /api/pm/stages/:id/activate`
- `POST /api/pm/stages/:id/tasks`
- `GET /api/pm/stages/:id/tasks`
- `GET /api/pm/tasks/:id`
- `PATCH /api/pm/tasks/:id`
- `POST /api/pm/tasks/:id/assign`
- `POST /api/pm/tasks/:id/claim`
- `POST /api/pm/tasks/:id/reassign`
- `POST /api/pm/tasks/:id/block`
- `POST /api/pm/tasks/:id/unblock`
- `POST /api/pm/tasks/:id/worklogs`

## Query Shapes

Support these list views early:

- PM project board summary
- lead stage queue
- team member my tasks
- due-soon tasks
- blocked tasks

## Performance Notes

- never return full task comments, files, and reviews inside task list endpoints
- index tasks by:
  - `(organizationId, assigneeId, status, dueAt)`
  - `(projectStageId, sortOrder, status)`
- index assignments by `(taskId, isCurrent)`
- keep task detail as a separate endpoint from task lists
- use summary counts for dashboards instead of loading full records

## What Not To Do

- do not make PM assign every worker directly
- do not use stage-only execution if task-level accountability is required
- do not auto-load every task for every stage in every project list response
