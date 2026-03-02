/*
  Warnings:

  - A unique constraint covering the columns `[portalDomain]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[portalSubdomain]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customPortalDomain]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.
  - Made the column `organizationId` on table `Sale` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PmProjectOwnerType" AS ENUM ('CLIENT', 'INTERNAL_BRAND');

-- CreateEnum
CREATE TYPE "PmEngagementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PmServiceType" AS ENUM ('PUBLISHING', 'MARKETING', 'WEB_DEVELOPMENT', 'DESIGN', 'GENERAL');

-- CreateEnum
CREATE TYPE "PmProjectType" AS ENUM ('EXTERNAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PmProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'BLOCKED', 'WAITING_APPROVAL', 'REVISION_REQUIRED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PmProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PmHealthStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PmDepartmentCode" AS ENUM ('DESIGN', 'EDITING', 'MARKETING', 'DEVELOPMENT', 'QC', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "PmClientReviewMode" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "PmStageStatus" AS ENUM ('PENDING', 'READY', 'ACTIVE', 'IN_REVIEW', 'BLOCKED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PmTaskStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'SUBMITTED', 'IN_QC', 'REVISION_REQUIRED', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PmTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PmDependencyType" AS ENUM ('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH');

-- CreateEnum
CREATE TYPE "PmChecklistType" AS ENUM ('SELF_QC', 'QC_REVIEW');

-- CreateEnum
CREATE TYPE "PmAssignmentType" AS ENUM ('MANUAL', 'CLAIM', 'REASSIGN', 'AUTO');

-- CreateEnum
CREATE TYPE "PmSubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PmReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PmRevisionSourceType" AS ENUM ('INTERNAL', 'CLIENT', 'APPROVER');

-- CreateEnum
CREATE TYPE "PmRevisionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PmDeliverableType" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PmApprovalTargetType" AS ENUM ('CLIENT', 'INTERNAL_APPROVER');

-- CreateEnum
CREATE TYPE "PmApprovalRequestStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PmApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PmThreadScopeType" AS ENUM ('PROJECT', 'STAGE', 'TASK', 'APPROVAL');

-- CreateEnum
CREATE TYPE "PmThreadVisibility" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "PmMessageType" AS ENUM ('COMMENT', 'STATUS_NOTE', 'APPROVAL_NOTE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PmFileAssetType" AS ENUM ('REFERENCE', 'WORKING', 'SUBMISSION', 'REVIEW_FEEDBACK', 'FINAL_DELIVERABLE', 'APPROVED_VERSION');

-- CreateEnum
CREATE TYPE "PmFileScopeType" AS ENUM ('PROJECT', 'STAGE', 'TASK', 'SUBMISSION', 'DELIVERABLE', 'MESSAGE');

-- CreateEnum
CREATE TYPE "PmFileLinkType" AS ENUM ('PRIMARY', 'REFERENCE', 'ATTACHMENT', 'PUBLISHED', 'APPROVED');

-- CreateEnum
CREATE TYPE "PmFileActionType" AS ENUM ('PREVIEW', 'DOWNLOAD', 'SHARE');

-- CreateEnum
CREATE TYPE "PmNotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PmEscalationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PmEscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PmPerformancePeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "customPortalDomain" TEXT,
ADD COLUMN     "portalDomain" TEXT,
ADD COLUMN     "portalSubdomain" TEXT,
ADD COLUMN     "themeConfig" JSONB;

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "planType" "PlanType" NOT NULL DEFAULT 'FREE';

-- AlterTable
ALTER TABLE "Sale" RENAME CONSTRAINT "Order_pkey" TO "Sale_pkey";

-- AlterTable
ALTER TABLE "Sale"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PmServiceTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "serviceType" "PmServiceType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTemplateStage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentCode" "PmDepartmentCode" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "defaultSlaHours" INTEGER,
    "clientReviewMode" "PmClientReviewMode" NOT NULL DEFAULT 'NONE',
    "requiresStageApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresQcByDefault" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "allowsParallel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PmTemplateStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTemplateStageDependency" (
    "id" TEXT NOT NULL,
    "templateStageId" TEXT NOT NULL,
    "dependsOnTemplateStageId" TEXT NOT NULL,
    "dependencyType" "PmDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',

    CONSTRAINT "PmTemplateStageDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTemplateTask" (
    "id" TEXT NOT NULL,
    "templateStageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "defaultAssigneeRole" "UserRole",
    "requiresQc" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "estimatedHours" INTEGER,

    CONSTRAINT "PmTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTemplateChecklist" (
    "id" TEXT NOT NULL,
    "templateStageId" TEXT,
    "templateTaskId" TEXT,
    "checklistType" "PmChecklistType" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PmTemplateChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmEngagement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerType" "PmProjectOwnerType" NOT NULL,
    "clientId" TEXT,
    "ownerBrandId" TEXT,
    "primaryBrandId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PmEngagementStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "PmProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "clientId" TEXT,
    "templateId" TEXT,
    "projectType" "PmProjectType" NOT NULL,
    "serviceType" "PmServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PmProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "PmProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "healthStatus" "PmHealthStatus" NOT NULL DEFAULT 'ON_TRACK',
    "deliveryDueAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmProjectStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateStageId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentCode" "PmDepartmentCode" NOT NULL,
    "status" "PmStageStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL,
    "ownerLeadId" TEXT,
    "clientReviewMode" "PmClientReviewMode" NOT NULL DEFAULT 'NONE',
    "requiresStageApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresQcByDefault" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmStageDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectStageId" TEXT NOT NULL,
    "dependsOnProjectStageId" TEXT NOT NULL,
    "dependencyType" "PmDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',

    CONSTRAINT "PmStageDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectStageId" TEXT NOT NULL,
    "templateTaskId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PmTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "PmTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "sortOrder" INTEGER NOT NULL,
    "ownerLeadId" TEXT,
    "assigneeId" TEXT,
    "requiresQc" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "assignmentType" "PmAssignmentType" NOT NULL DEFAULT 'MANUAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "PmTaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTaskWorklog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmTaskWorklog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmTaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submissionNumber" INTEGER NOT NULL,
    "status" "PmSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmTaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmSelfQcResponse" (
    "id" TEXT NOT NULL,
    "taskSubmissionId" TEXT NOT NULL,
    "templateChecklistId" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "responseText" TEXT,

    CONSTRAINT "PmSelfQcResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmQcReview" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskSubmissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "PmReviewDecision" NOT NULL,
    "reviewNumber" INTEGER NOT NULL,
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmQcReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmBypassRecord" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "projectStageId" TEXT,
    "actedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "redFlag" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmBypassRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmRevisionRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "sourceType" "PmRevisionSourceType" NOT NULL,
    "sourceUserId" TEXT,
    "requestType" TEXT NOT NULL,
    "status" "PmRevisionStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PmRevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmDeliverablePackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deliveryType" "PmDeliverableType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmDeliverablePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmDeliverableItem" (
    "id" TEXT NOT NULL,
    "deliverablePackageId" TEXT NOT NULL,
    "taskSubmissionId" TEXT,
    "fileAssetId" TEXT,
    "fileVersionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,

    CONSTRAINT "PmDeliverableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmApprovalRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deliverablePackageId" TEXT NOT NULL,
    "approvalTargetType" "PmApprovalTargetType" NOT NULL,
    "approvalTargetUserId" TEXT,
    "approvalTargetEmail" TEXT,
    "status" "PmApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "PmApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmApprovalSnapshot" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "decision" "PmApprovalDecision" NOT NULL,
    "actedByUserId" TEXT,
    "actorIp" TEXT,
    "notes" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmApprovalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmProjectClosureRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closureReason" TEXT NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmProjectClosureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmConversationThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scopeType" "PmThreadScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "visibility" "PmThreadVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentMessageId" TEXT,
    "messageType" "PmMessageType" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmMessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmMessageMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "fileVersionId" TEXT,
    "attachmentType" "PmFileLinkType" NOT NULL DEFAULT 'ATTACHMENT',

    CONSTRAINT "PmMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PmThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmFileAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" "PmFileAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmFileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmFileVersion" (
    "id" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PmFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmFileLink" (
    "id" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "fileVersionId" TEXT,
    "scopeType" "PmFileScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "linkType" "PmFileLinkType" NOT NULL DEFAULT 'REFERENCE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmFileLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmFileAccessLog" (
    "id" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "fileVersionId" TEXT,
    "userId" TEXT NOT NULL,
    "actionType" "PmFileActionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmFileAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "status" "PmNotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "PmNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmActivityLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmEscalationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectStageId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" "PmEscalationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "PmEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PmEscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmPerformanceEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "eventType" TEXT NOT NULL,
    "scoreDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmPerformanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmScoreSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "PmPerformancePeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scoreValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PmServiceTemplate_organizationId_isActive_serviceType_idx" ON "PmServiceTemplate"("organizationId", "isActive", "serviceType");

-- CreateIndex
CREATE INDEX "PmServiceTemplate_brandId_idx" ON "PmServiceTemplate"("brandId");

-- CreateIndex
CREATE INDEX "PmTemplateStage_templateId_sortOrder_idx" ON "PmTemplateStage"("templateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PmTemplateStage_templateId_name_key" ON "PmTemplateStage"("templateId", "name");

-- CreateIndex
CREATE INDEX "PmTemplateStageDependency_templateStageId_idx" ON "PmTemplateStageDependency"("templateStageId");

-- CreateIndex
CREATE UNIQUE INDEX "PmTemplateStageDependency_templateStageId_dependsOnTemplate_key" ON "PmTemplateStageDependency"("templateStageId", "dependsOnTemplateStageId");

-- CreateIndex
CREATE INDEX "PmTemplateTask_templateStageId_sortOrder_idx" ON "PmTemplateTask"("templateStageId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PmTemplateTask_templateStageId_name_key" ON "PmTemplateTask"("templateStageId", "name");

-- CreateIndex
CREATE INDEX "PmTemplateChecklist_templateStageId_checklistType_idx" ON "PmTemplateChecklist"("templateStageId", "checklistType");

-- CreateIndex
CREATE INDEX "PmTemplateChecklist_templateTaskId_checklistType_idx" ON "PmTemplateChecklist"("templateTaskId", "checklistType");

-- CreateIndex
CREATE INDEX "PmEngagement_organizationId_status_createdAt_idx" ON "PmEngagement"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PmEngagement_clientId_idx" ON "PmEngagement"("clientId");

-- CreateIndex
CREATE INDEX "PmEngagement_ownerBrandId_idx" ON "PmEngagement"("ownerBrandId");

-- CreateIndex
CREATE INDEX "PmProject_organizationId_brandId_status_deliveryDueAt_idx" ON "PmProject"("organizationId", "brandId", "status", "deliveryDueAt");

-- CreateIndex
CREATE INDEX "PmProject_engagementId_idx" ON "PmProject"("engagementId");

-- CreateIndex
CREATE INDEX "PmProject_templateId_idx" ON "PmProject"("templateId");

-- CreateIndex
CREATE INDEX "PmProjectStage_projectId_sortOrder_status_idx" ON "PmProjectStage"("projectId", "sortOrder", "status");

-- CreateIndex
CREATE INDEX "PmProjectStage_ownerLeadId_status_idx" ON "PmProjectStage"("ownerLeadId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PmProjectStage_projectId_name_key" ON "PmProjectStage"("projectId", "name");

-- CreateIndex
CREATE INDEX "PmStageDependency_projectId_idx" ON "PmStageDependency"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PmStageDependency_projectStageId_dependsOnProjectStageId_key" ON "PmStageDependency"("projectStageId", "dependsOnProjectStageId");

-- CreateIndex
CREATE INDEX "PmTask_organizationId_assigneeId_status_dueAt_idx" ON "PmTask"("organizationId", "assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "PmTask_projectStageId_sortOrder_status_idx" ON "PmTask"("projectStageId", "sortOrder", "status");

-- CreateIndex
CREATE INDEX "PmTask_projectId_status_idx" ON "PmTask"("projectId", "status");

-- CreateIndex
CREATE INDEX "PmTaskAssignment_taskId_isCurrent_idx" ON "PmTaskAssignment"("taskId", "isCurrent");

-- CreateIndex
CREATE INDEX "PmTaskAssignment_assignedToId_isCurrent_idx" ON "PmTaskAssignment"("assignedToId", "isCurrent");

-- CreateIndex
CREATE INDEX "PmTaskWorklog_taskId_startedAt_idx" ON "PmTaskWorklog"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "PmTaskWorklog_userId_startedAt_idx" ON "PmTaskWorklog"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "PmTaskSubmission_taskId_submissionNumber_idx" ON "PmTaskSubmission"("taskId", "submissionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PmTaskSubmission_taskId_submissionNumber_key" ON "PmTaskSubmission"("taskId", "submissionNumber");

-- CreateIndex
CREATE INDEX "PmSelfQcResponse_taskSubmissionId_idx" ON "PmSelfQcResponse"("taskSubmissionId");

-- CreateIndex
CREATE INDEX "PmQcReview_taskId_reviewedAt_idx" ON "PmQcReview"("taskId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PmQcReview_taskSubmissionId_reviewNumber_key" ON "PmQcReview"("taskSubmissionId", "reviewNumber");

-- CreateIndex
CREATE INDEX "PmBypassRecord_taskId_idx" ON "PmBypassRecord"("taskId");

-- CreateIndex
CREATE INDEX "PmBypassRecord_projectStageId_idx" ON "PmBypassRecord"("projectStageId");

-- CreateIndex
CREATE INDEX "PmRevisionRequest_projectId_status_createdAt_idx" ON "PmRevisionRequest"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PmRevisionRequest_taskId_idx" ON "PmRevisionRequest"("taskId");

-- CreateIndex
CREATE INDEX "PmDeliverablePackage_projectId_createdAt_idx" ON "PmDeliverablePackage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PmDeliverableItem_deliverablePackageId_sortOrder_idx" ON "PmDeliverableItem"("deliverablePackageId", "sortOrder");

-- CreateIndex
CREATE INDEX "PmApprovalRequest_projectId_status_sentAt_idx" ON "PmApprovalRequest"("projectId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "PmApprovalRequest_deliverablePackageId_idx" ON "PmApprovalRequest"("deliverablePackageId");

-- CreateIndex
CREATE INDEX "PmApprovalSnapshot_approvalRequestId_actedAt_idx" ON "PmApprovalSnapshot"("approvalRequestId", "actedAt");

-- CreateIndex
CREATE INDEX "PmProjectClosureRecord_projectId_closedAt_idx" ON "PmProjectClosureRecord"("projectId", "closedAt");

-- CreateIndex
CREATE INDEX "PmConversationThread_projectId_scopeType_idx" ON "PmConversationThread"("projectId", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "PmConversationThread_projectId_scopeType_scopeId_key" ON "PmConversationThread"("projectId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "PmMessage_threadId_createdAt_idx" ON "PmMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "PmMessage_parentMessageId_idx" ON "PmMessage"("parentMessageId");

-- CreateIndex
CREATE INDEX "PmMessageMention_mentionedUserId_createdAt_idx" ON "PmMessageMention"("mentionedUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PmMessageMention_messageId_mentionedUserId_key" ON "PmMessageMention"("messageId", "mentionedUserId");

-- CreateIndex
CREATE INDEX "PmMessageAttachment_messageId_idx" ON "PmMessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "PmMessageAttachment_fileAssetId_idx" ON "PmMessageAttachment"("fileAssetId");

-- CreateIndex
CREATE INDEX "PmThreadParticipant_userId_lastReadAt_idx" ON "PmThreadParticipant"("userId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "PmThreadParticipant_threadId_userId_key" ON "PmThreadParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "PmFileAsset_organizationId_createdAt_idx" ON "PmFileAsset"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PmFileAsset_projectId_assetType_createdAt_idx" ON "PmFileAsset"("projectId", "assetType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PmFileVersion_storageKey_key" ON "PmFileVersion"("storageKey");

-- CreateIndex
CREATE INDEX "PmFileVersion_fileAssetId_versionNumber_idx" ON "PmFileVersion"("fileAssetId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PmFileVersion_fileAssetId_versionNumber_key" ON "PmFileVersion"("fileAssetId", "versionNumber");

-- CreateIndex
CREATE INDEX "PmFileLink_scopeType_scopeId_idx" ON "PmFileLink"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "PmFileLink_fileAssetId_idx" ON "PmFileLink"("fileAssetId");

-- CreateIndex
CREATE INDEX "PmFileLink_fileVersionId_idx" ON "PmFileLink"("fileVersionId");

-- CreateIndex
CREATE INDEX "PmFileAccessLog_fileAssetId_createdAt_idx" ON "PmFileAccessLog"("fileAssetId", "createdAt");

-- CreateIndex
CREATE INDEX "PmFileAccessLog_userId_createdAt_idx" ON "PmFileAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PmNotification_userId_status_createdAt_idx" ON "PmNotification"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PmNotification_organizationId_createdAt_idx" ON "PmNotification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PmActivityLog_projectId_createdAt_idx" ON "PmActivityLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PmActivityLog_organizationId_createdAt_idx" ON "PmActivityLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PmEscalationEvent_projectId_status_createdAt_idx" ON "PmEscalationEvent"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PmEscalationEvent_taskId_idx" ON "PmEscalationEvent"("taskId");

-- CreateIndex
CREATE INDEX "PmEscalationEvent_projectStageId_idx" ON "PmEscalationEvent"("projectStageId");

-- CreateIndex
CREATE INDEX "PmPerformanceEvent_userId_createdAt_idx" ON "PmPerformanceEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PmPerformanceEvent_projectId_createdAt_idx" ON "PmPerformanceEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PmScoreSnapshot_userId_periodStart_periodEnd_idx" ON "PmScoreSnapshot"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PmScoreSnapshot_organizationId_createdAt_idx" ON "PmScoreSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_portalDomain_key" ON "Brand"("portalDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_portalSubdomain_key" ON "Brand"("portalSubdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_customPortalDomain_key" ON "Brand"("customPortalDomain");

-- AddForeignKey
ALTER TABLE "PmTemplateStage" ADD CONSTRAINT "PmTemplateStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PmServiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTemplateStageDependency" ADD CONSTRAINT "PmTemplateStageDependency_templateStageId_fkey" FOREIGN KEY ("templateStageId") REFERENCES "PmTemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTemplateStageDependency" ADD CONSTRAINT "PmTemplateStageDependency_dependsOnTemplateStageId_fkey" FOREIGN KEY ("dependsOnTemplateStageId") REFERENCES "PmTemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTemplateTask" ADD CONSTRAINT "PmTemplateTask_templateStageId_fkey" FOREIGN KEY ("templateStageId") REFERENCES "PmTemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTemplateChecklist" ADD CONSTRAINT "PmTemplateChecklist_templateStageId_fkey" FOREIGN KEY ("templateStageId") REFERENCES "PmTemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTemplateChecklist" ADD CONSTRAINT "PmTemplateChecklist_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "PmTemplateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmProject" ADD CONSTRAINT "PmProject_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "PmEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmProject" ADD CONSTRAINT "PmProject_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PmServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmProjectStage" ADD CONSTRAINT "PmProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmProjectStage" ADD CONSTRAINT "PmProjectStage_templateStageId_fkey" FOREIGN KEY ("templateStageId") REFERENCES "PmTemplateStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmStageDependency" ADD CONSTRAINT "PmStageDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmStageDependency" ADD CONSTRAINT "PmStageDependency_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "PmProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmStageDependency" ADD CONSTRAINT "PmStageDependency_dependsOnProjectStageId_fkey" FOREIGN KEY ("dependsOnProjectStageId") REFERENCES "PmProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTask" ADD CONSTRAINT "PmTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTask" ADD CONSTRAINT "PmTask_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "PmProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTask" ADD CONSTRAINT "PmTask_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "PmTemplateTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTaskAssignment" ADD CONSTRAINT "PmTaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTaskWorklog" ADD CONSTRAINT "PmTaskWorklog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmTaskSubmission" ADD CONSTRAINT "PmTaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmSelfQcResponse" ADD CONSTRAINT "PmSelfQcResponse_taskSubmissionId_fkey" FOREIGN KEY ("taskSubmissionId") REFERENCES "PmTaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmSelfQcResponse" ADD CONSTRAINT "PmSelfQcResponse_templateChecklistId_fkey" FOREIGN KEY ("templateChecklistId") REFERENCES "PmTemplateChecklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmQcReview" ADD CONSTRAINT "PmQcReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmQcReview" ADD CONSTRAINT "PmQcReview_taskSubmissionId_fkey" FOREIGN KEY ("taskSubmissionId") REFERENCES "PmTaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmBypassRecord" ADD CONSTRAINT "PmBypassRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmBypassRecord" ADD CONSTRAINT "PmBypassRecord_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "PmProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmRevisionRequest" ADD CONSTRAINT "PmRevisionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmRevisionRequest" ADD CONSTRAINT "PmRevisionRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDeliverablePackage" ADD CONSTRAINT "PmDeliverablePackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDeliverableItem" ADD CONSTRAINT "PmDeliverableItem_deliverablePackageId_fkey" FOREIGN KEY ("deliverablePackageId") REFERENCES "PmDeliverablePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDeliverableItem" ADD CONSTRAINT "PmDeliverableItem_taskSubmissionId_fkey" FOREIGN KEY ("taskSubmissionId") REFERENCES "PmTaskSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDeliverableItem" ADD CONSTRAINT "PmDeliverableItem_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "PmFileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDeliverableItem" ADD CONSTRAINT "PmDeliverableItem_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "PmFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmApprovalRequest" ADD CONSTRAINT "PmApprovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmApprovalRequest" ADD CONSTRAINT "PmApprovalRequest_deliverablePackageId_fkey" FOREIGN KEY ("deliverablePackageId") REFERENCES "PmDeliverablePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmApprovalSnapshot" ADD CONSTRAINT "PmApprovalSnapshot_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "PmApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmProjectClosureRecord" ADD CONSTRAINT "PmProjectClosureRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmConversationThread" ADD CONSTRAINT "PmConversationThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessage" ADD CONSTRAINT "PmMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "PmConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessage" ADD CONSTRAINT "PmMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "PmMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessageMention" ADD CONSTRAINT "PmMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "PmMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessageAttachment" ADD CONSTRAINT "PmMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "PmMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessageAttachment" ADD CONSTRAINT "PmMessageAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "PmFileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmMessageAttachment" ADD CONSTRAINT "PmMessageAttachment_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "PmFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmThreadParticipant" ADD CONSTRAINT "PmThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "PmConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileAsset" ADD CONSTRAINT "PmFileAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileVersion" ADD CONSTRAINT "PmFileVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "PmFileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileLink" ADD CONSTRAINT "PmFileLink_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "PmFileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileLink" ADD CONSTRAINT "PmFileLink_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "PmFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileAccessLog" ADD CONSTRAINT "PmFileAccessLog_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "PmFileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmFileAccessLog" ADD CONSTRAINT "PmFileAccessLog_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "PmFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmNotification" ADD CONSTRAINT "PmNotification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmActivityLog" ADD CONSTRAINT "PmActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmEscalationEvent" ADD CONSTRAINT "PmEscalationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmEscalationEvent" ADD CONSTRAINT "PmEscalationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmEscalationEvent" ADD CONSTRAINT "PmEscalationEvent_projectStageId_fkey" FOREIGN KEY ("projectStageId") REFERENCES "PmProjectStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmPerformanceEvent" ADD CONSTRAINT "PmPerformanceEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmPerformanceEvent" ADD CONSTRAINT "PmPerformanceEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PmTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;


