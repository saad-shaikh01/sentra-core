import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { ScopeController } from './scope.controller';
import { TeamBrandHelper } from './team-brand.helper';

@Global()
@Module({
  controllers: [ScopeController],
  providers: [ScopeService, TeamBrandHelper],
  exports: [ScopeService, TeamBrandHelper],
})
export class ScopeModule {}
