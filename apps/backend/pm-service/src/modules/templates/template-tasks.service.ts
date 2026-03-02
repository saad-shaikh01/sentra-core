/**
 * TemplateTasksService — PM-BE-006
 *
 * Manages starter tasks within template stages.
 * sortOrder is managed via explicit integer — auto-appends on create when omitted.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CreateTemplateTaskDto } from './dto/create-task.dto';
import { UpdateTemplateTaskDto } from './dto/update-task.dto';
import { ReorderDto } from './dto/reorder.dto';

@Injectable()
export class TemplateTasksService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Create task
  // -------------------------------------------------------------------------

  async createTask(
    organizationId: string,
    stageId: string,
    dto: CreateTemplateTaskDto,
  ) {
    await this.assertStageOwnership(organizationId, stageId);

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(stageId));

    try {
      return await this.prisma.pmTemplateTask.create({
        data: {
          templateStageId: stageId,
          name: dto.name,
          description: dto.description,
          sortOrder,
          defaultAssigneeRole: dto.defaultAssigneeRole ?? null,
          requiresQc: dto.requiresQc ?? false,
          isRequired: dto.isRequired ?? true,
          estimatedHours: dto.estimatedHours ?? null,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `A task named "${dto.name}" already exists in this stage`,
        );
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // List tasks for a stage
  // -------------------------------------------------------------------------

  async listTasks(organizationId: string, stageId: string) {
    await this.assertStageOwnership(organizationId, stageId);

    return this.prisma.pmTemplateTask.findMany({
      where: { templateStageId: stageId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { checklists: true } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Update task
  // -------------------------------------------------------------------------

  async updateTask(
    organizationId: string,
    taskId: string,
    dto: UpdateTemplateTaskDto,
  ) {
    await this.assertTaskOwnership(organizationId, taskId);

    try {
      return await this.prisma.pmTemplateTask.update({
        where: { id: taskId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.defaultAssigneeRole !== undefined && {
            defaultAssigneeRole: dto.defaultAssigneeRole,
          }),
          ...(dto.requiresQc !== undefined && { requiresQc: dto.requiresQc }),
          ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
          ...(dto.estimatedHours !== undefined && { estimatedHours: dto.estimatedHours }),
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('A task with this name already exists in the stage');
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Delete task
  // -------------------------------------------------------------------------

  async deleteTask(organizationId: string, taskId: string) {
    await this.assertTaskOwnership(organizationId, taskId);
    // Cascades handle checklists via schema onDelete: Cascade
    await this.prisma.pmTemplateTask.delete({ where: { id: taskId } });
  }

  // -------------------------------------------------------------------------
  // Reorder tasks — full replacement of sortOrder positions
  // -------------------------------------------------------------------------

  async reorderTasks(organizationId: string, stageId: string, dto: ReorderDto) {
    await this.assertStageOwnership(organizationId, stageId);

    const tasks = await this.prisma.pmTemplateTask.findMany({
      where: { templateStageId: stageId },
      select: { id: true },
    });
    const existing = new Set(tasks.map((t) => t.id));

    if (dto.ids.length !== existing.size) {
      throw new BadRequestException(
        'Reorder list must contain exactly all task IDs for this stage',
      );
    }
    for (const id of dto.ids) {
      if (!existing.has(id)) {
        throw new BadRequestException(`Task ${id} does not belong to stage ${stageId}`);
      }
    }

    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.pmTemplateTask.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async assertStageOwnership(organizationId: string, stageId: string) {
    const stage = await this.prisma.pmTemplateStage.findFirst({
      where: { id: stageId, template: { organizationId } },
      select: { id: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  async assertTaskOwnership(organizationId: string, taskId: string) {
    const task = await this.prisma.pmTemplateTask.findFirst({
      where: {
        id: taskId,
        templateStage: { template: { organizationId } },
      },
      select: { id: true, templateStageId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async nextSortOrder(stageId: string): Promise<number> {
    const last = await this.prisma.pmTemplateTask.findFirst({
      where: { templateStageId: stageId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }
}
