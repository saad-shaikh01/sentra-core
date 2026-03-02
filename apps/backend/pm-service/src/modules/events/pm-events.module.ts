/**
 * PmEventsModule — PM-BE-018
 *
 * Provides PmEventsService as a global singleton so any domain module
 * can inject it and emit events without circular imports.
 *
 * Phase 0: in-process Node.js EventEmitter + pm_activity_logs persistence.
 * Migration: swap emit() for outbox writes or MQ publish when ready.
 */

import { Global, Module } from '@nestjs/common';
import { PmEventsService } from './pm-events.service';

@Global()
@Module({
  providers: [PmEventsService],
  exports: [PmEventsService],
})
export class PmEventsModule {}
