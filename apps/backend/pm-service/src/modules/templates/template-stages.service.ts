/**
 * TemplateStagesService — PM-BE-006
 *
 * Manages template stages, stage ordering, and stage dependencies.
 *
 * Cycle detection:
 *   When adding a new dependency edge (stageId → dependsOnStageId),
 *   a BFS traversal from dependsOnStageId is run to check if stageId
 *   is reachable through existing edges. If reachable, the edge would
 *   form a cycle and is rejected with a 409 Conflict.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmDependencyType } from '../../common/enums/pm.enums';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateStageDependencyDto } from './dto/create-dependency.dto';
import { ReorderDto } from './dto/reorder.dto';

@Injectable()
export class TemplateStagesService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Create stage
  // -------------------------------------------------------------------------

  async createStage(
    organizationId: string,
    templateId: string,
    dto: CreateStageDto,
  ) {
    await this.assertTemplateOwnership(organizationId, templateId);

    // Resolve sortOrder: append to end if not provided
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(templateId));

    try {
      return await this.prisma.pmTemplateStage.create({
        data: {
          templateId,
          name: dto.name,
          description: dto.description,
          departmentCode: dto.departmentCode,
          sortOrder,
          defaultSlaHours: dto.defaultSlaHours ?? null,
          clientReviewMode: dto.clientReviewMode ?? 'NONE',
          requiresStageApproval: dto.requiresStageApproval ?? false,
          requiresQcByDefault: dto.requiresQcByDefault ?? false,
          isOptional: dto.isOptional ?? false,
          allowsParallel: dto.allowsParallel ?? false,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `A stage named "${dto.name}" already exists in this template`,
        );
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // List stages for a template
  // -------------------------------------------------------------------------

  async listStages(organizationId: string, templateId: string) {
    await this.assertTemplateOwnership(organizationId, templateId);

    return this.prisma.pmTemplateStage.findMany({
      where: { templateId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { tasks: true, checklists: true } },
        dependencies: { select: { id: true, dependsOnTemplateStageId: true, dependencyType: true } },
        dependsOn: { select: { id: true, templateStageId: true, dependencyType: true } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Update stage
  // -------------------------------------------------------------------------

  async updateStage(
    organizationId: string,
    stageId: string,
    dto: UpdateStageDto,
  ) {
    await this.assertStageOwnership(organizationId, stageId);

    try {
      return await this.prisma.pmTemplateStage.update({
        where: { id: stageId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.departmentCode !== undefined && { departmentCode: dto.departmentCode }),
          ...(dto.defaultSlaHours !== undefined && { defaultSlaHours: dto.defaultSlaHours }),
          ...(dto.clientReviewMode !== undefined && { clientReviewMode: dto.clientReviewMode }),
          ...(dto.requiresStageApproval !== undefined && {
            requiresStageApproval: dto.requiresStageApproval,
          }),
          ...(dto.requiresQcByDefault !== undefined && {
            requiresQcByDefault: dto.requiresQcByDefault,
          }),
          ...(dto.isOptional !== undefined && { isOptional: dto.isOptional }),
          ...(dto.allowsParallel !== undefined && { allowsParallel: dto.allowsParallel }),
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('A stage with this name already exists in the template');
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Delete stage
  // -------------------------------------------------------------------------

  async deleteStage(organizationId: string, stageId: string) {
    await this.assertStageOwnership(organizationId, stageId);

    // Cascades handle tasks, checklists, and dependencies via schema onDelete: Cascade
    await this.prisma.pmTemplateStage.delete({ where: { id: stageId } });
  }

  // -------------------------------------------------------------------------
  // Reorder stages — full replacement of sortOrder positions
  // -------------------------------------------------------------------------

  async reorderStages(organizationId: string, templateId: string, dto: ReorderDto) {
    await this.assertTemplateOwnership(organizationId, templateId);

    // Verify every provided ID belongs to this template
    const stages = await this.prisma.pmTemplateStage.findMany({
      where: { templateId },
      select: { id: true },
    });
    const existing = new Set(stages.map((s) => s.id));

    if (dto.ids.length !== existing.size) {
      throw new BadRequestException(
        'Reorder list must contain exactly all stage IDs for this template',
      );
    }
    for (const id of dto.ids) {
      if (!existing.has(id)) {
        throw new BadRequestException(`Stage ${id} does not belong to template ${templateId}`);
      }
    }

    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.pmTemplateStage.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Create dependency (with cycle detection)
  // -------------------------------------------------------------------------

  async createDependency(
    organizationId: string,
    stageId: string,
    dto: CreateStageDependencyDto,
  ) {
    const stage = await this.assertStageOwnership(organizationId, stageId);

    // Self-dependency check
    if (stageId === dto.dependsOnTemplateStageId) {
      throw new BadRequestException('A stage cannot depend on itself');
    }

    // Verify target stage is in the same template
    const target = await this.prisma.pmTemplateStage.findFirst({
      where: {
        id: dto.dependsOnTemplateStageId,
        templateId: stage.templateId,
      },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException(
        'Target stage not found or does not belong to the same template',
      );
    }

    // Duplicate check
    const existing = await this.prisma.pmTemplateStageDependency.findUnique({
      where: {
        templateStageId_dependsOnTemplateStageId: {
          templateStageId: stageId,
          dependsOnTemplateStageId: dto.dependsOnTemplateStageId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('This dependency already exists');
    }

    // Cycle detection: BFS from dependsOnStageId following "depends on" edges
    const wouldCycle = await this.wouldCreateCycle(stageId, dto.dependsOnTemplateStageId);
    if (wouldCycle) {
      throw new ConflictException(
        'Adding this dependency would create a cycle in the stage dependency graph',
      );
    }

    return this.prisma.pmTemplateStageDependency.create({
      data: {
        templateStageId: stageId,
        dependsOnTemplateStageId: dto.dependsOnTemplateStageId,
        dependencyType: dto.dependencyType ?? PmDependencyType.FINISH_TO_START,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Delete dependency
  // -------------------------------------------------------------------------

  async deleteDependency(organizationId: string, dependencyId: string) {
    const dep = await this.prisma.pmTemplateStageDependency.findUnique({
      where: { id: dependencyId },
      include: {
        templateStage: {
          include: { template: { select: { organizationId: true } } },
        },
      },
    });

    if (!dep || dep.templateStage.template.organizationId !== organizationId) {
      throw new NotFoundException('Dependency not found');
    }

    await this.prisma.pmTemplateStageDependency.delete({ where: { id: dependencyId } });
  }

  // -------------------------------------------------------------------------
  // List dependencies for a stage
  // -------------------------------------------------------------------------

  async listDependencies(organizationId: string, stageId: string) {
    await this.assertStageOwnership(organizationId, stageId);

    return this.prisma.pmTemplateStageDependency.findMany({
      where: { templateStageId: stageId },
    });
  }

  // -------------------------------------------------------------------------
  // Cycle detection — BFS traversal
  // -------------------------------------------------------------------------

  /**
   * Returns true if adding an edge (stageId → dependsOnStageId) would
   * create a cycle in the directed dependency graph.
   *
   * We need to check: can we reach stageId starting from dependsOnStageId
   * by following existing "depends on" edges?
   *
   * If yes → adding the new edge creates a cycle.
   */
  private async wouldCreateCycle(
    stageId: string,
    dependsOnStageId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    const queue: string[] = [dependsOnStageId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === stageId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Follow outgoing "depends on" edges from current node
      const edges = await this.prisma.pmTemplateStageDependency.findMany({
        where: { templateStageId: current },
        select: { dependsOnTemplateStageId: true },
      });

      for (const edge of edges) {
        if (!visited.has(edge.dependsOnTemplateStageId)) {
          queue.push(edge.dependsOnTemplateStageId);
        }
      }
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async assertTemplateOwnership(organizationId: string, templateId: string) {
    const template = await this.prisma.pmServiceTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async assertStageOwnership(organizationId: string, stageId: string) {
    const stage = await this.prisma.pmTemplateStage.findFirst({
      where: {
        id: stageId,
        template: { organizationId },
      },
      select: { id: true, templateId: true },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  private async nextSortOrder(templateId: string): Promise<number> {
    const last = await this.prisma.pmTemplateStage.findFirst({
      where: { templateId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }
}
