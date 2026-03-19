import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { FcmService } from './fcm.service';
import { NotificationQueueModule } from './notification-queue.module';
import { NotificationQueueProcessor } from './notification-queue.processor';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';

@Module({
  imports: [
    NotificationQueueModule,  // registers and exports BullModule with the queue
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, FcmService, NotificationQueueProcessor],
  exports: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule {}
