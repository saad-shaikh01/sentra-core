import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { SyncModule } from '../sync/sync.module';
import { COMM_MAINTENANCE_QUEUE } from './maintenance.constants';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [
    CommSchemasModule,
    SyncModule,
    BullModule.registerQueue({ name: COMM_MAINTENANCE_QUEUE }),
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceProcessor],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
