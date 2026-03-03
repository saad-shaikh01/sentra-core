/**
 * SlaMonitorModule
 *
 * Runs periodic background checks for SLA breaches and emits
 * escalation events and performance penalties.
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SlaMonitorService } from './sla-monitor.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SlaMonitorService],
  exports: [SlaMonitorService],
})
export class SlaMonitorModule {}
