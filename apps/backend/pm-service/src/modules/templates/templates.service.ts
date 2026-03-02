/**
 * TemplatesService — PM-BE-005
 *
 * Owns all template-level operations.
 * Tenant isolation: every query is scoped to organizationId.
 * Duplicate creates a self-contained deep copy in a single transaction.
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
  PmPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { PmCacheService } from '../../common/cache/pm-cache.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';

// ---------------------------------------------------------------------------
// Return shape types (lean — no raw Prisma types leaked to controllers)
// ---------------------------------------------------------------------------

export type TemplateSummary = {
  id: string;
  name: string;
  serviceType: string;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  brandId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { stages: number };
};

// ---------------------------------------------------------------------------

@Injectable()
export class TemplatesService {
  private readonly CACHE_RESOURCE = 'templates';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(organizationId: string, userId: string, dto: CreateTemplateDto) {
    // If isDefault is requested, clear existing default for this serviceType first
    if (dto.isDefault) {
      await this.prisma.pmServiceTemplate.updateMany({
        where: { organizationId, serviceType: dto.serviceType, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await this.prisma.pmServiceTemplate.create({
      data: {
        organizationId,
        name: dto.name,
        serviceType: dto.serviceType,
        description: dto.description,
        brandId: dto.brandId ?? null,
        isDefault: dto.isDefault ?? false,
        isActive: true,
        version: 1,
        createdById: userId,
      },
    });

    await this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE);
    return template;
  }

  // -------------------------------------------------------------------------
  // List (paginated, tenant-scoped, filterable)
  // -------------------------------------------------------------------------

  async list(
    organizationId: string,
    query: QueryTemplatesDto,
  ): Promise<PmPaginatedResponse<TemplateSummary>> {
    const { page = 1, limit = 20, serviceType, brandId, isActive } = query;
    const { skip, take } = toPrismaPagination(page, limit);

    const cacheKey = this.cache.buildKey(
      organizationId,
      this.CACHE_RESOURCE,
      'list',
      this.cache.hashQuery({ page, limit, serviceType, brandId, isActive }),
    );

    const cached = await this.cache.get<PmPaginatedResponse<TemplateSummary>>(cacheKey);
    if (cached) return cached;

    const where = {
      organizationId,
      ...(serviceType !== undefined && { serviceType }),
      ...(brandId !== undefined && { brandId }),
      // Default: show only active templates unless caller explicitly requests inactive
      isActive: isActive !== undefined ? isActive : true,
    };

    const [templates, total] = await this.prisma.$transaction([
      this.prisma.pmServiceTemplate.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          serviceType: true,
          isActive: true,
          isDefault: true,
          version: true,
          brandId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { stages: true } },
        },
      }),
      this.prisma.pmServiceTemplate.count({ where }),
    ]);

    const result = buildPmPaginationResponse(
      templates as TemplateSummary[],
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Detail — full template with stages, tasks, checklists, dependencies
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, id: string) {
    const cacheKey = this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const template = await this.prisma.pmServiceTemplate.findFirst({
      where: { id, organizationId },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            tasks: {
              orderBy: { sortOrder: 'asc' },
              include: {
                checklists: { orderBy: { sortOrder: 'asc' } },
              },
            },
            checklists: { orderBy: { sortOrder: 'asc' } },
            dependencies: true,
            dependsOn: true,
          },
        },
      },
    });

    if (!template) throw new NotFoundException('Template not found');

    await this.cache.set(cacheKey, template, 60_000); // 1 min TTL for detail
    return template;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(
    organizationId: string,
    id: string,
    dto: UpdateTemplateDto,
  ) {
    await this.assertExists(organizationId, id);

    // If setting as default, unset others for the same serviceType
    if (dto.isDefault === true) {
      const current = await this.prisma.pmServiceTemplate.findUnique({ where: { id } });
      await this.prisma.pmServiceTemplate.updateMany({
        where: {
          organizationId,
          serviceType: current!.serviceType,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.pmServiceTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...('brandId' in dto && { brandId: dto.brandId ?? null }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.invalidateTemplate(organizationId, id);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Archive
  // -------------------------------------------------------------------------

  async archive(organizationId: string, id: string) {
    await this.assertExists(organizationId, id);

    const archived = await this.prisma.pmServiceTemplate.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });

    await this.invalidateTemplate(organizationId, id);
    return archived;
  }

  // -------------------------------------------------------------------------
  // Duplicate — deep copy in one transaction
  // -------------------------------------------------------------------------

  async duplicate(organizationId: string, userId: string, id: string) {
    const source = await this.prisma.pmServiceTemplate.findFirst({
      where: { id, organizationId },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            tasks: {
              orderBy: { sortOrder: 'asc' },
              include: { checklists: { orderBy: { sortOrder: 'asc' } } },
            },
            checklists: { orderBy: { sortOrder: 'asc' } },
            dependencies: true,
          },
        },
      },
    });

    if (!source) throw new NotFoundException('Template not found');

    // Map old stageId → new stageId for dependency reconstruction
    const stageIdMap = new Map<string, string>();

    const newTemplate = await this.prisma.$transaction(async (tx) => {
      // 1. Create the new template header
      const copy = await tx.pmServiceTemplate.create({
        data: {
          organizationId,
          name: `Copy of ${source.name}`,
          serviceType: source.serviceType,
          description: source.description,
          brandId: source.brandId,
          isActive: true,
          isDefault: false,
          version: 1,
          createdById: userId,
        },
      });

      // 2. Create stages and map old → new IDs
      for (const stage of source.stages) {
        const newStage = await tx.pmTemplateStage.create({
          data: {
            templateId: copy.id,
            name: stage.name,
            description: stage.description,
            departmentCode: stage.departmentCode,
            sortOrder: stage.sortOrder,
            defaultSlaHours: stage.defaultSlaHours,
            clientReviewMode: stage.clientReviewMode,
            requiresStageApproval: stage.requiresStageApproval,
            requiresQcByDefault: stage.requiresQcByDefault,
            isOptional: stage.isOptional,
            allowsParallel: stage.allowsParallel,
          },
        });
        stageIdMap.set(stage.id, newStage.id);

        // 3. Create tasks for this stage
        for (const task of stage.tasks) {
          const newTask = await tx.pmTemplateTask.create({
            data: {
              templateStageId: newStage.id,
              name: task.name,
              description: task.description,
              sortOrder: task.sortOrder,
              defaultAssigneeRole: task.defaultAssigneeRole,
              requiresQc: task.requiresQc,
              isRequired: task.isRequired,
              estimatedHours: task.estimatedHours,
            },
          });

          // 4. Task-level checklists
          if (task.checklists.length > 0) {
            await tx.pmTemplateChecklist.createMany({
              data: task.checklists.map((c) => ({
                templateTaskId: newTask.id,
                checklistType: c.checklistType,
                label: c.label,
                sortOrder: c.sortOrder,
                isRequired: c.isRequired,
              })),
            });
          }
        }

        // 5. Stage-level checklists
        const stageLevelChecklists = stage.checklists.filter((c) => !c.templateTaskId);
        if (stageLevelChecklists.length > 0) {
          await tx.pmTemplateChecklist.createMany({
            data: stageLevelChecklists.map((c) => ({
              templateStageId: newStage.id,
              checklistType: c.checklistType,
              label: c.label,
              sortOrder: c.sortOrder,
              isRequired: c.isRequired,
            })),
          });
        }
      }

      // 6. Recreate dependencies using mapped IDs
      for (const stage of source.stages) {
        const newStageId = stageIdMap.get(stage.id)!;
        for (const dep of stage.dependencies) {
          const newDepOnId = stageIdMap.get(dep.dependsOnTemplateStageId);
          if (newDepOnId) {
            await tx.pmTemplateStageDependency.create({
              data: {
                templateStageId: newStageId,
                dependsOnTemplateStageId: newDepOnId,
                dependencyType: dep.dependencyType,
              },
            });
          }
        }
      }

      return copy;
    });

    await this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE);
    return newTemplate;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertExists(organizationId: string, id: string) {
    const exists = await this.prisma.pmServiceTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Template not found');
  }

  private async invalidateTemplate(organizationId: string, id: string) {
    await Promise.all([
      this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE),
      this.cache.del(
        this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id),
      ),
    ]);
  }
}
