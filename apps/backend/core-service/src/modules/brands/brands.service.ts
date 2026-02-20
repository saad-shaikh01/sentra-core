import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IBrand, IPaginatedResponse } from '@sentra-core/types';
import { buildPaginationResponse, CacheService } from '../../common';
import { CreateBrandDto, UpdateBrandDto, QueryBrandsDto } from './dto';

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async create(orgId: string, dto: CreateBrandDto): Promise<IBrand> {
    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        logoUrl: dto.logoUrl,
        colors: dto.colors ?? undefined,
        organizationId: orgId,
      },
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return {
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? undefined,
      logoUrl: brand.logoUrl ?? undefined,
      colors: (brand.colors as Record<string, string>) ?? undefined,
      organizationId: brand.organizationId,
    };
  }

  async findAll(
    orgId: string,
    query: QueryBrandsDto,
  ): Promise<IPaginatedResponse<IBrand>> {
    const queryHash = this.cache.hashQuery(query as Record<string, unknown>);
    const cacheKey = `brands:${orgId}:list:${queryHash}`;

    const cached = await this.cache.get<IPaginatedResponse<IBrand>>(cacheKey);
    if (cached) return cached;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (query.search) {
      where.name = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    const data: IBrand[] = brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? undefined,
      logoUrl: brand.logoUrl ?? undefined,
      colors: (brand.colors as Record<string, string>) ?? undefined,
      organizationId: brand.organizationId,
    }));

    const result = buildPaginationResponse(data, total, page, limit);
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(id: string, orgId: string): Promise<IBrand> {
    const cacheKey = `brands:${orgId}:${id}`;

    const cached = await this.cache.get<IBrand>(cacheKey);
    if (cached) return cached;

    const brand = await this.prisma.brand.findFirst({
      where: {
        id,
        organizationId: orgId,
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const result: IBrand = {
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? undefined,
      logoUrl: brand.logoUrl ?? undefined,
      colors: (brand.colors as Record<string, string>) ?? undefined,
      organizationId: brand.organizationId,
    };

    await this.cache.set(cacheKey, result);
    return result;
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateBrandDto,
  ): Promise<IBrand> {
    const brand = await this.prisma.brand.findFirst({
      where: {
        id,
        organizationId: orgId,
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.colors !== undefined && { colors: dto.colors }),
      },
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return {
      id: updated.id,
      name: updated.name,
      domain: updated.domain ?? undefined,
      logoUrl: updated.logoUrl ?? undefined,
      colors: (updated.colors as Record<string, string>) ?? undefined,
      organizationId: updated.organizationId,
    };
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const brand = await this.prisma.brand.findFirst({
      where: {
        id,
        organizationId: orgId,
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    // Check for dependent leads
    const leadsCount = await this.prisma.lead.count({
      where: { brandId: id },
    });

    if (leadsCount > 0) {
      throw new ConflictException(
        `Cannot delete brand. It has ${leadsCount} associated lead(s). Remove or reassign them first.`,
      );
    }

    // Check for dependent clients
    const clientsCount = await this.prisma.client.count({
      where: { brandId: id },
    });

    if (clientsCount > 0) {
      throw new ConflictException(
        `Cannot delete brand. It has ${clientsCount} associated client(s). Remove or reassign them first.`,
      );
    }

    // Check for dependent sales
    const salesCount = await this.prisma.sale.count({
      where: { brandId: id },
    });

    if (salesCount > 0) {
      throw new ConflictException(
        `Cannot delete brand. It has ${salesCount} associated sale(s). Remove or reassign them first.`,
      );
    }

    await this.prisma.brand.delete({
      where: { id },
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return { message: 'Brand deleted successfully' };
  }
}
