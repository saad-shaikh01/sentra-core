import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  exports: [BullModule],  // export so NotificationsModule can inject the Queue
})
export class NotificationQueueModule {}
