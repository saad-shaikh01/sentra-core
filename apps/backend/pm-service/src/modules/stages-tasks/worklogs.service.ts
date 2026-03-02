/**
 * WorklogsService — PM-BE-012
 *
 * Work log tracking + "my tasks" query paths.
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
  PmPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { CreateWorklogDto } from './dto/create-worklog.dto';
import { QueryMyTasksDto } from './dto/query-my-tasks.dto';

@Injectable()
export class WorklogsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Create worklog for a task
  // -------------------------------------------------------------------------

  async createWorklog(
    organizationId: string,
    taskId: string,
    userId: string,
    dto: CreateWorklogDto,
  ) {
    // Verify task belongs to org
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const startedAt = new Date(dto.startedAt);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    let durationMinutes = dto.durationMinutes ?? null;
    if (endedAt && !durationMinutes) {
      const diffMs = endedAt.getTime() - startedAt.getTime();
      if (diffMs < 0) throw new BadRequestException('endedAt must be after startedAt');
      durationMinutes = Math.round(diffMs / 60_000);
    }

    return this.prisma.pmTaskWorklog.create({
      data: {
        taskId,
        userId,
        startedAt,
        endedAt,
        durationMinutes,
        notes: dto.notes ?? null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // List worklogs for a task (paginated)
  // -------------------------------------------------------------------------

  async listWorklogs(
    organizationId: string,
    taskId: string,
    page = 1,
    limit = 20,
  ) {
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const { skip, take } = toPrismaPagination(page, limit);

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.pmTaskWorklog.findMany({
        where: { taskId },
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          taskId: true,
          userId: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          notes: true,
        },
      }),
      this.prisma.pmTaskWorklog.count({ where: { taskId } }),
    ]);

    return buildPmPaginationResponse(logs, total, page, limit);
  }

  // -------------------------------------------------------------------------
  // My tasks — assignee-centric with due-soon and blocked filters
  // -------------------------------------------------------------------------

  async myTasks(
    organizationId: string,
    userId: string,
    query: QueryMyTasksDto,
  ): Promise<PmPaginatedResponse<Record<string, unknown>>> {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      dueSoonHours,
      blocked,
    } = query;
    const { skip, take } = toPrismaPagination(page, limit);

    const now = new Date();
    const dueSoonCutoff = dueSoonHours
      ? new Date(now.getTime() + dueSoonHours * 60 * 60 * 1000)
      : null;

    const where: Record<string, unknown> = {
      organizationId,
      assigneeId: userId,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(blocked === true && { isBlocked: true }),
      ...(dueSoonCutoff && {
        dueAt: { gte: now, lte: dueSoonCutoff },
      }),
    };

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.pmTask.findMany({
        where,
        skip,
        take,
        // due-soon first, then by project stage order
        orderBy: [
          { dueAt: 'asc' },
          { priority: 'desc' },
          { sortOrder: 'asc' },
        ],
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          projectStageId: true,
          name: true,
          status: true,
          priority: true,
          requiresQc: true,
          isRequired: true,
          isBlocked: true,
          dueAt: true,
          createdAt: true,
          project: { select: { name: true, serviceType: true } },
          projectStage: { select: { name: true } },
        },
      }),
      this.prisma.pmTask.count({ where }),
    ]);

    return buildPmPaginationResponse(
      tasks as unknown as Record<string, unknown>[],
      total,
      page,
      limit,
    );
  }
}
