import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { Roles, CurrentUser } from '../auth/decorators';
import { UserRole } from '@sentra-core/types';

@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  findAll(@CurrentUser('orgId') orgId: string) {
    return this.teamsService.findAll(orgId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
  async findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    const team = await this.teamsService.findOne(id, orgId);
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }
}
