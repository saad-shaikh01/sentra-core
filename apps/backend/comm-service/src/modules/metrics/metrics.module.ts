/**
 * MetricsModule (route module) — COMM-BE-020
 *
 * Registers MetricsController. MetricsService comes from the global MetricsModule.
 */

import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [MetricsController],
})
export class MetricsRouteModule {}
