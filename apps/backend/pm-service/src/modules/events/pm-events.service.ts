/**
 * PmEventsService — PM-BE-018
 *
 * Emits PM domain events following the shared event contract from
 * docs/phase-0-event-contracts.md.
 *
 * Phase 0 implementation:
 *  - Uses Node.js built-in EventEmitter for in-process pub/sub
 *  - Also persists events to pm_activity_logs for auditability
 *
 * Migration path:
 *  - Replace the `this.emitter.emit()` call with an outbox-pattern DB write
 *    or a direct publish to RabbitMQ / Kafka when the event bus is introduced.
 *  - Payload shapes must NOT change — they are the contracts.
 *
 * Envelope:
 *   eventId       — UUID v4
 *   eventName     — past-tense string (e.g. "pm.task_assigned")
 *   occurredAt    — ISO8601
 *   organizationId
 *   brandId       — nullable
 *   sourceService — "pm-service"
 *   correlationId — nullable, pass-through from upstream
 *   payload       — event-specific data
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AppModule, GlobalNotificationType } from '@prisma/client';
import { PrismaService } from '@sentra-core/prisma-client';

// ---------------------------------------------------------------------------
// Envelope type
// ---------------------------------------------------------------------------

export interface PmEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventName: string;
  occurredAt: string;
  organizationId: string;
  brandId: string | null;
  sourceService: 'pm-service';
  correlationId: string | null;
  payload: T;
}

// ---------------------------------------------------------------------------
// Payload types (match phase-0-event-contracts.md)
// ---------------------------------------------------------------------------

export interface ProjectCreatedPayload {
  engagementId: string;
  projectId: string;
  projectType: string;
  serviceType: string;
  ownerLeadIds: string[];
  createdById: string;
}

export interface TaskAssignedPayload {
  projectId: string;
  projectStageId: string;
  taskId: string;
  assignedToId: string;
  assignedById: string;
  assignmentType: string;
}

export interface TaskSubmittedPayload {
  projectId: string;
  projectStageId: string;
  taskId: string;
  taskSubmissionId: string;
  submittedById: string;
  requiresQc: boolean;
}

export interface QcReviewCompletedPayload {
  projectId: string;
  taskId: string;
  taskSubmissionId: string;
  reviewId: string;
  decision: string;
  reviewerId: string;
}

export interface MentionCreatedPayload {
  threadId: string;
  messageId: string;
  mentionedUserId: string;
  mentionedById: string;
  scopeType: string;
  scopeId: string;
}

export interface ApprovalRequestedPayload {
  projectId: string;
  approvalRequestId: string;
  approvalTargetType: string;
  approvalTargetUserId: string | null;
  approvalTargetEmail: string | null;
  deliverablePackageId: string;
}

export interface ApprovalDecidedPayload {
  projectId: string;
  approvalRequestId: string;
  approvalSnapshotId: string;
  decision: string;
  actedByUserId: string | null;
}

// ---------------------------------------------------------------------------
// Singleton emitter — shared across all service instances in the process
// ---------------------------------------------------------------------------

const pmBusEmitter = new EventEmitter();
pmBusEmitter.setMaxListeners(50);

/** Subscribe to any PM event bus event outside this service. */
export const onPmEvent = (
  eventName: string,
  handler: (envelope: PmEventEnvelope) => void,
): void => {
  pmBusEmitter.on(eventName, handler);
};

// ---------------------------------------------------------------------------

@Injectable()
export class PmEventsService {
  private readonly logger = new Logger(PmEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Private envelope builder
  // -------------------------------------------------------------------------

  private buildEnvelope<T>(
    eventName: string,
    organizationId: string,
    payload: T,
    brandId?: string | null,
    correlationId?: string | null,
  ): PmEventEnvelope<T> {
    return {
      eventId: uuidv4(),
      eventName,
      occurredAt: new Date().toISOString(),
      organizationId,
      brandId: brandId ?? null,
      sourceService: 'pm-service',
      correlationId: correlationId ?? null,
      payload,
    };
  }

  /**
   * Emit on the in-process bus.
   * Persist to pm_activity_logs for audit visibility.
   * Fire-and-forget — errors are logged but never throw.
   */
  private emit<T>(envelope: PmEventEnvelope<T>): void {
    pmBusEmitter.emit(envelope.eventName, envelope);
    this.logger.debug(`[PM Event] ${envelope.eventName} | org=${envelope.organizationId}`);

    // Non-blocking persistence to activity log
    this.persistToActivityLog(envelope).catch((err: unknown) => {
      this.logger.error(
        `Failed to persist event ${envelope.eventName} to activity log`,
        err,
      );
    });

    this.persistNotification(envelope).catch((err: unknown) => {
      this.logger.error(
        `Failed to persist notification for ${envelope.eventName}`,
        err,
      );
    });
  }

  private async persistToActivityLog<T>(envelope: PmEventEnvelope<T>): Promise<void> {
    const payload = envelope.payload as Record<string, unknown>;
    const projectId =
      (payload['projectId'] as string | undefined) ?? null;

    if (!projectId) return; // skip events without a project scope

    await this.prisma.pmActivityLog.create({
      data: {
        organizationId: envelope.organizationId,
        projectId,
        scopeType: 'PROJECT',
        scopeId: projectId,
        actorUserId: null,
        eventType: envelope.eventName,
        payloadJson: envelope as object,
      },
    }).catch(() => {
      // Silently ignore DB errors for activity log — never block the caller
    });
  }

  private async persistNotification<T>(envelope: PmEventEnvelope<T>): Promise<void> {
    const payload = envelope.payload as Record<string, unknown>;
    const projectId = (payload['projectId'] as string | undefined) ?? null;

    let targetUserId: string | null = null;
    let notifType: GlobalNotificationType | null = null;
    let title = '';
    let body = '';
    let entityType: string | undefined;
    let entityId: string | undefined;

    if (envelope.eventName === 'pm.task_assigned') {
      targetUserId = (payload['assignedToId'] as string | undefined) ?? null;
      notifType = GlobalNotificationType.TASK_ASSIGNED;
      title = 'Task Assigned';
      body = 'A task has been assigned to you.';
      entityType = 'task';
      entityId = (payload['taskId'] as string | undefined) ?? undefined;
    } else if (envelope.eventName === 'pm.mention_created') {
      targetUserId = (payload['mentionedUserId'] as string | undefined) ?? null;
      notifType = GlobalNotificationType.MENTION;
      title = 'You were mentioned';
      body = 'You were mentioned in a PM thread.';
      entityType = (payload['scopeType'] as string | undefined)?.toLowerCase() ?? 'thread';
      entityId = (payload['scopeId'] as string | undefined) ?? undefined;
    } else if (envelope.eventName === 'pm.approval_requested') {
      targetUserId = (payload['approvalTargetUserId'] as string | undefined) ?? null;
      notifType = GlobalNotificationType.APPROVAL_REQUESTED;
      title = 'Approval Requested';
      body = 'Your approval is required.';
      entityType = 'approval';
      entityId = (payload['approvalRequestId'] as string | undefined) ?? undefined;
    }

    if (!targetUserId || !notifType) return;

    await this.prisma.globalNotification.create({
      data: {
        organizationId: envelope.organizationId,
        recipientId: targetUserId,
        type: notifType,
        module: AppModule.PM,
        title,
        body,
        entityType,
        entityId,
        data: {
          projectId,
          eventName: envelope.eventName,
          payload: envelope.payload as object,
        },
      },
    }).catch(() => {
      // Notification persistence must not block business flow.
    });
  }

  // -------------------------------------------------------------------------
  // pm.project_created
  // -------------------------------------------------------------------------

  emitProjectCreated(
    organizationId: string,
    payload: ProjectCreatedPayload,
    brandId?: string,
  ): void {
    this.emit(this.buildEnvelope('pm.project_created', organizationId, payload, brandId));
  }

  // -------------------------------------------------------------------------
  // pm.task_assigned
  // -------------------------------------------------------------------------

  emitTaskAssigned(organizationId: string, payload: TaskAssignedPayload): void {
    this.emit(this.buildEnvelope('pm.task_assigned', organizationId, payload));
  }

  // -------------------------------------------------------------------------
  // pm.task_submitted
  // -------------------------------------------------------------------------

  emitTaskSubmitted(organizationId: string, payload: TaskSubmittedPayload): void {
    this.emit(this.buildEnvelope('pm.task_submitted', organizationId, payload));
  }

  // -------------------------------------------------------------------------
  // pm.qc_review_completed
  // -------------------------------------------------------------------------

  emitQcReviewCompleted(organizationId: string, payload: QcReviewCompletedPayload): void {
    this.emit(this.buildEnvelope('pm.qc_review_completed', organizationId, payload));
  }

  // -------------------------------------------------------------------------
  // pm.mention_created
  // -------------------------------------------------------------------------

  emitMentionCreated(organizationId: string, payload: MentionCreatedPayload): void {
    this.emit(this.buildEnvelope('pm.mention_created', organizationId, payload));
  }

  // -------------------------------------------------------------------------
  // pm.approval_requested
  // -------------------------------------------------------------------------

  emitApprovalRequested(organizationId: string, payload: ApprovalRequestedPayload): void {
    this.emit(this.buildEnvelope('pm.approval_requested', organizationId, payload));
  }

  // -------------------------------------------------------------------------
  // pm.approval_decided
  // -------------------------------------------------------------------------

  emitApprovalDecided(organizationId: string, payload: ApprovalDecidedPayload): void {
    this.emit(this.buildEnvelope('pm.approval_decided', organizationId, payload));
  }
}
