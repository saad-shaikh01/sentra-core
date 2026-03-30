import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { InternalContactsClient } from '../../common/http/internal-contacts.client';
import { RingCentralController } from './ringcentral.controller';
import {
  RINGCENTRAL_EVENTS_QUEUE,
  RINGCENTRAL_SUBSCRIPTIONS_QUEUE,
} from './ringcentral.constants';
import { RingCentralEventsProcessor } from './ringcentral-events.processor';
import { RingCentralService } from './ringcentral.service';
import { RingCentralSubscriptionsProcessor } from './ringcentral-subscriptions.processor';

@Module({
  imports: [
    CommSchemasModule,
    HttpModule,
    BullModule.registerQueue(
      { name: RINGCENTRAL_EVENTS_QUEUE },
      { name: RINGCENTRAL_SUBSCRIPTIONS_QUEUE },
    ),
  ],
  controllers: [RingCentralController],
  providers: [
    RingCentralService,
    InternalContactsClient,
    RingCentralEventsProcessor,
    RingCentralSubscriptionsProcessor,
  ],
  exports: [RingCentralService],
})
export class RingCentralModule {}
