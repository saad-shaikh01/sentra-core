import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { ScopeController } from './scope.controller';
import { TeamBrandHelper } from './team-brand.helper';
import { PermissionsService } from '../../common';

@Global()
@Module({
  controllers: [ScopeController],
  providers: [ScopeService, TeamBrandHelper, PermissionsService],
  exports: [ScopeService, TeamBrandHelper, PermissionsService],
})
export class ScopeModule {}
