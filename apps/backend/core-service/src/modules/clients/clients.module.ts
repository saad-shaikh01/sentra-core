import { Module } from '@nestjs/common';
import { MailClientModule } from '@sentra-core/mail-client';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { NotificationQueueModule } from '../notifications/notification-queue.module';

@Module({
  imports: [MailClientModule, NotificationQueueModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
