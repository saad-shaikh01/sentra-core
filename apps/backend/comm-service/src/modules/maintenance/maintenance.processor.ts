import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job } from 'bullmq';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { SyncService } from '../sync/sync.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { COMM_MAINTENANCE_QUEUE } from './maintenance.constants';

type BackfillIntelligenceJob = {
  organizationId: string;
  requestedByUserId: string;
  batchSize: number;
};

@Injectable()
@Processor(COMM_MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    private readonly syncService: SyncService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    super();
  }

  async process(job: Job<BackfillIntelligenceJob>): Promise<Record<string, unknown>> {
    if (job.name !== 'backfill-intelligence') {
      return { skipped: true };
    }

    const batchSize = Math.max(10, Math.min(500, Math.round(job.data.batchSize || 100)));
    const total = await this.threadModel.countDocuments({ organizationId: job.data.organizationId });
    let processed = 0;
    let cursor: Types.ObjectId | null = null;

    while (true) {
      const query: Record<string, unknown> = { organizationId: job.data.organizationId };
      if (cursor) {
        query._id = { $gt: cursor };
      }

      const threads = await this.threadModel
        .find(query)
        .sort({ _id: 1 })
        .limit(batchSize)
        .select('_id gmailThreadId identityId')
        .lean()
        .exec();

      if (threads.length === 0) {
        break;
      }

      for (const thread of threads) {
        await this.syncService.refreshThreadState(
          job.data.organizationId,
          thread.gmailThreadId,
          thread.identityId,
        );
        processed += 1;
      }

      cursor = threads[threads.length - 1]._id as Types.ObjectId;
      await job.updateProgress({
        processed,
        total,
        batchSize,
      });
    }

    this.metrics?.incrementCounter('comm_maintenance_jobs_total', {
      job_name: job.name,
      result: 'success',
    });

    this.logger.log(
      `Completed intelligence backfill for org ${job.data.organizationId}: ${processed}/${total}`,
    );

    return {
      processed,
      total,
      batchSize,
      completedAt: new Date().toISOString(),
    };
  }
}
