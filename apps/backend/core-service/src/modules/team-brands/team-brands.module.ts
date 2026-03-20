import { Module } from '@nestjs/common';
import { TeamBrandsController } from './team-brands.controller';
import { TeamBrandsService } from './team-brands.service';

@Module({
  controllers: [TeamBrandsController],
  providers: [TeamBrandsService],
  exports: [TeamBrandsService],
})
export class TeamBrandsModule {}
