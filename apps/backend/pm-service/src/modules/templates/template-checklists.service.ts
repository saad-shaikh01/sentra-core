/**
 * TemplateChecklistsService — PM-BE-006
 *
 * Manages self-QC and QC review checklist items for template stages and tasks.
 * A checklist item is scoped to either a stage OR a task — never both.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { CreateChecklistItemDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist.dto';

@Injectable()
export class TemplateChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(organizationId: string, dto: CreateChecklistItemDto) {
    if (!dto.templateStageId && !dto.templateTaskId) {
      throw new BadRequestException(
        'Either templateStageId or templateTaskId is required',
      );
    }
    if (dto.templateStageId && dto.templateTaskId) {
      throw new BadRequestException(
        'A checklist item cannot be scoped to both a stage and a task simultaneously',
      );
    }

    // Validate ownership
    if (dto.templateStageId) {
      await this.assertStageOwnership(organizationId, dto.templateStageId);
    } else if (dto.templateTaskId) {
      await this.assertTaskOwnership(organizationId, dto.templateTaskId);
    }

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(dto));

    return this.prisma.pmTemplateChecklist.create({
      data: {
        templateStageId: dto.templateStageId ?? null,
        templateTaskId: dto.templateTaskId ?? null,
        checklistType: dto.checklistType,
        label: dto.label,
        sortOrder,
        isRequired: dto.isRequired ?? true,
      },
    });
  }

  // -------------------------------------------------------------------------
  // List (by stageId or taskId)
  // -------------------------------------------------------------------------

  async list(
    organizationId: string,
    params: { templateStageId?: string; templateTaskId?: string },
  ) {
    if (!params.templateStageId && !params.templateTaskId) {
      throw new BadRequestException(
        'Provide either templateStageId or templateTaskId as a query parameter',
      );
    }

    // Validate ownership before returning data
    if (params.templateStageId) {
      await this.assertStageOwnership(organizationId, params.templateStageId);
    } else if (params.templateTaskId) {
      await this.assertTaskOwnership(organizationId, params.templateTaskId);
    }

    return this.prisma.pmTemplateChecklist.findMany({
      where: {
        ...(params.templateStageId && { templateStageId: params.templateStageId }),
        ...(params.templateTaskId && { templateTaskId: params.templateTaskId }),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(
    organizationId: string,
    checklistId: string,
    dto: UpdateChecklistItemDto,
  ) {
    await this.assertChecklistOwnership(organizationId, checklistId);

    return this.prisma.pmTemplateChecklist.update({
      where: { id: checklistId },
      data: {
        ...(dto.checklistType !== undefined && { checklistType: dto.checklistType }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async delete(organizationId: string, checklistId: string) {
    await this.assertChecklistOwnership(organizationId, checklistId);
    await this.prisma.pmTemplateChecklist.delete({ where: { id: checklistId } });
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
  }

  private async assertTaskOwnership(organizationId: string, taskId: string) {
    const task = await this.prisma.pmTemplateTask.findFirst({
      where: { id: taskId, templateStage: { template: { organizationId } } },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
  }

  private async assertChecklistOwnership(organizationId: string, checklistId: string) {
    const item = await this.prisma.pmTemplateChecklist.findFirst({
      where: {
        id: checklistId,
        OR: [
          { templateStage: { template: { organizationId } } },
          { templateTask: { templateStage: { template: { organizationId } } } },
        ],
      },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Checklist item not found');
  }

  private async nextSortOrder(dto: CreateChecklistItemDto): Promise<number> {
    const last = await this.prisma.pmTemplateChecklist.findFirst({
      where: {
        ...(dto.templateStageId && { templateStageId: dto.templateStageId }),
        ...(dto.templateTaskId && { templateTaskId: dto.templateTaskId }),
      },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }
}
