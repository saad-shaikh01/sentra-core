# PM System Baseline

Status: Working baseline from planning discussion
Purpose: Capture the currently agreed PM system direction before formal schema and API design.

## Scope Direction

- This system is being designed as a full advanced PM platform, not a stripped-down MVP.
- Features may still be implemented in phases, but the architecture must support the full feature set from the start.
- Existing docs may be outdated; this file reflects the current planning decisions from discussion.

## Core Structure

Two layers are required:

1. Template layer
2. Live execution layer

Logical hierarchy:

```text
Organization
  -> Brand
  -> Department
  -> User
  -> Client

Client or Internal Brand
  -> Engagement
    -> Project
      -> ProjectStage
        -> Task
```

Notes:

- `Client` is the customer or external account.
- `Brand` can also act as the owner for internal projects.
- `Engagement` groups related work for the same client or internal brand.
- A single client can have multiple engagements and multiple projects.
- A single engagement can contain multiple related projects.

## Why Engagement Exists

`Engagement` is the umbrella container for related services.

Example:

- Client: ABC Author
- Engagement: Book A Launch
- Project 1: Book Publishing
- Project 2: Marketing Campaign

This keeps the client the same while allowing multiple service-specific projects with separate workflows, deadlines, files, approvals, and reporting.

## Project, Stage, and Task

- `Project` = one service-specific execution workflow
- `ProjectStage` = a workflow phase or department-owned checkpoint
- `Task` = the actual execution unit inside a stage

Why both stage and task are required:

- Stage manages workflow gates, ownership, and progress at the department level.
- Task manages actual work assignment, execution, revisions, QC, and file submissions.
- Stage owner and task assignee can be different people.

Recommended ownership model:

- `PM -> Department Lead -> Team Member`

Operational rule:

- The PM manages the project and stage flow.
- Each active stage belongs to the relevant department lead.
- The lead manually assigns work to team members through tasks.

## Project Creation Rules

- Projects can be auto-created after payment/order confirmation.
- Projects can also be created manually when needed.
- Projects should be created from templates whenever possible.

Template-driven creation:

```text
ServiceTemplate
  -> TemplateStage
    -> TemplateTask
```

On project creation:

- The selected template generates the live project.
- The template generates default stages.
- The template generates starter tasks for each stage.
- Leads can later split, add, or refine tasks inside their stages.

## Parallel Stage Rules

- Parallel stages are allowed as an advanced feature.
- Parallel execution must be controlled by dependencies, not random manual overlap.
- A stage becomes active when its dependency conditions are satisfied.
- Two stages can be active at the same time if they do not depend on each other.

Example:

- `Cover Design` -> `DESIGN`
- `Marketing Copy Draft` -> `MARKETING` or `CONTENT`

Both can run in parallel if the template or runtime dependency rules allow it.

## Approval Model

Projects must support both external and internal approval paths.

Project types:

- `EXTERNAL`
- `INTERNAL`

Rules:

- External projects can be delivered to the client for approval.
- Internal projects do not send client links.
- Internal projects go to an internal approver such as Admin, Brand Owner, Boss, or another authorized role.

Completion logic:

- A task is complete when execution is done and required review is passed.
- A stage is complete when all required tasks in that stage are complete.
- A project is complete when all required stages are complete and the final approval path is satisfied.

## QC and Review Direction

- QC exists as a formal workflow step.
- Not every task must always require QC; this should be configurable by task type or stage rules.
- If QC is required, the worker submits work, completes self-check, and sends it for review.
- QC reviewer approves or rejects.
- Rejections must be logged with feedback.
- QC bypass is supported for urgent cases, but it must be logged as an explicit audit event.

Recommended bypass control:

- Allowed to PM and Admin only
- Reason required
- Marked as a red-flag event

## Communication Model

Discussion must exist at multiple levels:

- Project-level discussion
- Stage-level discussion
- Task-level discussion
- External approval/client thread where applicable

The preferred design is one reusable communication engine instead of separate comment systems for each level.

Conceptual model:

```text
ConversationThread
- scopeType: PROJECT | STAGE | TASK | APPROVAL
- scopeId
- visibility: INTERNAL | EXTERNAL

Message
- threadId
- authorId
- body
- parentMessageId
```

Supported communication features:

- replies
- mentions
- file attachments or file references
- internal notes
- approval notes

Mentions:

- `@user` mentions should be supported
- mentions should trigger notifications

Replies:

- threaded replies should be supported through `parentMessageId`

Important distinction:

- discussion is human conversation
- activity log is system-generated event history

These should remain separate.

## File Management Direction

Files must be handled through a centralized, versioned system.

Storage principles:

- Actual files live in object storage (Wasabi S3)
- Database stores metadata and relationships
- Files should not be public by default
- Access should be granted via permission checks and signed URLs

Primary rule:

- upload once, link many times

This means:

- a file can be uploaded once
- the same file can be referenced at project, stage, task, or comment level
- users should not need to re-upload the same asset repeatedly

Recommended conceptual model:

```text
FileAsset
  -> FileVersion
  -> FileLink
```

Behavior:

- `FileAsset` = logical file object
- `FileVersion` = each new upload/version
- `FileLink` = reference to where the file is visible or attached

Examples:

- project brief
- stage references
- task submission files
- comment-linked reference files
- final published deliverables

Access rules:

- PM/Admin can access full project file context
- Leads can access files relevant to their stages and tasks
- Team members can access assigned task files plus needed references
- QC can access submissions and required references
- Clients can only access explicitly published files
- Internal approvers can access internal published deliverables

Suggested file delivery:

- preview/download only after backend permission check
- backend returns signed URL with short expiry

## Required Advanced PM Entities

This is the current conceptual entity map, not the final database schema.

Foundation:

- `Organization`
- `Brand`
- `Department`
- `User`
- `UserDepartmentMembership`
- `Client`

Customer and work ownership:

- `Engagement`
- `Project`

Template engine:

- `ServiceTemplate`
- `TemplateStage`
- `TemplateTask`
- `TemplateStageDependency`
- `TemplateChecklist`

Execution:

- `ProjectStage`
- `StageDependency`
- `Task`
- `TaskAssignment`
- `TaskWorklog`

Submission and review:

- `TaskSubmission`
- `SelfQCResponse`
- `QCReview`
- `BypassRecord`
- `RevisionRequest`

Approval and delivery:

- `DeliverablePackage`
- `ApprovalRequest`
- `ApprovalSnapshot`
- `ProjectClosureRecord`

Communication:

- `ConversationThread`
- `Message`
- `MessageMention`
- `MessageAttachment`
- `ThreadParticipant`

Files:

- `FileAsset`
- `FileVersion`
- `FileLink`
- `FileAccessLog`
- `GeneratedPreview`

Notifications and tracking:

- `Notification`
- `NotificationPreference`
- `ActivityLog`
- `EscalationEvent`
- `PerformanceEvent`
- `ScoreSnapshot`

## Current Locked Planning Decisions

- Use `Client -> Engagement -> Project -> ProjectStage -> Task` as the execution backbone.
- Support both external client projects and internal brand projects.
- Allow both auto-created and manually created projects.
- Use templates to generate default stages and starter tasks.
- Keep stages as workflow containers and tasks as execution units.
- Stage accountability belongs to the department lead.
- Leads manually assign tasks to their team members.
- Support controlled parallel stages through dependencies.
- Support project-, stage-, and task-level discussions.
- Support mentions and threaded replies.
- Keep discussion and system activity logs separate.
- Use centralized file management with versioning and reusable file links.
- Support explicit approval flows for both external and internal projects.

## Next Architecture Steps

The next recommended steps from this baseline are:

1. Split these conceptual entities into must-have tables vs configuration-derived structures.
2. Convert the approved entity map into a Prisma-style schema outline.
3. Define lifecycle states for project, stage, task, submission, QC, and approval.
4. Define role permissions for PM, Lead, Team Member, QC, Admin, and Internal Approver.
5. Map the UI surface for PM, Lead, Team Member, QC, and approval users.
