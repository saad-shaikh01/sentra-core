import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { IdentitiesModule } from '../identities/identities.module';
import { SyncModule } from '../sync/sync.module';
import { EntityLinksModule } from '../entity-links/entity-links.module';
import { SettingsModule } from '../settings/settings.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ScheduledSendProcessor } from './scheduled-send.processor';
import { COMM_SCHEDULED_SEND_QUEUE } from '../sync/sync.constants';

@Module({
  imports: [
    CommSchemasModule,
    IdentitiesModule,
    SyncModule,
    AttachmentsModule,
    EntityLinksModule,
    SettingsModule,
    TrackingModule,
    BullModule.registerQueue({ name: COMM_SCHEDULED_SEND_QUEUE }),
  ],
  controllers: [MessagesController],
  providers: [MessagesService, ScheduledSendProcessor],
  exports: [MessagesService],
})
export class MessagesModule {}
