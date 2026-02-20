import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { Roles, CurrentUser } from '../auth/decorators';
import { CreateBrandDto, UpdateBrandDto, QueryBrandsDto } from './dto';
import { UserRole, IBrand, IPaginatedResponse } from '@sentra-core/types';

@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

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

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(
    @Param('id') id: string,
    @CurrentUser('orgId') orgId: string,
  ): Promise<{ message: string }> {
    return this.brandsService.remove(id, orgId);
  }
}
