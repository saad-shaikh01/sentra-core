/**
 * PM Domain Enums
 *
 * These mirror the Prisma schema enums so that controllers and services
 * can import them without pulling in the full Prisma client in DTO layers.
 *
 * Keep these in sync with schema.prisma whenever enum values change.
 * Source of truth for DB values: libs/backend/prisma-client/prisma/schema.prisma
 */

// ---------------------------------------------------------------------------
// Engagement & Project Ownership
// ---------------------------------------------------------------------------

export enum PmProjectOwnerType {
  CLIENT = 'CLIENT',
  INTERNAL_BRAND = 'INTERNAL_BRAND',
}

export enum PmProjectType {
  EXTERNAL = 'EXTERNAL',
  INTERNAL = 'INTERNAL',
}

// ---------------------------------------------------------------------------
// Service & Department Classification
// ---------------------------------------------------------------------------

export enum PmServiceType {
  PUBLISHING = 'PUBLISHING',
  MARKETING = 'MARKETING',
  WEB_DEVELOPMENT = 'WEB_DEVELOPMENT',
  DESIGN = 'DESIGN',
  GENERAL = 'GENERAL',
}

export enum PmDepartmentCode {
  DESIGN = 'DESIGN',
  EDITING = 'EDITING',
  MARKETING = 'MARKETING',
  DEVELOPMENT = 'DEVELOPMENT',
  QC = 'QC',
  OPERATIONS = 'OPERATIONS',
}

// ---------------------------------------------------------------------------
// Engagement Status
// ---------------------------------------------------------------------------

export enum PmEngagementStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// Project Status & Health
// ---------------------------------------------------------------------------

export enum PmProjectStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PmProjectPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum PmHealthStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  OFF_TRACK = 'OFF_TRACK',
  BLOCKED = 'BLOCKED',
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export enum PmStageStatus {
  PENDING = 'PENDING',
  READY = 'READY',
  ACTIVE = 'ACTIVE',
  IN_REVIEW = 'IN_REVIEW',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export enum PmClientReviewMode {
  NONE = 'NONE',
  OPTIONAL = 'OPTIONAL',
  REQUIRED = 'REQUIRED',
}

export enum PmDependencyType {
  FINISH_TO_START = 'FINISH_TO_START',
  START_TO_START = 'START_TO_START',
  FINISH_TO_FINISH = 'FINISH_TO_FINISH',
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export enum PmTaskStatus {
  PENDING = 'PENDING',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  IN_QC = 'IN_QC',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

export enum PmTaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum PmAssignmentType {
  MANUAL = 'MANUAL',
  CLAIM = 'CLAIM',
  REASSIGN = 'REASSIGN',
  AUTO = 'AUTO',
}

// ---------------------------------------------------------------------------
// QC & Submission
// ---------------------------------------------------------------------------

export enum PmChecklistType {
  SELF_QC = 'SELF_QC',
  QC_REVIEW = 'QC_REVIEW',
}

export enum PmSubmissionStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum PmReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ---------------------------------------------------------------------------
// Revision
// ---------------------------------------------------------------------------

export enum PmRevisionSourceType {
  INTERNAL = 'INTERNAL',
  CLIENT = 'CLIENT',
  APPROVER = 'APPROVER',
}

export enum PmRevisionStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// Deliverable & Approval
// ---------------------------------------------------------------------------

export enum PmDeliverableType {
  CLIENT = 'CLIENT',
  INTERNAL = 'INTERNAL',
}

export enum PmApprovalTargetType {
  CLIENT = 'CLIENT',
  INTERNAL_APPROVER = 'INTERNAL_APPROVER',
}

export enum PmApprovalRequestStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PmApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ---------------------------------------------------------------------------
// Threads & Messages
// ---------------------------------------------------------------------------

export enum PmThreadScopeType {
  PROJECT = 'PROJECT',
  STAGE = 'STAGE',
  TASK = 'TASK',
  APPROVAL = 'APPROVAL',
}

export enum PmThreadVisibility {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
}

export enum PmMessageType {
  COMMENT = 'COMMENT',
  STATUS_NOTE = 'STATUS_NOTE',
  APPROVAL_NOTE = 'APPROVAL_NOTE',
  SYSTEM = 'SYSTEM',
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export enum PmFileAssetType {
  REFERENCE = 'REFERENCE',
  WORKING = 'WORKING',
  SUBMISSION = 'SUBMISSION',
  REVIEW_FEEDBACK = 'REVIEW_FEEDBACK',
  FINAL_DELIVERABLE = 'FINAL_DELIVERABLE',
  APPROVED_VERSION = 'APPROVED_VERSION',
}

export enum PmFileScopeType {
  PROJECT = 'PROJECT',
  STAGE = 'STAGE',
  TASK = 'TASK',
  SUBMISSION = 'SUBMISSION',
  DELIVERABLE = 'DELIVERABLE',
  MESSAGE = 'MESSAGE',
}

export enum PmFileLinkType {
  PRIMARY = 'PRIMARY',
  REFERENCE = 'REFERENCE',
  ATTACHMENT = 'ATTACHMENT',
  PUBLISHED = 'PUBLISHED',
  APPROVED = 'APPROVED',
}

export enum PmFileActionType {
  PREVIEW = 'PREVIEW',
  DOWNLOAD = 'DOWNLOAD',
  SHARE = 'SHARE',
}

// ---------------------------------------------------------------------------
// Notifications & Analytics
// ---------------------------------------------------------------------------

export enum PmNotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
}

export enum PmEscalationSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PmEscalationStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
}

export enum PmPerformancePeriodType {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}
