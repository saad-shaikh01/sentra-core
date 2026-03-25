import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BrandsService } from './brands.service';
import { Roles, CurrentUser, Public } from '../auth/decorators';
import { CreateBrandDto, UpdateBrandDto, QueryBrandsDto } from './dto';
import { UserRole, IBrand, IBrandInvoiceConfig, IPaginatedResponse } from '@sentra-core/types';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  @Get('public/by-domain')
  @Public()
  findByDomain(@Query('domain') domain: string): Promise<Partial<IBrand>> {
    return this.brandsService.findPublicByDomain(domain);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateBrandDto,
  ): Promise<IBrand> {
    return this.brandsService.create(orgId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('orgId') orgId: string,
    @Query() query: QueryBrandsDto,
  ): Promise<IPaginatedResponse<IBrand>> {
    return this.brandsService.findAll(orgId, query);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IBrand> {
    return this.brandsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<IBrand> {
    return this.brandsService.update(id, orgId, dto);
  }

  @Post(':id/upload/logo')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @UploadedFile() file: any,
  ): Promise<IBrand> {
    this.validateImageFile(file);
    return this.brandsService.uploadAsset(id, orgId, 'logo', file);
  }

  @Post(':id/upload/favicon')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadFavicon(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @UploadedFile() file: any,
  ): Promise<IBrand> {
    this.validateImageFile(file);
    return this.brandsService.uploadAsset(id, orgId, 'favicon', file);
  }

  @Get(':id/invoice-config')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  getInvoiceConfig(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<IBrandInvoiceConfig | null> {
    return this.brandsService.getInvoiceConfig(id, orgId);
  }

  @Put(':id/invoice-config')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  upsertInvoiceConfig(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: Partial<IBrandInvoiceConfig>,
  ): Promise<IBrandInvoiceConfig> {
    return this.brandsService.upsertInvoiceConfig(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.brandsService.remove(id, orgId);
  }

  private validateImageFile(file: any): void {
    if (!file) throw new BadRequestException('File is required');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum 5 MB');
    }
  }
}
