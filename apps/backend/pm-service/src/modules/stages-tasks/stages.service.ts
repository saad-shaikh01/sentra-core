/**
 * StagesService — PM-BE-010
 *
 * Stage operations: detail, update, lead ownership, block/unblock,
 * skip optional, and activate eligible next stages.
 *
 * Activation logic enforces the runtime dependency graph:
 *  - a stage with FINISH_TO_START or FINISH_TO_FINISH deps can only
 *    become ACTIVE when all prerequisite stages are COMPLETED.
 *  - a stage with START_TO_START deps can activate when the prerequisite
 *    stage is at least ACTIVE.
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmCacheService } from '../../common/cache/pm-cache.service';
import { PerformanceService } from '../performance/performance.service';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
} from '../../common/helpers/pagination.helper';
import { UpdateStageDto } from './dto/update-stage.dto';
import { StageLeadDto } from './dto/stage-lead.dto';
import { BlockStageDto } from './dto/block-stage.dto';
import { PmDepartmentCode, PmStageStatus } from '../../common/enums/pm.enums';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StageSelect = {
  id: true;
  organizationId: true;
  projectId: true;
  templateStageId: true;
  name: true;
  description: true;
  departmentCode: true;
  status: true;
  sortOrder: true;
  ownerLeadId: true;
  clientReviewMode: true;
  requiresStageApproval: true;
  requiresQcByDefault: true;
  isOptional: true;
  isBlocked: true;
  startedAt: true;
  dueAt: true;
  completedAt: true;
  createdAt: true;
  updatedAt: true;
};

const STAGE_SELECT: StageSelect = {
  id: true,
  organizationId: true,
  projectId: true,
  templateStageId: true,
  name: true,
  description: true,
  departmentCode: true,
  status: true,
  sortOrder: true,
  ownerLeadId: true,
  clientReviewMode: true,
  requiresStageApproval: true,
  requiresQcByDefault: true,
  isOptional: true,
  isBlocked: true,
  startedAt: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
};

// ---------------------------------------------------------------------------

@Injectable()
export class StagesService {
  private readonly CACHE_RESOURCE = 'stages';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
    private readonly performance: PerformanceService,
  ) {}

  // -------------------------------------------------------------------------
  // List stages for a project (paginated)
  // -------------------------------------------------------------------------

  async list(
    organizationId: string,
    projectId: string,
    page = 1,
    limit = 20,
  ) {
    await this.assertProjectExists(organizationId, projectId);
    const { skip, take } = toPrismaPagination(page, limit);

    const cacheKey = this.cache.buildKey(
      organizationId,
      this.CACHE_RESOURCE,
      'list',
      projectId,
      String(page),
      String(limit),
    );
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [stages, total] = await this.prisma.$transaction([
      this.prisma.pmProjectStage.findMany({
        where: { organizationId, projectId },
        skip,
        take,
        orderBy: { sortOrder: 'asc' },
        select: {
          ...STAGE_SELECT,
          _count: { select: { tasks: true } },
          dependencies: { select: { id: true, dependsOnProjectStageId: true, dependencyType: true } },
        },
      }),
      this.prisma.pmProjectStage.count({ where: { organizationId, projectId } }),
    ]);

    const result = buildPmPaginationResponse(stages, total, page, limit);
    await this.cache.set(cacheKey, result, 30_000);
    return result;
  }

  // -------------------------------------------------------------------------
  // List all stages across projects (paginated) for Stage Queue
  // -------------------------------------------------------------------------

  async listAll(
    organizationId: string,
    userId: string, // reserved for future role-based filtering
    page = 1,
    limit = 20,
    status?: PmStageStatus,
    departmentCode?: PmDepartmentCode,
  ) {
    const { skip, take } = toPrismaPagination(page, limit);

    const where = {
      organizationId,
      ...(status !== undefined && { status }),
      ...(departmentCode !== undefined && { departmentCode }),
    };

    const [stages, total] = await this.prisma.$transaction([
      this.prisma.pmProjectStage.findMany({
        where,
        skip,
        take,
        orderBy: { dueAt: 'asc' }, // Order by closest due date first
        select: {
          ...STAGE_SELECT,
          project: { select: { id: true, name: true, serviceType: true } },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.pmProjectStage.count({ where }),
    ]);

    return buildPmPaginationResponse(stages as unknown as Record<string, unknown>[], total, page, limit);
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, stageId: string) {
    const cacheKey = this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', stageId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const stage = await this.prisma.pmProjectStage.findFirst({
      where: { id: stageId, organizationId },
      include: {
        dependencies: true,
        dependsOn: true,
        _count: { select: { tasks: true } },
      },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    await this.cache.set(cacheKey, stage, 60_000);
    return stage;
  }

  // -------------------------------------------------------------------------
  // Update general metadata
  // -------------------------------------------------------------------------

  async update(organizationId: string, stageId: string, dto: UpdateStageDto) {
    await this.assertExists(organizationId, stageId);

    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.departmentCode !== undefined && { departmentCode: dto.departmentCode }),
        ...(dto.ownerLeadId !== undefined && { ownerLeadId: dto.ownerLeadId }),
        ...(dto.clientReviewMode !== undefined && { clientReviewMode: dto.clientReviewMode }),
        ...(dto.requiresStageApproval !== undefined && { requiresStageApproval: dto.requiresStageApproval }),
        ...(dto.requiresQcByDefault !== undefined && { requiresQcByDefault: dto.requiresQcByDefault }),
        ...(dto.isOptional !== undefined && { isOptional: dto.isOptional }),
        ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
      },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Transfer lead ownership
  // -------------------------------------------------------------------------

  async updateLead(
    organizationId: string,
    stageId: string,
    dto: StageLeadDto,
  ) {
    await this.assertExists(organizationId, stageId);

    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: { ownerLeadId: dto.ownerLeadId },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Block
  // -------------------------------------------------------------------------

  async block(organizationId: string, stageId: string, dto: BlockStageDto) {
    const stage = await this.assertExists(organizationId, stageId);

    if (stage.status === 'COMPLETED' || stage.status === 'SKIPPED') {
      throw new BadRequestException('Cannot block a completed or skipped stage');
    }

    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: { isBlocked: true, status: 'BLOCKED' },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Unblock
  // -------------------------------------------------------------------------

  async unblock(organizationId: string, stageId: string) {
    const stage = await this.assertExists(organizationId, stageId);

    if (!stage.isBlocked) {
      throw new BadRequestException('Stage is not blocked');
    }

    // Restore to READY (dependency check is left to the activate endpoint)
    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: { isBlocked: false, status: 'READY' },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Skip optional stage
  // -------------------------------------------------------------------------

  async skip(organizationId: string, stageId: string) {
    const stage = await this.assertExists(organizationId, stageId);

    if (!stage.isOptional) {
      throw new BadRequestException('Only optional stages can be skipped');
    }
    if (stage.status === 'COMPLETED' || stage.status === 'SKIPPED') {
      throw new BadRequestException('Stage is already done');
    }

    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: { status: 'SKIPPED' },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Activate — resolve dependency graph and move PENDING -> ACTIVE
  // -------------------------------------------------------------------------

  async activate(organizationId: string, stageId: string) {
    const stage = await this.prisma.pmProjectStage.findFirst({
      where: { id: stageId, organizationId },
      include: {
        dependsOn: {
          include: { dependsOnProjectStage: { select: { id: true, status: true } } },
        },
      },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    if (stage.status === 'ACTIVE') {
      throw new BadRequestException('Stage is already active');
    }
    if (stage.status === 'COMPLETED' || stage.status === 'SKIPPED') {
      throw new BadRequestException('Stage is already done');
    }
    if (stage.isBlocked) {
      throw new BadRequestException('Stage is blocked and cannot be activated');
    }

    // Dependency enforcement
    for (const dep of stage.dependsOn) {
      const prereqStatus = dep.dependsOnProjectStage.status;
      const dtype = dep.dependencyType;

      if (dtype === 'FINISH_TO_START' || dtype === 'FINISH_TO_FINISH') {
        if (prereqStatus !== 'COMPLETED' && prereqStatus !== 'SKIPPED') {
          throw new BadRequestException(
            `Prerequisite stage ${dep.dependsOnProjectStage.id} must be completed before this stage can activate (dependency type: ${dtype})`,
          );
        }
      } else if (dtype === 'START_TO_START') {
        if (prereqStatus === 'PENDING' || prereqStatus === 'READY') {
          throw new BadRequestException(
            `Prerequisite stage ${dep.dependsOnProjectStage.id} must be active or completed before this stage can activate (dependency type: ${dtype})`,
          );
        }
      }
    }

    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
        isBlocked: false,
      },
    });

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Complete stage — mark COMPLETED, stamp completedAt
  // -------------------------------------------------------------------------

  async complete(organizationId: string, stageId: string) {
    const stage = await this.assertExists(organizationId, stageId);

    if (stage.status !== 'ACTIVE' && stage.status !== 'IN_REVIEW') {
      throw new BadRequestException('Stage must be ACTIVE or IN_REVIEW to complete');
    }

    // Verify all required tasks are completed
    const openRequired = await this.prisma.pmTask.count({
      where: {
        projectStageId: stageId,
        isRequired: true,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });

    if (openRequired > 0) {
      throw new BadRequestException(
        `${openRequired} required task(s) must be completed before this stage can close`,
      );
    }

    const completedAt = new Date();
    const updated = await this.prisma.pmProjectStage.update({
      where: { id: stageId },
      data: { status: 'COMPLETED', completedAt },
    });

    // Performance: Lead delta
    if (stage.ownerLeadId) {
      let scoreDelta = 50; // Base completion score
      let eventType = 'STAGE_COMPLETE_ON_TIME';

      // SLA Check
      if (stage.dueAt && completedAt > stage.dueAt) {
        const diffMs = completedAt.getTime() - stage.dueAt.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const penalty = diffDays * 10;
        scoreDelta -= penalty;
        eventType = 'STAGE_COMPLETE_DELAYED';
      }

      await this.performance.logEvent({
        organizationId,
        userId: stage.ownerLeadId,
        projectId: stage.projectId,
        eventType,
        scoreDelta,
      });
    }

    await this.invalidateStage(organizationId, stageId);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertProjectExists(organizationId: string, projectId: string) {
    const p = await this.prisma.pmProject.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Project not found');
  }

  private async assertExists(organizationId: string, stageId: string) {
    const stage = await this.prisma.pmProjectStage.findFirst({
      where: { id: stageId, organizationId },
      select: {
        id: true,
        status: true,
        isBlocked: true,
        isOptional: true,
        projectId: true,
        ownerLeadId: true,
        dueAt: true,
      },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  private async invalidateStage(organizationId: string, stageId: string) {
    await Promise.all([
      this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE),
      this.cache.del(
        this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', stageId),
      ),
    ]);
  }
}
