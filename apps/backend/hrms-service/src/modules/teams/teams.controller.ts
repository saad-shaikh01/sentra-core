import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgContext, Permissions } from '../../common';
import {
  AddTeamMemberDto,
  CreateTeamDto,
  TeamsQueryDto,
  UpdateTeamDto,
  UpdateTeamMemberDto,
} from './dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  async findAll(
    @Query() query: TeamsQueryDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return this.teamsService.findAll(context.organizationId, query);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamsService.findOne(id, context.organizationId),
    };
  }

  @Post()
  @Permissions('hrms:teams:manage')
  async create(
    @Body() dto: CreateTeamDto,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.teamsService.create(context.organizationId, dto, context.userId),
    };
  }

  @Patch(':id')
  @Permissions('hrms:teams:manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamsService.update(id, context.organizationId, dto),
    };
  }

  @Delete(':id')
  @Permissions('hrms:teams:manage')
  async softDelete(
    @Param('id') id: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.teamsService.softDelete(id, context.organizationId, context.userId),
    };
  }

  @Post(':id/members')
  @Permissions('hrms:teams:manage')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.teamsService.addMember(id, context.organizationId, dto, context.userId),
    };
  }

  @Patch(':id/members/:userId')
  @Permissions('hrms:teams:manage')
  async updateMemberRole(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTeamMemberDto,
    @OrgContext() context: { organizationId: string },
  ) {
    return {
      data: await this.teamsService.updateMemberRole(
        teamId,
        userId,
        context.organizationId,
        dto.role,
      ),
    };
  }

  @Delete(':id/members/:userId')
  @Permissions('hrms:teams:manage')
  async removeMember(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @OrgContext() context: { organizationId: string; userId: string },
  ) {
    return {
      data: await this.teamsService.removeMember(
        teamId,
        userId,
        context.organizationId,
        context.userId,
      ),
    };
  }
}
