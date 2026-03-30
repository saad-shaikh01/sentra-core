import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { IdentitiesModule } from '../identities/identities.module';
import { EntityLinksModule } from '../entity-links/entity-links.module';
import { GmailApiService } from './gmail-api.service';
import { SyncService } from './sync.service';
import { SyncProcessor } from './sync.processor';
import { AttachmentProcessor } from './attachment.processor';
import { SyncController } from './sync.controller';
import { PubsubController } from './pubsub.controller';
import { WatchRenewalService } from './watch-renewal.service';
import { WatchdogService } from './watchdog.service';
import { COMM_ATTACHMENT_QUEUE, COMM_SYNC_QUEUE } from './sync.constants';
import { TrackingModule } from '../tracking/tracking.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    CommSchemasModule,
    forwardRef(() => IdentitiesModule),
    EntityLinksModule,
    TrackingModule,
    IntelligenceModule,
    SettingsModule,
    BullModule.registerQueue(
      { name: COMM_SYNC_QUEUE },
      { name: COMM_ATTACHMENT_QUEUE },
    ),
  ],
  controllers: [SyncController, PubsubController],
  providers: [
    GmailApiService,
    SyncService,
    SyncProcessor,
    AttachmentProcessor,
    WatchRenewalService,
    WatchdogService,
  ],
  exports: [SyncService, GmailApiService],
})
export class SyncModule {}
