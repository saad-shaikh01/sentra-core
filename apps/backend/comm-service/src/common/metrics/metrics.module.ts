/**
 * MetricsModule — COMM-BE-020
 *
 * Global module — MetricsService is injected wherever needed without
 * re-importing the module.
 */

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MetricsService } from './metrics.service';
import { COMM_SYNC_QUEUE } from '../../modules/sync/sync.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: COMM_SYNC_QUEUE })],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
