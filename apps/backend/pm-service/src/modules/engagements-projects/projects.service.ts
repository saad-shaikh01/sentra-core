/**
 * ProjectsService — PM-BE-008
 *
 * Manages project CRUD.
 * When a templateId is provided at creation time, delegates to
 * ProjectGeneratorService to stamp the full stage/task/dependency graph
 * within the same $transaction (atomicity guaranteed).
 *
 * Tenant isolation: every query is scoped to organizationId.
 * Cache: list and detail reads are Redis-cached; all writes invalidate cache.
 */

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
  PmPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { PmCacheService } from '../../common/cache/pm-cache.service';
import { ProjectGeneratorService } from './project-generator.service';
import { PmEventsService } from '../events/pm-events.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';

// ---------------------------------------------------------------------------
// Lean return type for list payloads
// ---------------------------------------------------------------------------

export type ProjectSummary = {
  id: string;
  organizationId: string;
  engagementId: string;
  brandId: string;
  clientId: string | null;
  templateId: string | null;
  projectType: string;
  serviceType: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  healthStatus: string;
  deliveryDueAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { stages: number; tasks: number };
};

// ---------------------------------------------------------------------------

@Injectable()
export class ProjectsService {
  private readonly CACHE_RESOURCE = 'projects';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
    private readonly generator: ProjectGeneratorService,
    private readonly events: PmEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(organizationId: string, userId: string, dto: CreateProjectDto) {
    // Validate engagement exists within this org
    const engagement = await this.prisma.pmEngagement.findFirst({
      where: { id: dto.engagementId, organizationId },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundException('Engagement not found');

    // Pre-load template outside the transaction (stable read; throws if inactive/missing)
    const template = dto.templateId
      ? await this.generator.loadTemplate(organizationId, dto.templateId)
      : null;

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pmProject.create({
        data: {
          organizationId,
          engagementId: dto.engagementId,
          brandId: dto.brandId,
          clientId: dto.clientId ?? null,
          templateId: dto.templateId ?? null,
          projectType: dto.projectType,
          serviceType: dto.serviceType,
          name: dto.name,
          description: dto.description ?? null,
          priority: dto.priority,
          deliveryDueAt: dto.deliveryDueAt ? new Date(dto.deliveryDueAt) : null,
          createdById: userId,
        },
      });

      // Stamp stages/tasks/dependencies from template (PM-BE-009)
      if (template) {
        await this.generator.generateFromTemplate(
          tx,
          organizationId,
          userId,
          created.id,
          template,
        );
      }

      return created;
    });

    // Emit pm.project_created event (PM-BE-018)
    this.events.emitProjectCreated(organizationId, {
      engagementId: project.engagementId,
      projectId: project.id,
      projectType: project.projectType,
      serviceType: project.serviceType,
      ownerLeadIds: [], // Leads are assigned at stage level, initially empty
      createdById: userId,
    }, project.brandId);

    await this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE);
    return project;
  }

  // -------------------------------------------------------------------------
  // List (paginated, tenant-scoped, filterable)
  // -------------------------------------------------------------------------

  async list(
    organizationId: string,
    query: QueryProjectsDto,
  ): Promise<PmPaginatedResponse<ProjectSummary>> {
    const {
      page = 1, limit = 20,
      name,
      search,
      engagementId, status, brandId, clientId,
      projectType, serviceType, healthStatus, priority,
    } = query;
    // `name` takes precedence; `search` is the backward-compatible alias.
    const nameFilter = name ?? search;
    const { skip, take } = toPrismaPagination(page, limit);

    const cacheKey = this.cache.buildKey(
      organizationId,
      this.CACHE_RESOURCE,
      'list',
      this.cache.hashQuery({
        page, limit, nameFilter, engagementId, status, brandId, clientId,
        projectType, serviceType, healthStatus, priority,
      }),
    );

    const cached = await this.cache.get<PmPaginatedResponse<ProjectSummary>>(cacheKey);
    if (cached) return cached;

    const where = {
      organizationId,
      ...(nameFilter !== undefined && { name: { contains: nameFilter, mode: 'insensitive' as const } }),
      ...(engagementId !== undefined && { engagementId }),
      ...(status !== undefined && { status }),
      ...(brandId !== undefined && { brandId }),
      ...(clientId !== undefined && { clientId }),
      ...(projectType !== undefined && { projectType }),
      ...(serviceType !== undefined && { serviceType }),
      ...(healthStatus !== undefined && { healthStatus }),
      ...(priority !== undefined && { priority }),
    };

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.pmProject.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          engagementId: true,
          brandId: true,
          clientId: true,
          templateId: true,
          projectType: true,
          serviceType: true,
          name: true,
          description: true,
          status: true,
          priority: true,
          healthStatus: true,
          deliveryDueAt: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { stages: true, tasks: true } },
        },
      }),
      this.prisma.pmProject.count({ where }),
    ]);

    const result = buildPmPaginationResponse(
      projects as ProjectSummary[],
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Detail — includes stage list with task counts and dependency edges
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, id: string) {
    const cacheKey = this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const project = await this.prisma.pmProject.findFirst({
      where: { id, organizationId },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { tasks: true } },
            dependencies: true,
            dependsOn: true,
          },
        },
        _count: { select: { stages: true, tasks: true } },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    await this.cache.set(cacheKey, project, 60_000);
    return project;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(
    organizationId: string,
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ) {
    await this.assertExists(organizationId, id);

    const updated = await this.prisma.pmProject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.healthStatus !== undefined && { healthStatus: dto.healthStatus }),
        ...(dto.deliveryDueAt !== undefined && {
          deliveryDueAt: dto.deliveryDueAt ? new Date(dto.deliveryDueAt) : null,
        }),
        ...('clientId' in dto && { clientId: dto.clientId ?? null }),
        updatedById: userId,
      },
    });

    await this.invalidateProject(organizationId, id);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertExists(organizationId: string, id: string) {
    const exists = await this.prisma.pmProject.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Project not found');
  }

  private async invalidateProject(organizationId: string, id: string) {
    await Promise.all([
      this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE),
      this.cache.del(
        this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id),
      ),
    ]);
  }
}
