/**
 * MetricsService — COMM-BE-020
 *
 * Lightweight in-memory Prometheus-compatible metrics registry.
 * No external prom-client dependency — outputs standard text format.
 *
 * Counters tracked:
 *   comm_messages_received_total     (label: identity_id)
 *   comm_messages_sent_total         (label: identity_id)
 *   comm_token_refresh_total         (label: identity_id, result: success|error)
 *   comm_sync_errors_total           (label: identity_id, type)
 *   comm_tracking_failures_total     (label: area)
 *   comm_pixel_requests_total        (label: result)
 *   comm_maintenance_jobs_total      (label: job_name, result)
 *
 * Gauges tracked:
 *   comm_ws_connections              (current active WS connections)
 *   comm_dlq_depth                   (dead letter queue depth — updated on each metrics scrape)
 *
 * Histograms tracked (stored as sum + count + buckets):
 *   comm_sync_duration_seconds       (label: job_name)
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMM_SYNC_QUEUE } from '../../modules/sync/sync.constants';

interface Counter {
  value: number;
}

interface Gauge {
  value: number;
}

interface HistogramData {
  sum: number;
  count: number;
  // bucket upper bounds → cumulative count
  buckets: Map<number, number>;
}

const DURATION_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60, 120];

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();
  private readonly histograms = new Map<string, HistogramData>();

  constructor(
    @InjectQueue(COMM_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Counter helpers
  // ---------------------------------------------------------------------------

  incrementCounter(name: string, labels: Record<string, string> = {}, amount = 1): void {
    const key = this.labelKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += amount;
    } else {
      this.counters.set(key, { value: amount });
    }
  }

  // ---------------------------------------------------------------------------
  // Gauge helpers
  // ---------------------------------------------------------------------------

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(name, labels);
    this.gauges.set(key, { value });
  }

  incrementGauge(name: string, labels: Record<string, string> = {}): void {
    const key = this.labelKey(name, labels);
    const existing = this.gauges.get(key);
    this.gauges.set(key, { value: (existing?.value ?? 0) + 1 });
  }

  decrementGauge(name: string, labels: Record<string, string> = {}): void {
    const key = this.labelKey(name, labels);
    const existing = this.gauges.get(key);
    this.gauges.set(key, { value: Math.max(0, (existing?.value ?? 0) - 1) });
  }

  // ---------------------------------------------------------------------------
  // Histogram helpers
  // ---------------------------------------------------------------------------

  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(name, labels);
    let hist = this.histograms.get(key);
    if (!hist) {
      hist = {
        sum: 0,
        count: 0,
        buckets: new Map(DURATION_BUCKETS.map((b) => [b, 0])),
      };
      this.histograms.set(key, hist);
    }
    hist.sum += value;
    hist.count += 1;
    for (const bound of DURATION_BUCKETS) {
      if (value <= bound) {
        hist.buckets.set(bound, (hist.buckets.get(bound) ?? 0) + 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Named helpers for callers
  // ---------------------------------------------------------------------------

  recordSyncDuration(jobName: string, durationSeconds: number): void {
    this.observeHistogram('comm_sync_duration_seconds', durationSeconds, { job_name: jobName });
  }

  incrementMessagesReceived(identityId: string): void {
    this.incrementCounter('comm_messages_received_total', { identity_id: identityId });
  }

  incrementMessagesProcessed(identityId: string): void {
    this.incrementMessagesReceived(identityId);
  }

  incrementMessagesSent(identityId: string): void {
    this.incrementCounter('comm_messages_sent_total', { identity_id: identityId });
  }

  incrementTokenRefresh(identityId: string, result: 'success' | 'error'): void {
    this.incrementCounter('comm_token_refresh_total', { identity_id: identityId, result });
  }

  incrementSyncError(identityId: string, type = 'unknown'): void {
    this.incrementCounter('comm_sync_errors_total', { identity_id: identityId, type });
  }

  incrementTrackingFailure(area: string): void {
    this.incrementCounter('comm_tracking_failures_total', { area });
  }

  incrementPixelRequest(result: 'received' | 'logged' | 'error'): void {
    this.incrementCounter('comm_pixel_requests_total', { result });
  }

  trackWsConnect(): void {
    this.incrementGauge('comm_ws_connections');
  }

  trackWsDisconnect(): void {
    this.decrementGauge('comm_ws_connections');
  }

  // ---------------------------------------------------------------------------
  // Prometheus text-format output
  // ---------------------------------------------------------------------------

  async renderPrometheusText(): Promise<string> {
    await this.refreshQueueDepth();
    // Update DLQ depth just before rendering
    await this.refreshDlqDepth();

    const lines: string[] = [];

    // Counters
    const counterGroups = this.groupByMetricName(this.counters);
    for (const [metricName, entries] of counterGroups) {
      lines.push(`# TYPE ${metricName} counter`);
      for (const { labelStr, value } of entries) {
        lines.push(`${metricName}${labelStr} ${value}`);
      }
    }

    // Gauges
    const gaugeGroups = this.groupByMetricName(this.gauges);
    for (const [metricName, entries] of gaugeGroups) {
      lines.push(`# TYPE ${metricName} gauge`);
      for (const { labelStr, value } of entries) {
        lines.push(`${metricName}${labelStr} ${value}`);
      }
    }

    // Histograms
    const histGroups = this.groupByMetricName(this.histograms);
    for (const [metricName, entries] of histGroups) {
      lines.push(`# TYPE ${metricName} histogram`);
      for (const { labelStr, raw } of entries) {
        const hist = raw as HistogramData;
        const baseLabelStr = labelStr;

        // Cumulative bucket counts
        let cumulative = 0;
        for (const bound of DURATION_BUCKETS) {
          cumulative += hist.buckets.get(bound) ?? 0;
          const bucketLabel = baseLabelStr
            ? baseLabelStr.slice(0, -1) + `,le="${bound}"}`
            : `{le="${bound}"}`;
          lines.push(`${metricName}_bucket${bucketLabel} ${cumulative}`);
        }
        // +Inf bucket
        const infLabel = baseLabelStr
          ? baseLabelStr.slice(0, -1) + `,le="+Inf"}`
          : `{le="+Inf"}`;
        lines.push(`${metricName}_bucket${infLabel} ${hist.count}`);
        lines.push(`${metricName}_sum${baseLabelStr} ${hist.sum}`);
        lines.push(`${metricName}_count${baseLabelStr} ${hist.count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private labelKey(name: string, labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return name;
    const labelPart = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelPart}}`;
  }

  private groupByMetricName<T>(map: Map<string, T>): Map<string, { labelStr: string; value: number; raw: T }[]> {
    const result = new Map<string, { labelStr: string; value: number; raw: T }[]>();
    for (const [key, raw] of map.entries()) {
      const braceIdx = key.indexOf('{');
      const metricName = braceIdx === -1 ? key : key.slice(0, braceIdx);
      const labelStr = braceIdx === -1 ? '' : key.slice(braceIdx);
      const value = (raw as any).value ?? 0;
      if (!result.has(metricName)) result.set(metricName, []);
      result.get(metricName)!.push({ labelStr, value, raw });
    }
    return result;
  }

  private async refreshDlqDepth(): Promise<void> {
    try {
      const failedCount = await this.syncQueue.getFailedCount();
      this.setGauge('comm_dlq_depth', failedCount);
    } catch {
      // Redis might be unavailable; skip
    }
  }

  private async refreshQueueDepth(): Promise<void> {
    try {
      const counts = await this.syncQueue.getJobCounts('waiting', 'active', 'delayed');
      const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
      this.setGauge('comm_queue_depth', depth, { queue: COMM_SYNC_QUEUE });
    } catch {
      // Redis might be unavailable; skip
    }
  }
}
