import { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let syncQueue: {
    getFailedCount: jest.Mock;
    getJobCounts: jest.Mock;
  };

  beforeEach(() => {
    syncQueue = {
      getFailedCount: jest.fn().mockResolvedValue(2),
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 3,
        active: 2,
        delayed: 1,
      }),
    };

    service = new MetricsService(syncQueue as unknown as Queue);
  });

  it('increments comm_sync_errors_total with identity and type labels', async () => {
    service.incrementSyncError('identity-1', 'rate_limit');

    const text = await service.renderPrometheusText();

    expect(text).toContain('comm_sync_errors_total{identity_id="identity-1",type="rate_limit"} 1');
  });

  it('increments comm_token_refresh_total with identity and result labels', async () => {
    service.incrementTokenRefresh('identity-1', 'success');

    const text = await service.renderPrometheusText();

    expect(text).toContain('comm_token_refresh_total{identity_id="identity-1",result="success"} 1');
  });

  it('increments comm_messages_sent_total with identity labels', async () => {
    service.incrementMessagesSent('identity-1');

    const text = await service.renderPrometheusText();

    expect(text).toContain('comm_messages_sent_total{identity_id="identity-1"} 1');
  });

  it('increments comm_messages_received_total with identity labels', async () => {
    service.incrementMessagesReceived('identity-1');

    const text = await service.renderPrometheusText();

    expect(text).toContain('comm_messages_received_total{identity_id="identity-1"} 1');
  });

  it('renders comm_queue_depth with the queue label in Prometheus format', async () => {
    const text = await service.renderPrometheusText();

    expect(text).toContain('comm_queue_depth{queue="comm-sync"} 6');
  });
});
