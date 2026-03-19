import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IBrand, IPaginatedResponse } from '@sentra-core/types';
import { buildPaginationResponse, CacheService, StorageService } from '../../common';
import { CreateBrandDto, UpdateBrandDto, QueryBrandsDto } from './dto';

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private storage: StorageService,
  ) {}

  async create(orgId: string, dto: CreateBrandDto): Promise<IBrand> {
    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        logoUrl: dto.logoUrl,
        faviconUrl: dto.faviconUrl,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        colors: dto.colors ?? undefined,
        organizationId: orgId,
      },
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return this.mapToIBrand(brand);
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

    const where: Record<string, unknown> = { organizationId: orgId };

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.brand.count({ where }),
    ]);

    const result: IPaginatedResponse<IBrand> = buildPaginationResponse(
      brands.map((b) => this.mapToIBrand(b)),
      total,
      page,
      limit,
    );
    await this.cache.set(cacheKey, result);
    return result;
  }

  async findOne(id: string, orgId: string): Promise<IBrand> {
    const cacheKey = `brands:${orgId}:${id}`;

    const cached = await this.cache.get<IBrand>(cacheKey);
    if (cached) return cached;

    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const result = this.mapToIBrand(brand);
    await this.cache.set(cacheKey, result);
    return result;
  }

  async update(id: string, orgId: string, dto: UpdateBrandDto): Promise<IBrand> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.faviconUrl !== undefined && { faviconUrl: dto.faviconUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
        ...(dto.colors !== undefined && { colors: dto.colors }),
      },
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return this.mapToIBrand(updated);
  }

  async uploadAsset(
    id: string,
    orgId: string,
    field: 'logo' | 'favicon' | 'contract',
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<IBrand> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const url = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      `brands/${id}/${field}s`,
      orgId,
    );

    const data =
      field === 'logo' ? { logoUrl: url } : { faviconUrl: url };

    const updated = await this.prisma.brand.update({ where: { id }, data });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return this.mapToIBrand(updated);
  }

  async findPublicByDomain(domain: string): Promise<Partial<IBrand>> {
    const brand = await this.prisma.brand.findFirst({
      where: { domain },
      select: { name: true, logoUrl: true, faviconUrl: true, primaryColor: true, secondaryColor: true },
    });
    if (!brand) return {};
    return {
      name: brand.name,
      logoUrl: brand.logoUrl ?? undefined,
      faviconUrl: brand.faviconUrl ?? undefined,
      primaryColor: brand.primaryColor ?? undefined,
      secondaryColor: brand.secondaryColor ?? undefined,
    };
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const [leadsCount, clientsCount, salesCount] = await Promise.all([
      this.prisma.lead.count({ where: { brandId: id } }),
      this.prisma.client.count({ where: { brandId: id } }),
      this.prisma.sale.count({ where: { brandId: id } }),
    ]);

    if (leadsCount > 0) throw new ConflictException(`Cannot delete brand. It has ${leadsCount} associated lead(s).`);
    if (clientsCount > 0) throw new ConflictException(`Cannot delete brand. It has ${clientsCount} associated client(s).`);
    if (salesCount > 0) throw new ConflictException(`Cannot delete brand. It has ${salesCount} associated sale(s).`);

    // Clean up stored assets
    if (brand.logoUrl) await this.storage.delete(brand.logoUrl, orgId);
    if (brand.faviconUrl) await this.storage.delete(brand.faviconUrl as string, orgId);

    await this.prisma.brand.delete({ where: { id } });
    await this.cache.delByPrefix(`brands:${orgId}:`);

    return { message: 'Brand deleted successfully' };
  }

  private mapToIBrand(brand: any): IBrand {
    return {
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? undefined,
      logoUrl: brand.logoUrl ?? undefined,
      faviconUrl: brand.faviconUrl ?? undefined,
      primaryColor: brand.primaryColor ?? undefined,
      secondaryColor: brand.secondaryColor ?? undefined,
      colors: (brand.colors as Record<string, string>) ?? undefined,
      organizationId: brand.organizationId,
      createdAt: brand.createdAt,
    };
  }
}
