import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { TeamsModule } from '../teams';
import { AuthModule } from '../auth/auth.module';
import { NotificationQueueModule } from '../notifications/notification-queue.module';
import { PermissionsService } from '../../common';

@Module({
  imports: [TeamsModule, AuthModule, NotificationQueueModule],
  controllers: [LeadsController],
  providers: [LeadsService, PermissionsService],
  exports: [LeadsService],
})
export class LeadsModule {}
