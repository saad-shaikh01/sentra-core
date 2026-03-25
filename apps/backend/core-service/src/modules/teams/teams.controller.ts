import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CurrentUser } from '../auth/decorators';

@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  findAll(@CurrentUser('orgId') orgId: string) {
    return this.teamsService.findAll(orgId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
    const team = await this.teamsService.findOne(id, orgId);
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }
}
