import { Queue } from 'bullmq';
import { UserRole } from '@sentra-core/types';
import { ForbiddenException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let queue: {
    add: jest.Mock;
    getJob: jest.Mock;
  };

  beforeEach(() => {
    queue = {
      add: jest.fn().mockResolvedValue({
        id: 'job-1',
        name: 'backfill-intelligence',
      }),
      getJob: jest.fn().mockResolvedValue({
        id: 'job-1',
        name: 'backfill-intelligence',
        data: { organizationId: 'org-1' },
        progress: { processed: 10, total: 100 },
        finishedOn: null,
        failedReason: null,
        returnvalue: null,
        getState: jest.fn().mockResolvedValue('active'),
      }),
    };

    service = new MaintenanceService(queue as unknown as Queue);
  });

  it('queues backfill jobs for privileged users', async () => {
    const job = await service.queueIntelligenceBackfill('org-1', 'user-1', UserRole.ADMIN, 150);

    expect(queue.add).toHaveBeenCalledWith(
      'backfill-intelligence',
      expect.objectContaining({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        batchSize: 150,
      }),
      { attempts: 1 },
    );
    expect(job).toMatchObject({ id: 'job-1', state: 'queued', batchSize: 150 });
  });

  it('blocks non-admin repair requests', async () => {
    await expect(
      service.queueIntelligenceBackfill('org-1', 'user-1', UserRole.FRONTSELL_AGENT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
