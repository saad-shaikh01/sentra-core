import { Module, forwardRef } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { IdentitiesController } from './identities.controller';
import { IdentitiesService } from './identities.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [CommSchemasModule, forwardRef(() => SyncModule)],
  controllers: [IdentitiesController],
  providers: [IdentitiesService],
  exports: [IdentitiesService],
})
export class IdentitiesModule {}
