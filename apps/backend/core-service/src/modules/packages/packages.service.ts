import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IProductPackage, IPackageItem } from '@sentra-core/types';
import { CreatePackageDto, PackageItemDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreatePackageDto): Promise<IProductPackage> {
    if (dto.brandId) await this.validateBrand(dto.brandId, orgId);

    const pkg = await this.prisma.productPackage.create({
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        brandId: dto.brandId,
        organizationId: orgId,
        category: dto.category ?? null,
        price: dto.price ?? null,
        currency: dto.currency ?? 'USD',
        items: dto.items
          ? { create: dto.items.map(this.mapItemDto) }
          : undefined,
      },
      include: { items: true },
    });

    return this.mapToIProductPackage(pkg);
  }

  async findAll(orgId: string, brandId?: string): Promise<IProductPackage[]> {
    const pkgs = await this.prisma.productPackage.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        ...(brandId ? { OR: [{ brandId }, { brandId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: { items: { where: { isActive: true } } },
    });
    return pkgs.map((p) => this.mapToIProductPackage(p));
  }

  async findOne(id: string, orgId: string): Promise<IProductPackage> {
    const pkg = await this.prisma.productPackage.findFirst({
      where: { id, organizationId: orgId },
      include: { items: true },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return this.mapToIProductPackage(pkg);
  }

  async update(id: string, orgId: string, dto: UpdatePackageDto): Promise<IProductPackage> {
    const pkg = await this.prisma.productPackage.findFirst({ where: { id, organizationId: orgId } });
    if (!pkg) throw new NotFoundException('Package not found');
    if (dto.brandId) await this.validateBrand(dto.brandId, orgId);

    if (dto.items !== undefined) {
      await this.prisma.packageItem.deleteMany({ where: { packageId: id } });
    }

    const updated = await this.prisma.productPackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.brandId !== undefined && { brandId: dto.brandId }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.items !== undefined && {
          items: { create: dto.items.map(this.mapItemDto) },
        }),
      },
      include: { items: true },
    });

    return this.mapToIProductPackage(updated);
  }

  async addItem(packageId: string, orgId: string, dto: PackageItemDto): Promise<IProductPackage> {
    const pkg = await this.prisma.productPackage.findFirst({ where: { id: packageId, organizationId: orgId } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.prisma.packageItem.create({ data: { ...this.mapItemDto(dto), packageId } });

    return this.findOne(packageId, orgId);
  }

  async removeItem(packageId: string, itemId: string, orgId: string): Promise<IProductPackage> {
    const pkg = await this.prisma.productPackage.findFirst({ where: { id: packageId, organizationId: orgId } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.prisma.packageItem.update({ where: { id: itemId }, data: { isActive: false } });

    return this.findOne(packageId, orgId);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const pkg = await this.prisma.productPackage.findFirst({ where: { id, organizationId: orgId } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.prisma.productPackage.delete({ where: { id } });
    return { message: 'Package deleted successfully' };
  }

  private async validateBrand(brandId: string, orgId: string): Promise<void> {
    const brand = await this.prisma.brand.findFirst({ where: { id: brandId, organizationId: orgId } });
    if (!brand) throw new BadRequestException('Brand not found or does not belong to this organization');
  }

  private mapItemDto(dto: PackageItemDto) {
    return { name: dto.name, description: dto.description, unitPrice: dto.unitPrice ?? null };
  }

  private mapToIProductPackage(pkg: any): IProductPackage {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? undefined,
      isActive: pkg.isActive,
      brandId: pkg.brandId ?? undefined,
      organizationId: pkg.organizationId,
      category: pkg.category ?? undefined,
      price: pkg.price != null ? Number(pkg.price) : undefined,
      currency: pkg.currency,
      items: (pkg.items ?? []).map((i: any): IPackageItem => ({
        id: i.id,
        name: i.name,
        description: i.description ?? undefined,
        unitPrice: i.unitPrice != null ? Number(i.unitPrice) : undefined,
        isActive: i.isActive,
        packageId: i.packageId,
      })),
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  }
}
