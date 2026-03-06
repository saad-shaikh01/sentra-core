/**
 * MetricsController — COMM-BE-020
 *
 * GET /api/comm/metrics — Prometheus-compatible text output.
 * Intended for internal scraping only; no auth guard applied.
 */

import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../../common/metrics/metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.renderPrometheusText();
  }
}
