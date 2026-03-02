/**
 * SubmissionsService — PM-BE-013
 *
 * Manages task submissions and self-QC responses.
 *
 * Rules:
 *  - multiple submissions per task are allowed (submissionNumber increments)
 *  - a submission freezes the review target
 *  - if task.requiresQc is true, selfQcResponses are required
 *  - task status moves to SUBMITTED or IN_QC on successful submission
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
} from '../../common/helpers/pagination.helper';
import { PmEventsService } from '../events/pm-events.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PmEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // Create submission
  // -------------------------------------------------------------------------

  async create(
    organizationId: string,
    taskId: string,
    submittedById: string,
    dto: CreateSubmissionDto,
  ) {
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: {
        id: true,
        status: true,
        requiresQc: true,
        projectId: true,
        projectStageId: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new BadRequestException('Task is already done and cannot be submitted');
    }

    if (task.requiresQc && (!dto.selfQcResponses || dto.selfQcResponses.length === 0)) {
      throw new BadRequestException(
        'Self-QC responses are required for this task before submission',
      );
    }

    // Get next submission number
    const lastSub = await this.prisma.pmTaskSubmission.findFirst({
      where: { taskId },
      orderBy: { submissionNumber: 'desc' },
      select: { submissionNumber: true },
    });
    const submissionNumber = (lastSub?.submissionNumber ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.pmTaskSubmission.create({
        data: {
          taskId,
          submittedById,
          submissionNumber,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          notes: dto.notes ?? null,
        },
      });

      // Store self-QC responses
      if (dto.selfQcResponses && dto.selfQcResponses.length > 0) {
        await tx.pmSelfQcResponse.createMany({
          data: dto.selfQcResponses.map((r) => ({
            taskSubmissionId: submission.id,
            templateChecklistId: r.templateChecklistId ?? null,
            labelSnapshot: r.labelSnapshot,
            isChecked: r.isChecked ?? true,
            responseText: r.responseText ?? null,
          })),
        });
      }

      // Move task to appropriate status
      const nextTaskStatus = task.requiresQc ? 'IN_QC' : 'SUBMITTED';
      await tx.pmTask.update({
        where: { id: taskId },
        data: {
          status: nextTaskStatus,
          submittedAt: new Date(),
        },
      });

      const result = { ...submission, selfQcCount: dto.selfQcResponses?.length ?? 0 };

      // Emit pm.task_submitted event
      this.events.emitTaskSubmitted(organizationId, {
        projectId: task.projectId,
        projectStageId: task.projectStageId,
        taskId,
        taskSubmissionId: submission.id,
        submittedById,
        requiresQc: task.requiresQc,
      });

      return result;
    });
  }

  // -------------------------------------------------------------------------
  // List submissions for a task (paginated)
  // -------------------------------------------------------------------------

  async list(organizationId: string, taskId: string, page = 1, limit = 20) {
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const { skip, take } = toPrismaPagination(page, limit);

    const [submissions, total] = await this.prisma.$transaction([
      this.prisma.pmTaskSubmission.findMany({
        where: { taskId },
        skip,
        take,
        orderBy: { submissionNumber: 'desc' },
        select: {
          id: true,
          taskId: true,
          submittedById: true,
          submissionNumber: true,
          status: true,
          submittedAt: true,
          notes: true,
          _count: { select: { selfQcResponses: true, qcReviews: true } },
        },
      }),
      this.prisma.pmTaskSubmission.count({ where: { taskId } }),
    ]);

    return buildPmPaginationResponse(submissions, total, page, limit);
  }

  // -------------------------------------------------------------------------
  // Detail (full with self-QC responses)
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, submissionId: string) {
    const submission = await this.prisma.pmTaskSubmission.findFirst({
      where: { id: submissionId },
      include: {
        task: { select: { organizationId: true, projectId: true, projectStageId: true } },
        selfQcResponses: true,
        qcReviews: {
          orderBy: { reviewNumber: 'desc' },
          select: {
            id: true,
            reviewerId: true,
            decision: true,
            reviewNumber: true,
            feedback: true,
            reviewedAt: true,
          },
        },
      },
    });

    if (!submission || submission.task.organizationId !== organizationId) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }
}
