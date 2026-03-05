import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { IdentitiesModule } from '../identities/identities.module';
import { SyncModule } from '../sync/sync.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [CommSchemasModule, IdentitiesModule, SyncModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
