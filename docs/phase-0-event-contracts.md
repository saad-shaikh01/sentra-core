# Phase 0 Event Contracts

Status: Working event baseline
Purpose: Define the first inter-service events so backend agents can build toward stable service communication.

## Event Design Rules

- events describe facts that already happened
- event names use past-tense meaning
- payloads should contain stable IDs, not huge nested objects
- every event should include tenant context
- consumers should be able to retry safely where possible

## Shared Envelope

Every event should carry a common envelope shape:

```text
eventId
eventName
occurredAt
organizationId
brandId (nullable)
sourceService
correlationId
payload
```

## Initial Required Events

### 1. `core.payment_confirmed`

Producer:

- `core-service`

Consumers:

- `pm-service`
- `comm-service`

Purpose:

- trigger project or engagement creation after commercial confirmation

Payload:

- `saleId`
- `invoiceId` (nullable)
- `clientId`
- `brandId`
- `serviceType`
- `templateId` (nullable)
- `paidAmount`
- `paymentMethod`
- `confirmedByUserId` (nullable)

### 2. `pm.project_created`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- notify relevant internal users that a new project is ready

Payload:

- `engagementId`
- `projectId`
- `projectType`
- `serviceType`
- `ownerLeadIds`
- `createdById`

### 3. `pm.task_assigned`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- notify the assignee and record assignment-related downstream work

Payload:

- `projectId`
- `projectStageId`
- `taskId`
- `assignedToId`
- `assignedById`
- `assignmentType`

### 4. `pm.task_submitted`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- notify QC or reviewers that a task is waiting

Payload:

- `projectId`
- `projectStageId`
- `taskId`
- `taskSubmissionId`
- `submittedById`
- `requiresQc`

### 5. `pm.qc_review_completed`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- notify assignee and leads when QC approves or rejects work

Payload:

- `projectId`
- `taskId`
- `taskSubmissionId`
- `reviewId`
- `decision`
- `reviewerId`

### 6. `pm.mention_created`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- trigger mention notifications

Payload:

- `threadId`
- `messageId`
- `mentionedUserId`
- `mentionedById`
- `scopeType`
- `scopeId`

### 7. `pm.approval_requested`

Producer:

- `pm-service`

Consumers:

- `comm-service`

Purpose:

- send client or internal approver notification

Payload:

- `projectId`
- `approvalRequestId`
- `approvalTargetType`
- `approvalTargetUserId` (nullable)
- `approvalTargetEmail` (nullable)
- `deliverablePackageId`

### 8. `pm.approval_decided`

Producer:

- `pm-service`

Consumers:

- `comm-service`
- optional `core-service` consumers later if billing or commercial follow-up is needed

Purpose:

- notify teams of approval or rejection

Payload:

- `projectId`
- `approvalRequestId`
- `approvalSnapshotId`
- `decision`
- `actedByUserId` (nullable)

### 9. `core.plan_changed`

Producer:

- `core-service`

Consumers:

- `pm-service`
- `comm-service`
- future `hrms-service`

Purpose:

- update feature access and plan-linked limits

Payload:

- `organizationId`
- `oldPlan`
- `newPlan`
- `effectiveAt`

## Future Events Reserved

These do not need immediate implementation, but the naming direction should remain consistent:

- `comm.email_received`
- `comm.email_sync_completed`
- `hrms.attendance_session_closed`
- `hrms.payroll_run_completed`
- `pm.project_closed`
- `pm.escalation_created`

## Phase 0 Implementation Note

The first backend implementation does not need full event bus plumbing on day one, but these contracts should be treated as the target shape so services do not drift into incompatible local assumptions.
