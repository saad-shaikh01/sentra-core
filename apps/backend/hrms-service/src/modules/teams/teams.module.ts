import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TeamTypesController } from './team-types.controller';
import { TeamTypesService } from './team-types.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [HttpModule],
  controllers: [TeamTypesController, TeamsController],
  providers: [TeamTypesService, TeamsService],
  exports: [TeamTypesService, TeamsService],
})
export class TeamsModule {}
