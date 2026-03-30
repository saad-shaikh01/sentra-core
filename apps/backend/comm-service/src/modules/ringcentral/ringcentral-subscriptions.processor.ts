import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { RINGCENTRAL_SUBSCRIPTIONS_QUEUE } from './ringcentral.constants';
import { RingCentralService } from './ringcentral.service';

type RingCentralSubscriptionSyncJob = {
  connectionId: string;
};

@Injectable()
@Processor(RINGCENTRAL_SUBSCRIPTIONS_QUEUE)
export class RingCentralSubscriptionsProcessor extends WorkerHost {
  constructor(private readonly ringCentralService: RingCentralService) {
    super();
  }

  async process(job: Job<RingCentralSubscriptionSyncJob>): Promise<void> {
    if (job.name !== 'sync-webhook-subscription') {
      return;
    }

    await this.ringCentralService.processSubscriptionSyncJob(job.data.connectionId);
  }
}
