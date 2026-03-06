import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto, PackageItemDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { Roles, CurrentUser, AppAccess } from '../auth/decorators';
import { IProductPackage, UserRole, AppCode } from '@sentra-core/types';

@Controller('packages')
@AppAccess(AppCode.SALES_DASHBOARD)
export class PackagesController {
  constructor(private packagesService: PackagesService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  create(@Body() dto: CreatePackageDto, @CurrentUser('orgId') orgId: string): Promise<IProductPackage> {
    return this.packagesService.create(orgId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('orgId') orgId: string,
    @Query('brandId') brandId?: string,
  ): Promise<IProductPackage[]> {
    return this.packagesService.findAll(orgId, brandId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<IProductPackage> {
    return this.packagesService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IProductPackage> {
    return this.packagesService.update(id, orgId, dto);
  }

  @Post(':id/items')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  addItem(
    @Param('id') id: string,
    @Body() dto: PackageItemDto,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IProductPackage> {
    return this.packagesService.addItem(id, orgId, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IProductPackage> {
    return this.packagesService.removeItem(id, itemId, orgId);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<{ message: string }> {
    return this.packagesService.remove(id, orgId);
  }
}
