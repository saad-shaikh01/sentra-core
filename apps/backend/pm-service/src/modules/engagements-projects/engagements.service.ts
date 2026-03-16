/**
 * EngagementsService — PM-BE-007
 *
 * Owns all engagement-level CRUD operations.
 * Tenant isolation: every query is scoped to organizationId.
 * Cache: list and detail reads are Redis-cached; all writes invalidate cache.
 *
 * ownerType constraints:
 *   CLIENT         → clientId is required
 *   INTERNAL_BRAND → ownerBrandId is required
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
  PmPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { PmCacheService } from '../../common/cache/pm-cache.service';
import {
  PmProjectOwnerType,
  PmEngagementStatus,
} from '../../common/enums/pm.enums';
import { CreateEngagementDto } from './dto/create-engagement.dto';
import { UpdateEngagementDto } from './dto/update-engagement.dto';
import { QueryEngagementsDto } from './dto/query-engagements.dto';

// ---------------------------------------------------------------------------
// Lean return type for list payloads
// ---------------------------------------------------------------------------

export type EngagementSummary = {
  id: string;
  organizationId: string;
  ownerType: string;
  clientId: string | null;
  ownerBrandId: string | null;
  primaryBrandId: string | null;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { projects: number };
};

// ---------------------------------------------------------------------------

@Injectable()
export class EngagementsService {
  private readonly CACHE_RESOURCE = 'engagements';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(organizationId: string, userId: string, dto: CreateEngagementDto) {
    if (dto.ownerType === PmProjectOwnerType.CLIENT && !dto.clientId) {
      throw new BadRequestException('clientId is required when ownerType is CLIENT');
    }
    if (dto.ownerType === PmProjectOwnerType.INTERNAL_BRAND && !dto.ownerBrandId) {
      throw new BadRequestException('ownerBrandId is required when ownerType is INTERNAL_BRAND');
    }

    const engagement = await this.prisma.pmEngagement.create({
      data: {
        organizationId,
        ownerType: dto.ownerType,
        clientId: dto.clientId ?? null,
        ownerBrandId: dto.ownerBrandId ?? null,
        primaryBrandId: dto.primaryBrandId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority,
        createdById: userId,
      },
    });

    await this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE);
    return engagement;
  }

  // -------------------------------------------------------------------------
  // List (paginated, tenant-scoped, filterable)
  // -------------------------------------------------------------------------

  async list(
    organizationId: string,
    query: QueryEngagementsDto,
  ): Promise<PmPaginatedResponse<EngagementSummary>> {
    const {
      page = 1,
      limit = 20,
      name,
      search,
      status,
      ownerType,
      clientId,
      ownerBrandId,
      priority,
    } = query;
    const nameFilter = name ?? search;
    const { skip, take } = toPrismaPagination(page, limit);

    const cacheKey = this.cache.buildKey(
      organizationId,
      this.CACHE_RESOURCE,
      'list',
      this.cache.hashQuery({
        page,
        limit,
        nameFilter,
        status,
        ownerType,
        clientId,
        ownerBrandId,
        priority,
      }),
    );

    const cached = await this.cache.get<PmPaginatedResponse<EngagementSummary>>(cacheKey);
    if (cached) return cached;

    const where = {
      organizationId,
      ...(nameFilter !== undefined && {
        name: { contains: nameFilter, mode: 'insensitive' as const },
      }),
      ...(status !== undefined && { status }),
      ...(ownerType !== undefined && { ownerType }),
      ...(clientId !== undefined && { clientId }),
      ...(ownerBrandId !== undefined && { ownerBrandId }),
      ...(priority !== undefined && { priority }),
    };

    const [engagements, total] = await this.prisma.$transaction([
      this.prisma.pmEngagement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          ownerType: true,
          clientId: true,
          ownerBrandId: true,
          primaryBrandId: true,
          name: true,
          description: true,
          status: true,
          priority: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { projects: true } },
        },
      }),
      this.prisma.pmEngagement.count({ where }),
    ]);

    const result = buildPmPaginationResponse(
      engagements as EngagementSummary[],
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------

  async findOne(organizationId: string, id: string) {
    const cacheKey = this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const engagement = await this.prisma.pmEngagement.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { projects: true } },
      },
    });

    if (!engagement) throw new NotFoundException('Engagement not found');

    await this.cache.set(cacheKey, engagement, 60_000);
    return engagement;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(organizationId: string, id: string, dto: UpdateEngagementDto) {
    await this.assertExists(organizationId, id);

    const updated = await this.prisma.pmEngagement.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...('primaryBrandId' in dto && { primaryBrandId: dto.primaryBrandId ?? null }),
        ...('saleId' in dto && { saleId: dto.saleId ?? null }),
      },
    });

    await this.invalidateEngagement(organizationId, id);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Archive (close)
  // -------------------------------------------------------------------------

  async archive(organizationId: string, id: string) {
    await this.assertExists(organizationId, id);

    const archived = await this.prisma.pmEngagement.update({
      where: { id },
      data: { status: PmEngagementStatus.CANCELLED },
    });

    await this.invalidateEngagement(organizationId, id);
    return archived;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertExists(organizationId: string, id: string) {
    const exists = await this.prisma.pmEngagement.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Engagement not found');
  }

  private async invalidateEngagement(organizationId: string, id: string) {
    await Promise.all([
      this.cache.invalidateOrgResource(organizationId, this.CACHE_RESOURCE),
      this.cache.del(
        this.cache.buildKey(organizationId, this.CACHE_RESOURCE, 'detail', id),
      ),
    ]);
  }
}
