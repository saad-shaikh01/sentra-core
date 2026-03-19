import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesNotificationService } from './sales-notification.service';
import { AuthorizeNetModule } from '../authorize-net';
import { StorageModule } from '../../common';
import { TeamsModule } from '../teams';
import { NotificationQueueModule } from '../notifications/notification-queue.module';

@Module({
  imports: [AuthorizeNetModule, StorageModule, TeamsModule, NotificationQueueModule],
  controllers: [SalesController],
  providers: [SalesService, SalesNotificationService],
  exports: [SalesService, SalesNotificationService],
})
export class SalesModule {}
