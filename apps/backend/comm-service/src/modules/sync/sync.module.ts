import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { IdentitiesModule } from '../identities/identities.module';
import { GmailApiService } from './gmail-api.service';
import { SyncService, COMM_SYNC_QUEUE, COMM_ATTACHMENT_QUEUE } from './sync.service';
import { SyncProcessor } from './sync.processor';
import { AttachmentProcessor } from './attachment.processor';
import { SyncController } from './sync.controller';
import { PubsubController } from './pubsub.controller';
import { WatchRenewalService } from './watch-renewal.service';
import { WatchdogService } from './watchdog.service';

@Module({
  imports: [
    CommSchemasModule,
    IdentitiesModule,
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
