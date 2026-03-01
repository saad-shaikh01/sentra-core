# PM Service Schema Outline

Status: Phase 0 working outline
Purpose: Translate the approved PM entity map into an implementation-oriented schema outline for `pm-service`.

This is not the final Prisma schema yet. It is the approved shape that backend implementation should follow.

## Design Rules

- `pm-service` owns the PM domain tables.
- `pm-service` may reference `organizationId`, `brandId`, `clientId`, and `userId`, but those remain source-of-truth identities from other owned domains.
- Every major PM table must be tenant-aware through `organizationId`.
- Every list query must be tenant-scoped and index-friendly.
- All workflow state tables should support auditability and history.

## Core Ownership References

These IDs are referenced across the PM domain:

- `organizationId`
- `brandId` (optional where only some flows are brand-specific)
- `clientId` (nullable for internal-only flows if the owner is an internal brand)
- `createdById`
- `updatedById`

For internal projects:

- use `ownerType = INTERNAL_BRAND`
- use `ownerBrandId`

For external projects:

- use `ownerType = CLIENT`
- use `clientId`

## Must-Have Tables

These should be implemented as first-class tables in `pm-service`.

### 1. `pm_service_templates`

Purpose:

- root template record for a service workflow such as publishing, marketing, or web delivery

Key fields:

- `id`
- `organizationId`
- `brandId` (nullable if template is org-wide)
- `name`
- `serviceType`
- `description`
- `isActive`
- `isDefault`
- `version`
- `createdById`
- `createdAt`
- `updatedAt`

### 2. `pm_template_stages`

Purpose:

- predefined stages inside a template

Key fields:

- `id`
- `templateId`
- `name`
- `description`
- `departmentCode`
- `sortOrder`
- `defaultSlaHours`
- `clientReviewMode`
- `requiresStageApproval`
- `isOptional`
- `allowsParallel`

### 3. `pm_template_stage_dependencies`

Purpose:

- define controlled parallelism and execution order

Key fields:

- `id`
- `templateStageId`
- `dependsOnTemplateStageId`
- `dependencyType`

### 4. `pm_template_tasks`

Purpose:

- default starter tasks created under each template stage

Key fields:

- `id`
- `templateStageId`
- `name`
- `description`
- `sortOrder`
- `defaultAssigneeRole`
- `requiresQc`
- `isRequired`
- `estimatedHours`

### 5. `pm_template_checklists`

Purpose:

- reusable self-QC and review checklist items

Key fields:

- `id`
- `templateStageId` (nullable if task-scoped template item)
- `templateTaskId` (nullable if stage-scoped template item)
- `checklistType`
- `label`
- `sortOrder`
- `isRequired`

### 6. `pm_engagements`

Purpose:

- umbrella container for related work under a client or internal brand

Key fields:

- `id`
- `organizationId`
- `ownerType` (`CLIENT` or `INTERNAL_BRAND`)
- `clientId` (nullable)
- `ownerBrandId` (nullable)
- `primaryBrandId`
- `name`
- `description`
- `status`
- `priority`
- `createdById`
- `createdAt`
- `updatedAt`

### 7. `pm_projects`

Purpose:

- one live service-specific workflow inside an engagement

Key fields:

- `id`
- `organizationId`
- `engagementId`
- `brandId`
- `clientId` (nullable for internal-only ownership patterns)
- `templateId` (nullable for manual builds)
- `projectType` (`EXTERNAL`, `INTERNAL`)
- `serviceType`
- `name`
- `description`
- `status`
- `priority`
- `healthStatus`
- `deliveryDueAt`
- `publishedAt`
- `closedAt`
- `createdById`
- `updatedById`
- `createdAt`
- `updatedAt`

### 8. `pm_project_stages`

Purpose:

- live stage instances inside a project

Key fields:

- `id`
- `organizationId`
- `projectId`
- `templateStageId` (nullable for manual ad hoc stages)
- `name`
- `description`
- `departmentCode`
- `status`
- `sortOrder`
- `ownerLeadId`
- `clientReviewMode`
- `requiresStageApproval`
- `requiresQcByDefault`
- `isOptional`
- `isBlocked`
- `startedAt`
- `dueAt`
- `completedAt`
- `createdAt`
- `updatedAt`

### 9. `pm_stage_dependencies`

Purpose:

- runtime dependency graph for live stages

Key fields:

- `id`
- `projectId`
- `projectStageId`
- `dependsOnProjectStageId`
- `dependencyType`

### 10. `pm_tasks`

Purpose:

- execution units inside a project stage

Key fields:

- `id`
- `organizationId`
- `projectId`
- `projectStageId`
- `templateTaskId` (nullable)
- `name`
- `description`
- `status`
- `priority`
- `sortOrder`
- `ownerLeadId`
- `assigneeId` (nullable until assigned)
- `requiresQc`
- `isRequired`
- `isBlocked`
- `startedAt`
- `dueAt`
- `submittedAt`
- `completedAt`
- `createdById`
- `updatedById`
- `createdAt`
- `updatedAt`

### 11. `pm_task_assignments`

Purpose:

- assignment history and accountability log

Key fields:

- `id`
- `taskId`
- `assignedById`
- `assignedToId`
- `assignmentType` (`MANUAL`, `CLAIM`, `REASSIGN`, `AUTO`)
- `startedAt`
- `endedAt`
- `isCurrent`
- `notes`

### 12. `pm_task_worklogs`

Purpose:

- optional but recommended work tracking for analytics and later HRMS overlap

Key fields:

- `id`
- `taskId`
- `userId`
- `startedAt`
- `endedAt`
- `durationMinutes`
- `notes`

### 13. `pm_task_submissions`

Purpose:

- freeze a submitted work package for review

Key fields:

- `id`
- `taskId`
- `submittedById`
- `submissionNumber`
- `status`
- `submittedAt`
- `notes`

### 14. `pm_self_qc_responses`

Purpose:

- store self-check confirmation linked to a submission

Key fields:

- `id`
- `taskSubmissionId`
- `checklistItemId` (nullable if stored as freeform label snapshot)
- `labelSnapshot`
- `isChecked`
- `responseText`

### 15. `pm_qc_reviews`

Purpose:

- formal QC decision records

Key fields:

- `id`
- `taskId`
- `taskSubmissionId`
- `reviewerId`
- `decision` (`APPROVED`, `REJECTED`)
- `reviewNumber`
- `feedback`
- `reviewedAt`

### 16. `pm_bypass_records`

Purpose:

- immutable record for approved bypass events

Key fields:

- `id`
- `taskId`
- `projectStageId`
- `actedById`
- `reason`
- `redFlag`
- `createdAt`

### 17. `pm_revision_requests`

Purpose:

- represent internal or external rework requests

Key fields:

- `id`
- `projectId`
- `taskId` (nullable for broader revisions)
- `sourceType` (`INTERNAL`, `CLIENT`, `APPROVER`)
- `sourceUserId` (nullable)
- `requestType`
- `status`
- `notes`
- `createdAt`
- `resolvedAt`

### 18. `pm_deliverable_packages`

Purpose:

- curated bundle for client or internal approval

Key fields:

- `id`
- `projectId`
- `name`
- `description`
- `deliveryType` (`CLIENT`, `INTERNAL`)
- `createdById`
- `createdAt`

### 19. `pm_approval_requests`

Purpose:

- formal publish/send-for-approval record

Key fields:

- `id`
- `projectId`
- `deliverablePackageId`
- `approvalTargetType` (`CLIENT`, `INTERNAL_APPROVER`)
- `approvalTargetUserId` (nullable)
- `approvalTargetEmail` (nullable)
- `status`
- `sentById`
- `sentAt`
- `dueAt`

### 20. `pm_approval_snapshots`

Purpose:

- immutable legal/audit record of approval or rejection

Key fields:

- `id`
- `approvalRequestId`
- `decision`
- `actedByUserId` (nullable)
- `actorIp` (nullable)
- `notes`
- `actedAt`

### 21. `pm_project_closure_records`

Purpose:

- explicit closeout record for a project

Key fields:

- `id`
- `projectId`
- `closedById`
- `closureReason`
- `notes`
- `closedAt`

### 22. `pm_conversation_threads`

Purpose:

- reusable thread container for project, stage, task, or approval discussions

Key fields:

- `id`
- `organizationId`
- `projectId`
- `scopeType` (`PROJECT`, `STAGE`, `TASK`, `APPROVAL`)
- `scopeId`
- `visibility` (`INTERNAL`, `EXTERNAL`)
- `createdById`
- `createdAt`

### 23. `pm_messages`

Purpose:

- actual comments and replies

Key fields:

- `id`
- `threadId`
- `authorId`
- `parentMessageId` (nullable)
- `messageType`
- `body`
- `createdAt`
- `updatedAt`

### 24. `pm_message_mentions`

Purpose:

- explicit mention records for notifications and audit

Key fields:

- `id`
- `messageId`
- `mentionedUserId`
- `createdAt`

### 25. `pm_message_attachments`

Purpose:

- attach or reference files in a message

Key fields:

- `id`
- `messageId`
- `fileAssetId`
- `fileVersionId` (nullable)
- `attachmentType`

### 26. `pm_thread_participants`

Purpose:

- track visibility, read state, mute state

Key fields:

- `id`
- `threadId`
- `userId`
- `lastReadMessageId` (nullable)
- `lastReadAt` (nullable)
- `isMuted`

### 27. `pm_file_assets`

Purpose:

- logical file record

Key fields:

- `id`
- `organizationId`
- `projectId`
- `assetType`
- `name`
- `mimeType`
- `createdById`
- `createdAt`

### 28. `pm_file_versions`

Purpose:

- concrete uploaded versions

Key fields:

- `id`
- `fileAssetId`
- `versionNumber`
- `storageKey`
- `originalFilename`
- `sizeBytes`
- `checksum`
- `uploadedById`
- `uploadedAt`
- `isLatest`
- `isApproved`
- `isPublished`

### 29. `pm_file_links`

Purpose:

- reuse one file across project, stage, task, submission, deliverable, or message scope

Key fields:

- `id`
- `fileAssetId`
- `fileVersionId` (nullable)
- `scopeType`
- `scopeId`
- `linkType`
- `createdById`
- `createdAt`

### 30. `pm_file_access_logs`

Purpose:

- audit file previews and downloads

Key fields:

- `id`
- `fileAssetId`
- `fileVersionId` (nullable)
- `userId`
- `actionType`
- `createdAt`

### 31. `pm_notifications`

Purpose:

- PM-side notification state if kept in PM domain before full comm-service ownership is finalized

Key fields:

- `id`
- `organizationId`
- `userId`
- `eventType`
- `scopeType`
- `scopeId`
- `status`
- `createdAt`
- `readAt` (nullable)

### 32. `pm_activity_logs`

Purpose:

- system-generated event timeline for PM

Key fields:

- `id`
- `organizationId`
- `projectId`
- `scopeType`
- `scopeId`
- `actorUserId` (nullable)
- `eventType`
- `payloadJson`
- `createdAt`

### 33. `pm_escalation_events`

Purpose:

- track repeated rejections, SLA breaches, and other escalation conditions

Key fields:

- `id`
- `organizationId`
- `projectId`
- `taskId` (nullable)
- `projectStageId` (nullable)
- `eventType`
- `severity`
- `status`
- `payloadJson`
- `createdAt`
- `resolvedAt` (nullable)

### 34. `pm_performance_events`

Purpose:

- auditable scoring inputs

Key fields:

- `id`
- `organizationId`
- `userId`
- `projectId`
- `taskId` (nullable)
- `eventType`
- `scoreDelta`
- `createdAt`

### 35. `pm_score_snapshots`

Purpose:

- periodic aggregate scores for dashboards and reviews

Key fields:

- `id`
- `organizationId`
- `userId`
- `periodType`
- `periodStart`
- `periodEnd`
- `scoreValue`
- `createdAt`

## Fields That Can Start as Enums or Config

These do not need their own tables in the first schema pass unless complexity grows:

- `projectType`
- `serviceType`
- `departmentCode`
- `clientReviewMode`
- `dependencyType`
- `task priority`
- `healthStatus`
- `messageType`
- `attachmentType`
- `notification status`
- `escalation severity`

## Key Relationships

- one template -> many template stages
- one template stage -> many template tasks
- one template stage -> many template dependencies
- one engagement -> many projects
- one project -> many project stages
- one project stage -> many tasks
- one task -> many assignments
- one task -> many submissions
- one submission -> many self-QC responses
- one submission -> many QC reviews over time
- one project -> many deliverable packages
- one deliverable package -> many approval requests over time if resent
- one thread -> many messages
- one file asset -> many versions
- one file asset -> many links

## Index Direction

The first schema pass should plan indexes for:

- `(organizationId, createdAt)`
- `(organizationId, status)`
- `(projectId, status)`
- `(projectStageId, status)`
- `(taskId, isCurrent)` for assignments
- `(threadId, createdAt)` for messages
- `(fileAssetId, versionNumber)` for file versions
- `(scopeType, scopeId)` for link and activity lookups

## First Implementation Slice Recommendation

The first PM backend slice should implement the smallest useful chain:

1. `pm_service_templates`
2. `pm_template_stages`
3. `pm_template_tasks`
4. `pm_engagements`
5. `pm_projects`
6. `pm_project_stages`
7. `pm_tasks`

This allows:

- template definition
- project creation from template
- visible live stages
- visible live tasks

That first slice should land before deeper QC, approvals, threads, and files.
