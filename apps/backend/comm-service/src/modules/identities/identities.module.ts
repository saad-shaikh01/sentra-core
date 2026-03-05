import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { IdentitiesController } from './identities.controller';
import { IdentitiesService } from './identities.service';

@Module({
  imports: [CommSchemasModule],
  controllers: [IdentitiesController],
  providers: [IdentitiesService],
  exports: [IdentitiesService],
})
export class IdentitiesModule {}
