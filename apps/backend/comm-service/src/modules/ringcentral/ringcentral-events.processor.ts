import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { RINGCENTRAL_EVENTS_QUEUE } from './ringcentral.constants';
import { RingCentralService } from './ringcentral.service';

type RingCentralWebhookEventJob = {
  webhookEventId: string;
};

@Injectable()
@Processor(RINGCENTRAL_EVENTS_QUEUE)
export class RingCentralEventsProcessor extends WorkerHost {
  constructor(private readonly ringCentralService: RingCentralService) {
    super();
  }

  async process(job: Job<RingCentralWebhookEventJob>): Promise<void> {
    if (job.name !== 'process-webhook-event') {
      return;
    }

    await this.ringCentralService.processWebhookEventJob(job.data.webhookEventId);
  }
}
