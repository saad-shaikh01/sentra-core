import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { Roles, CurrentUser } from '../auth/decorators';
import { ISalesTeam, UserRole } from '@sentra-core/types';

@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  create(@Body() dto: CreateTeamDto, @CurrentUser('orgId') orgId: string): Promise<ISalesTeam> {
    return this.teamsService.create(orgId, dto);
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  findAll(@CurrentUser('orgId') orgId: string): Promise<ISalesTeam[]> {
    return this.teamsService.findAll(orgId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<ISalesTeam> {
    return this.teamsService.findOne(id, orgId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser('orgId') orgId: string,
  ): Promise<ISalesTeam> {
    return this.teamsService.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('orgId') orgId: string): Promise<{ message: string }> {
    return this.teamsService.remove(id, orgId);
  }
}
