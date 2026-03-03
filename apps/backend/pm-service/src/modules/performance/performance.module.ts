/**
 * PerformanceModule
 *
 * Provides PerformanceService as a global singleton so domain modules
 * can inject it and record score deltas during QC and completion.
 */

import { Global, Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';

@Global()
@Module({
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
