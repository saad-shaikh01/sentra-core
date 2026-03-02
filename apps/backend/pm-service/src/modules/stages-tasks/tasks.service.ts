/**
 * TasksService — PM-BE-011
 *
 * Task CRUD, assignment, claim, reassign, block/unblock.
 * Assignment history is preserved in pm_task_assignments.
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmCacheService } from '../../common/cache/pm-cache.service';
import { PmEventsService } from '../events/pm-events.service';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
  PmPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { BlockTaskDto } from './dto/block-task.dto';

// ---------------------------------------------------------------------------
// Lean list type
// ---------------------------------------------------------------------------

export type TaskSummary = {
  id: string;
  organizationId: string;
  projectId: string;
  projectStageId: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  sortOrder: number;
  ownerLeadId: string | null;
  assigneeId: string | null;
  requiresQc: boolean;
  isRequired: boolean;
  isBlocked: boolean;
  dueAt: Date | null;
  createdById: string;
  createdAt: Date;
};

// ---------------------------------------------------------------------------

@Injectable()
export class TasksService {
  private readonly CACHE_RESOURCE = 'tasks';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
    private readonly events: PmEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // Create task inside a stage
  // -------------------------------------------------------------------------

  async create(
    organizationId: string,
    userId: string,
    projectId: string,
    stageId: string,
    dto: CreateTaskDto,
  ) {
    await this.assertStageExists(organizationId, projectId, stageId);

    // Auto-assign next sort order if not provided
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(stageId));

    const task = await this.prisma.pmTask.create({
      data: {
        organizationId,
        projectId,
        projectStageId: stageId,
        templateTaskId: dto.templateTaskId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority ?? 'MEDIUM',
        sortOrder,
        requiresQc: dto.requiresQc ?? false,
        isRequired: dto.isRequired ?? true,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        ownerLeadId: null,
        assigneeId: null,
        createdById: userId,
      },
    });

    await this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE);
    return task;
  }

  // -------------------------------------------------------------------------
  // List tasks for a stage (paginated)
  // -------------------------------------------------------------------------

  async listByStage(
    organizationId: string,
    stageId: string,
    query: QueryTasksDto,
  ): Promise<PmPaginatedResponse<TaskSummary>> {
    const { page = 1, limit = 20, status, priority, assigneeId } = query;
    const { skip, take } = toPrismaPagination(page, limit);

    const cacheKey = this.cache.buildKey(
      organizationId,
      this.CACHE_RESOURCE,
      'stage',
      stageId,
      this.cache.hashQuery({ page, limit, status, priority, assigneeId }),
    );
    const cached = await this.cache.get<PmPaginatedResponse<TaskSummary>>(cacheKey);
    if (cached) return cached;

    const where = {
      organizationId,
      projectStageId: stageId,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
    };

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.pmTask.findMany({
        where,
        skip,
        take,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: this.taskSummarySelect(),
      }),
      this.prisma.pmTask.count({ where }),
    ]);

    const result = buildPmPaginationResponse(tasks as TaskSummary[], total, page, limit);
    await this.cache.set(cacheKey, result, 30_000);
    return result;
  }

  // -------------------------------------------------------------------------
  // List tasks for a project (paginated)
  // -------------------------------------------------------------------------

  async listByProject(
    organizationId: string,
    projectId: string,
    query: QueryTasksDto,
  ): Promise<PmPaginatedResponse<TaskSummary>> {
    const { page = 1, limit = 20, status, priority, assigneeId } = query;
    const { skip, take } = toPrismaPagination(page, limit);

    const where = {
      organizationId,
      projectId,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
    };

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.pmTask.findMany({
        where,
        skip,
        take,
        orderBy: [{ projectStageId: 'asc' }, { sortOrder: 'asc' }],
        select: this.taskSummarySelect(),
      }),
      this.prisma.pmTask.count({ where }),
    ]);

    return buildPmPaginationResponse(tasks as TaskSummary[], total, page, limit);
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, taskId: string) {
    const cacheKey = this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', taskId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      include: {
        assignments: {
          where: { isCurrent: true },
          select: { assignedToId: true, assignedById: true, assignmentType: true, startedAt: true },
        },
        _count: { select: { submissions: true, worklogs: true } },
      },
    });

    if (!task) throw new NotFoundException('Task not found');

    await this.cache.set(cacheKey, task, 60_000);
    return task;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(
    organizationId: string,
    taskId: string,
    userId: string,
    dto: UpdateTaskDto,
  ) {
    await this.assertExists(organizationId, taskId);

    const updated = await this.prisma.pmTask.update({
      where: { id: taskId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.requiresQc !== undefined && { requiresQc: dto.requiresQc }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
        updatedById: userId,
      },
    });

    await this.invalidateTask(organizationId, taskId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Assign (MANUAL) — lead assigns a specific user
  // -------------------------------------------------------------------------

  async assign(
    organizationId: string,
    taskId: string,
    assignedById: string,
    dto: AssignTaskDto,
  ) {
    const task = await this.assertExists(organizationId, taskId);

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new BadRequestException('Cannot reassign a completed or cancelled task');
    }

    return this.prisma.$transaction(async (tx) => {
      // Close any existing current assignment
      await tx.pmTaskAssignment.updateMany({
        where: { taskId, isCurrent: true },
        data: { isCurrent: false, endedAt: new Date() },
      });

      // Create new assignment record
      await tx.pmTaskAssignment.create({
        data: {
          taskId,
          assignedById,
          assignedToId: dto.assigneeId,
          assignmentType: task.assigneeId ? 'REASSIGN' : 'MANUAL',
          isCurrent: true,
          notes: dto.notes ?? null,
          startedAt: new Date(),
        },
      });

      // Update task assignee
      const updated = await tx.pmTask.update({
        where: { id: taskId },
        data: {
          assigneeId: dto.assigneeId,
          status: task.status === 'PENDING' || task.status === 'READY' ? 'READY' : task.status,
          updatedById: assignedById,
        },
      });

      // Emit pm.task_assigned event
      this.events.emitTaskAssigned(organizationId, {
        projectId: task.projectId,
        projectStageId: task.projectStageId,
        taskId,
        assignedToId: dto.assigneeId,
        assignedById,
        assignmentType: task.assigneeId ? 'REASSIGN' : 'MANUAL',
      });

      await this.invalidateTask(organizationId, taskId);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Claim (CLAIM) — user self-assigns
  // -------------------------------------------------------------------------

  async claim(organizationId: string, taskId: string, userId: string) {
    const task = await this.assertExists(organizationId, taskId);

    if (task.assigneeId && task.assigneeId !== userId) {
      throw new ConflictException('Task is already assigned to another user');
    }
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new BadRequestException('Cannot claim a completed or cancelled task');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.pmTaskAssignment.updateMany({
        where: { taskId, isCurrent: true },
        data: { isCurrent: false, endedAt: new Date() },
      });

      await tx.pmTaskAssignment.create({
        data: {
          taskId,
          assignedById: userId,
          assignedToId: userId,
          assignmentType: 'CLAIM',
          isCurrent: true,
          startedAt: new Date(),
        },
      });

      const updated = await tx.pmTask.update({
        where: { id: taskId },
        data: {
          assigneeId: userId,
          status: 'IN_PROGRESS',
          startedAt: task.startedAt ?? new Date(),
          updatedById: userId,
        },
      });

      // Emit pm.task_assigned event for claim
      this.events.emitTaskAssigned(organizationId, {
        projectId: task.projectId,
        projectStageId: task.projectStageId,
        taskId,
        assignedToId: userId,
        assignedById: userId,
        assignmentType: 'CLAIM',
      });

      await this.invalidateTask(organizationId, taskId);
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Block / Unblock
  // -------------------------------------------------------------------------

  async block(organizationId: string, taskId: string, userId: string, dto: BlockTaskDto) {
    const task = await this.assertExists(organizationId, taskId);

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new BadRequestException('Cannot block a done task');
    }

    const updated = await this.prisma.pmTask.update({
      where: { id: taskId },
      data: { isBlocked: true, status: 'BLOCKED', updatedById: userId },
    });

    await this.invalidateTask(organizationId, taskId);
    return updated;
  }

  async unblock(organizationId: string, taskId: string, userId: string) {
    const task = await this.assertExists(organizationId, taskId);

    if (!task.isBlocked) {
      throw new BadRequestException('Task is not blocked');
    }

    // Restore to sensible status based on assignee state
    const nextStatus = task.assigneeId ? 'IN_PROGRESS' : 'READY';

    const updated = await this.prisma.pmTask.update({
      where: { id: taskId },
      data: { isBlocked: false, status: nextStatus, updatedById: userId },
    });

    await this.invalidateTask(organizationId, taskId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private taskSummarySelect() {
    return {
      id: true,
      organizationId: true,
      projectId: true,
      projectStageId: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      sortOrder: true,
      ownerLeadId: true,
      assigneeId: true,
      requiresQc: true,
      isRequired: true,
      isBlocked: true,
      dueAt: true,
      createdById: true,
      createdAt: true,
    };
  }

  private async nextSortOrder(stageId: string): Promise<number> {
    const max = await this.prisma.pmTask.aggregate({
      where: { projectStageId: stageId },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? -1) + 1;
  }

  private async assertStageExists(
    organizationId: string,
    projectId: string,
    stageId: string,
  ) {
    const stage = await this.prisma.pmProjectStage.findFirst({
      where: { id: stageId, projectId, organizationId },
      select: { id: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');
  }

  async assertExists(organizationId: string, taskId: string) {
    const task = await this.prisma.pmTask.findFirst({
      where: { id: taskId, organizationId },
      select: {
        id: true,
        status: true,
        assigneeId: true,
        isBlocked: true,
        startedAt: true,
        requiresQc: true,
        projectId: true,
        projectStageId: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async invalidateTask(organizationId: string, taskId: string) {
    await Promise.all([
      this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE),
      this.cache.del(
        this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', taskId),
      ),
    ]);
  }
}
