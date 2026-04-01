import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { COMM_SCHEDULED_SEND_QUEUE } from '../sync/sync.constants';

export interface ScheduledSendJobData {
  organizationId: string;
  userId: string;
  dto: SendMessageDto;
}

@Processor(COMM_SCHEDULED_SEND_QUEUE)
export class ScheduledSendProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledSendProcessor.name);

  constructor(private readonly messagesService: MessagesService) {
    super();
  }

  async process(job: Job<ScheduledSendJobData>): Promise<void> {
    const { organizationId, userId, dto } = job.data;
    this.logger.log(`Processing scheduled send job ${job.id} for org ${organizationId}`);
    // strip scheduledAt so it doesn't re-queue
    const { scheduledAt: _ignored, ...sendDto } = dto;
    await this.messagesService.sendMessage(organizationId, userId, sendDto as SendMessageDto);
  }
}
