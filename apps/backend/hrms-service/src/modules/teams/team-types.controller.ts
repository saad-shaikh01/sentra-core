import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import { CreateTeamTypeDto, UpdateTeamTypeDto } from './dto';
import { TeamTypesService } from './team-types.service';

@Controller('team-types')
export class TeamTypesController {
  constructor(private readonly teamTypesService: TeamTypesService) {}

  @Get()
  @Permissions('hrms:teams:view')
  async findAll(@OrgContext() context: { organizationId: string }) {
    return this.teamTypesService.findAll(context.organizationId);
  }

  @Post()
  @Permissions('hrms:teams:manage')
  async create(
    @Body() dto: CreateTeamTypeDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamTypesService.create(context.organizationId, dto),
    };
  }

  @Patch(':id')
  @Permissions('hrms:teams:manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamTypeDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamTypesService.update(id, context.organizationId, dto),
    };
  }

  @Delete(':id')
  @Permissions('hrms:teams:manage')
  async remove(
    @Param('id') id: string,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamTypesService.remove(id, context.organizationId),
    };
  }
}
