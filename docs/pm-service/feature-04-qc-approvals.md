# Feature 04: QC, Revisions, and Approvals

## Goal

Add quality control, formal review, and final decision flows for both external and internal projects.

## Business Outcome

- deliverables are controlled
- internal errors are traceable
- client and internal approval paths can coexist
- urgent bypasses remain auditable

## Core Tables

- `pm_task_submissions`
- `pm_self_qc_responses`
- `pm_qc_reviews`
- `pm_bypass_records`
- `pm_revision_requests`
- `pm_deliverable_packages`
- `pm_approval_requests`
- `pm_approval_snapshots`
- `pm_project_closure_records`

## Core Rules

- not every task must require QC, but QC should be configurable at task or stage level
- if a task requires QC, the assignee submits work and self-check data first
- QC reviewer approves or rejects
- rejection feedback must be recorded
- repeated rejections can trigger escalation
- PM/Admin can bypass in urgent cases
- bypass always creates a red-flag audit record

## Submission Flow

1. assignee uploads or links submission files
2. assignee completes self-QC checklist if required
3. task submission record is created
4. task moves to `SUBMITTED` or `IN_QC`
5. review queue is updated

## QC Review Flow

1. reviewer opens task submission
2. reviewer inspects files and checklist responses
3. reviewer approves or rejects
4. system records review
5. task status changes based on the decision

## Approval Flow

Support both:

- `EXTERNAL` project approvals
- `INTERNAL` project approvals

For external:

- deliverable package is published to the client

For internal:

- deliverable package is sent to internal approver

## API Direction

Recommended initial endpoints:

- `POST /api/pm/tasks/:id/submissions`
- `GET /api/pm/tasks/:id/submissions`
- `GET /api/pm/submissions/:id`
- `POST /api/pm/submissions/:id/qc-reviews`
- `POST /api/pm/tasks/:id/bypass`
- `POST /api/pm/projects/:id/revisions`
- `POST /api/pm/projects/:id/deliverables`
- `POST /api/pm/projects/:id/approval-requests`
- `POST /api/pm/approval-requests/:id/decide`
- `POST /api/pm/projects/:id/close`

## Audit Requirements

- keep review history immutable
- keep approval snapshots immutable
- tie approvals to exact deliverable versions
- store actor identity and timestamps
- store IP address for external approval actions where possible

## Performance Notes

- index submissions by `(taskId, submissionNumber)`
- index QC reviews by `(taskSubmissionId, reviewedAt)`
- index approval requests by `(projectId, status, sentAt)`
- keep approval decision endpoints rate-limited
- avoid heavy synchronous file processing inside review endpoints

## What Not To Do

- do not overwrite a submission record instead of creating a new one
- do not let bypass silently skip audit logging
- do not mix approval logs with general comments
