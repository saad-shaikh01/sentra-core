/**
 * QcReviewsService — PM-BE-014
 *
 * QC review (approve/reject) and bypass record creation.
 *
 * Rules:
 *  - review records are immutable once created
 *  - rejection feedback is required
 *  - bypass requires an explicit reason and is marked redFlag=true
 *  - only submissions in SUBMITTED status can be reviewed
 *  - repeated rejections should be detectable (escalation hook points noted)
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmEventsService } from '../events/pm-events.service';
import { PerformanceService } from '../performance/performance.service';
import { CreateQcReviewDto } from './dto/create-qc-review.dto';
import { CreateBypassDto } from './dto/create-bypass.dto';

@Injectable()
export class QcReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PmEventsService,
    private readonly performance: PerformanceService,
  ) {}

  // -------------------------------------------------------------------------
  // Submit QC review on a submission
  // -------------------------------------------------------------------------

  async createReview(
    organizationId: string,
    submissionId: string,
    reviewerId: string,
    dto: CreateQcReviewDto,
  ) {
    // Load submission with parent task for org scope check
    const submission = await this.prisma.pmTaskSubmission.findFirst({
      where: { id: submissionId },
      include: {
        task: {
          select: {
            id: true,
            organizationId: true,
            projectId: true,
            projectStageId: true,
            status: true,
            assigneeId: true,
          },
        },
      },
    });

    if (!submission || submission.task.organizationId !== organizationId) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.status !== 'SUBMITTED' && submission.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        'Submission must be in SUBMITTED or UNDER_REVIEW status to be reviewed',
      );
    }
    if (dto.decision === 'REJECTED' && !dto.feedback) {
      throw new BadRequestException('Feedback is required when rejecting a submission');
    }

    // Get next review number for this submission
    const lastReview = await this.prisma.pmQcReview.findFirst({
      where: { taskSubmissionId: submissionId },
      orderBy: { reviewNumber: 'desc' },
      select: { reviewNumber: true },
    });
    const reviewNumber = (lastReview?.reviewNumber ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.pmQcReview.create({
        data: {
          taskId: submission.task.id,
          taskSubmissionId: submissionId,
          reviewerId,
          decision: dto.decision,
          reviewNumber,
          feedback: dto.feedback ?? null,
          reviewedAt: new Date(),
        },
      });

      // Update submission status
      await tx.pmTaskSubmission.update({
        where: { id: submissionId },
        data: { status: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
      });

      // Update task status based on review decision
      const nextTaskStatus =
        dto.decision === 'APPROVED' ? 'COMPLETED' : 'REVISION_REQUIRED';
      const taskData: Record<string, unknown> = { status: nextTaskStatus };
      if (dto.decision === 'APPROVED') {
        taskData.completedAt = new Date();
      }
      await tx.pmTask.update({
        where: { id: submission.task.id },
        data: taskData,
      });

      // Performance: Artist delta
      if (submission.task.assigneeId) {
        if (dto.decision === 'APPROVED') {
          await this.performance.logEvent({
            organizationId,
            userId: submission.task.assigneeId,
            projectId: submission.task.projectId,
            taskId: submission.task.id,
            eventType: 'QC_PASS',
            scoreDelta: 10,
          });
        } else {
          await this.performance.logEvent({
            organizationId,
            userId: submission.task.assigneeId,
            projectId: submission.task.projectId,
            taskId: submission.task.id,
            eventType: 'QC_REJECT',
            scoreDelta: -5,
          });
        }
      }

      // Escalation hook point: check rejection count for the task
      if (dto.decision === 'REJECTED') {
        const rejectionCount = await tx.pmQcReview.count({
          where: { taskId: submission.task.id, decision: 'REJECTED' },
        });
        // 3+ rejections — create escalation event (non-blocking)
        if (rejectionCount >= 3) {
          await tx.pmEscalationEvent.create({
            data: {
              organizationId,
              projectId: submission.task.projectId,
              taskId: submission.task.id,
              projectStageId: submission.task.projectStageId,
              eventType: 'REPEATED_REJECTION',
              severity: rejectionCount >= 5 ? 'HIGH' : 'MEDIUM',
              status: 'OPEN',
              payloadJson: { rejectionCount, submissionId, reviewId: review.id },
            },
          });

          // Penalize more for repeated failure
          if (submission.task.assigneeId) {
            await this.performance.logEvent({
              organizationId,
              userId: submission.task.assigneeId,
              projectId: submission.task.projectId,
              taskId: submission.task.id,
              eventType: 'REPEATED_FAILURE',
              scoreDelta: -20,
            });
          }
        }
      }

      // Emit pm.qc_review_completed event
      this.events.emitQcReviewCompleted(organizationId, {
        projectId: submission.task.projectId,
        taskId: submission.task.id,
        taskSubmissionId: submissionId,
        reviewId: review.id,
        decision: dto.decision,
        reviewerId,
      });

      return review;
    });
  }

  // -------------------------------------------------------------------------
  // Create bypass record (QC skip with red-flag audit)
  // -------------------------------------------------------------------------

  async createBypass(
    organizationId: string,
    taskId: string,
    actedById: string,
    dto: CreateBypassDto,
  ) {
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true, projectStageId: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new BadRequestException('Task is already done');
    }

    return this.prisma.$transaction(async (tx) => {
      const bypass = await tx.pmBypassRecord.create({
        data: {
          taskId,
          projectStageId: task.projectStageId,
          actedById,
          reason: dto.reason,
          redFlag: true,
        },
      });

      // Force task to COMPLETED with bypass flag in payload
      await tx.pmTask.update({
        where: { id: taskId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return bypass;
    });
  }

  // -------------------------------------------------------------------------
  // List bypass records for audit
  // -------------------------------------------------------------------------

  async listBypassRecords(organizationId: string, projectId: string) {
    const project = await this.prisma.pmProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.pmBypassRecord.findMany({
      where: {
        OR: [
          { task: { projectId } },
          { projectStage: { projectId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
