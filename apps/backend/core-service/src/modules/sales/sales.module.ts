import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesNotificationService } from './sales-notification.service';
import { AuthorizeNetModule } from '../authorize-net';
import { StorageModule } from '../../common';
import { TeamsModule } from '../teams';
import { NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';

@Module({
  imports: [
    AuthorizeNetModule,
    StorageModule,
    TeamsModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [SalesController],
  providers: [SalesService, SalesNotificationService],
  exports: [SalesService, SalesNotificationService],
})
export class SalesModule {}
