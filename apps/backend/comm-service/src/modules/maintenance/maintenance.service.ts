import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMM_MAINTENANCE_QUEUE } from './maintenance.constants';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectQueue(COMM_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
  ) {}

  async queueIntelligenceBackfill(
    organizationId: string,
    userId: string,
    role: UserRole,
    batchSize = 100,
  ) {
    this.assertPrivileged(role);

    const job = await this.maintenanceQueue.add(
      'backfill-intelligence',
      {
        organizationId,
        requestedByUserId: userId,
        batchSize,
      },
      {
        attempts: 1,
      },
    );

    return {
      id: String(job.id),
      name: job.name,
      batchSize,
      state: 'queued',
    };
  }

  async getJobStatus(
    organizationId: string,
    role: UserRole,
    jobId: string,
  ) {
    this.assertPrivileged(role);

    const job = await this.maintenanceQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const data = job.data as { organizationId?: string } | undefined;
    if (data?.organizationId !== organizationId) {
      throw new ForbiddenException('Job does not belong to this organization');
    }

    const state = await job.getState();
    return {
      id: String(job.id),
      name: job.name,
      state,
      progress: (job.progress as Record<string, unknown>) ?? job.progress,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  }

  private assertPrivileged(role: UserRole): void {
    if (role !== UserRole.OWNER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only owners and admins can run repair jobs');
    }
  }
}
