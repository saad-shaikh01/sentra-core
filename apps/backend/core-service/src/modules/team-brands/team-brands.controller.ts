import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TeamBrandsService } from './team-brands.service';
import { AssignBrandDto } from './dto';
import { CurrentUser, Roles } from '../auth/decorators';
import { UserRole } from '@sentra-core/types';

@Controller('team-brands')
export class TeamBrandsController {
  constructor(private readonly service: TeamBrandsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  findAll(@CurrentUser('orgId') orgId: string) {
    return this.service.findAll(orgId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  assign(@Body() dto: AssignBrandDto, @CurrentUser('orgId') orgId: string) {
    return this.service.assign(dto, orgId);
  }

  @Delete(':brandId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  unassign(
    @Param('brandId') brandId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.service.unassign(brandId, orgId);
  }

  @Patch(':brandId/reassign/:teamId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  reassign(
    @Param('brandId') brandId: string,
    @Param('teamId') teamId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.service.reassign(brandId, teamId, orgId);
  }
}
