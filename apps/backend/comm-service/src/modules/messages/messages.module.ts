import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { IdentitiesModule } from '../identities/identities.module';
import { SyncModule } from '../sync/sync.module';
import { EntityLinksModule } from '../entity-links/entity-links.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    CommSchemasModule,
    IdentitiesModule,
    SyncModule,
    AttachmentsModule,
    EntityLinksModule,
    TrackingModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
