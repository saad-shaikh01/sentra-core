import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IBrand, IBrandInvoiceConfig, IPaginatedResponse } from '@sentra-core/types';
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
      await Promise.all(brands.map((b) => this.mapToIBrand(b))),
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

    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId: orgId },
      include: { invoiceConfig: true },
    });
    if (!brand) throw new NotFoundException('Brand not found');

    const result = await this.mapToIBrand(brand);
    await this.cache.set(cacheKey, result);
    return result;
  }

  async getInvoiceConfig(id: string, orgId: string): Promise<IBrandInvoiceConfig | null> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const config = await this.prisma.brandInvoiceConfig.findUnique({ where: { brandId: id } });
    return config ? this.mapToIBrandInvoiceConfig(config) : null;
  }

  async upsertInvoiceConfig(id: string, orgId: string, dto: Partial<IBrandInvoiceConfig>): Promise<IBrandInvoiceConfig> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const data = {
      billingEmail: dto.billingEmail,
      supportEmail: dto.supportEmail,
      phone: dto.phone,
      website: dto.website,
      address: dto.address,
      taxId: dto.taxId,
      dueDays: dto.dueDays,
      currency: dto.currency,
      invoiceTerms: dto.invoiceTerms,
      invoiceNotes: dto.invoiceNotes,
    };

    const config = await this.prisma.brandInvoiceConfig.upsert({
      where: { brandId: id },
      create: { brandId: id, ...data },
      update: data,
    });

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return this.mapToIBrandInvoiceConfig(config);
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

    return await this.mapToIBrand(updated);
  }

  async uploadAsset(
    id: string,
    orgId: string,
    field: 'logo' | 'favicon' | 'contract',
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<IBrand> {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId: orgId } });
    if (!brand) throw new NotFoundException('Brand not found');

    const key = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      `brands/${id}/${field}s`,
      orgId,
    );

    const data =
      field === 'logo' ? { logoUrl: key } : { faviconUrl: key };

    const updated = await this.prisma.brand.update({ where: { id }, data });

    const previousKey =
      field === 'logo'
        ? brand.logoUrl
        : brand.faviconUrl;

    if (previousKey) {
      await this.storage.delete(previousKey, orgId).catch(() => null);
    }

    await this.cache.delByPrefix(`brands:${orgId}:`);

    return await this.mapToIBrand(updated);
  }

  async findPublicByDomain(domain: string): Promise<Partial<IBrand>> {
    const brand = await this.prisma.brand.findFirst({
      where: { domain },
      select: { name: true, logoUrl: true, faviconUrl: true, primaryColor: true, secondaryColor: true, organizationId: true },
    });
    if (!brand) return {};
    return {
      name: brand.name,
      logoUrl: await this.storage.getUrl(brand.logoUrl, brand.organizationId),
      faviconUrl: await this.storage.getUrl(brand.faviconUrl, brand.organizationId),
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

  private async mapToIBrand(brand: any): Promise<IBrand> {
    return {
      id: brand.id,
      name: brand.name,
      domain: brand.domain ?? undefined,
      logoUrl: await this.storage.getUrl(brand.logoUrl, brand.organizationId),
      faviconUrl: await this.storage.getUrl(brand.faviconUrl, brand.organizationId),
      primaryColor: brand.primaryColor ?? undefined,
      secondaryColor: brand.secondaryColor ?? undefined,
      colors: (brand.colors as Record<string, string>) ?? undefined,
      organizationId: brand.organizationId,
      invoiceConfig: brand.invoiceConfig ? this.mapToIBrandInvoiceConfig(brand.invoiceConfig) : undefined,
      createdAt: brand.createdAt,
    };
  }

  private mapToIBrandInvoiceConfig(config: any): IBrandInvoiceConfig {
    return {
      id: config.id,
      brandId: config.brandId,
      billingEmail: config.billingEmail ?? undefined,
      supportEmail: config.supportEmail ?? undefined,
      phone: config.phone ?? undefined,
      website: config.website ?? undefined,
      address: config.address ?? undefined,
      taxId: config.taxId ?? undefined,
      dueDays: config.dueDays,
      currency: config.currency,
      invoiceTerms: config.invoiceTerms ?? undefined,
      invoiceNotes: config.invoiceNotes ?? undefined,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
