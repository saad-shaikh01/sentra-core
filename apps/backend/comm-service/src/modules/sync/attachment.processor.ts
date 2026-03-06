/**
 * AttachmentProcessor
 *
 * BullMQ worker for Gmail attachment archival to S3.
 * Skips gracefully if S3_BUCKET is not configured.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommAttachment, CommAttachmentDocument } from '../../schemas/comm-attachment.schema';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { GmailApiService } from './gmail-api.service';
import { COMM_ATTACHMENT_QUEUE } from './sync.constants';

interface ArchiveAttachmentJob {
  organizationId: string;
  identityId: string;
  gmailMessageId: string;
  attachmentId: string;
  filename: string;
}

@Processor(COMM_ATTACHMENT_QUEUE)
export class AttachmentProcessor extends WorkerHost {
  private readonly logger = new Logger(AttachmentProcessor.name);
  private readonly s3Client?: S3Client;
  private readonly s3Bucket?: string;

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    @InjectModel(CommAttachment.name)
    private readonly attachmentModel: Model<CommAttachmentDocument>,
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    private readonly gmailApi: GmailApiService,
    private readonly config: ConfigService,
  ) {
    super();

    this.s3Bucket = this.config.get<string>('S3_BUCKET');
    if (this.s3Bucket) {
      this.s3Client = new S3Client({
        region: this.config.get<string>('S3_REGION', 'us-east-1'),
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      });
    } else {
      this.logger.warn('S3_BUCKET not configured — attachment archival disabled');
    }
  }

  async process(job: Job<ArchiveAttachmentJob>): Promise<void> {
    if (!this.s3Client || !this.s3Bucket) {
      return; // S3 not configured, skip silently
    }

    const { organizationId, identityId, gmailMessageId, attachmentId, filename } = job.data;

    const identity = await this.identityModel
      .findOne({ _id: identityId, organizationId, isActive: true })
      .exec();

    if (!identity) {
      this.logger.warn(`No active identity ${identityId} for org ${organizationId}`);
      return;
    }

    const gmail = await this.gmailApi.getGmailClient(identity);

    try {
      // Download from Gmail
      const buffer = await this.gmailApi.getAttachment(gmail, gmailMessageId, attachmentId);

      // S3 key: org/message/filename
      const s3Key = `${organizationId}/${gmailMessageId}/${filename}`;

      // Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: s3Key,
          Body: buffer,
        }),
      );

      // Update attachment record
      await this.attachmentModel.findOneAndUpdate(
        { organizationId, gmailMessageId, gmailAttachmentId: attachmentId },
        {
          $set: {
            s3Key,
            s3Bucket: this.s3Bucket,
            archivedAt: new Date(),
            archiveStatus: 'ARCHIVED',
          },
        },
        { upsert: true },
      );

      await this.messageModel.updateOne(
        {
          organizationId,
          gmailMessageId,
          'attachments.gmailAttachmentId': attachmentId,
        },
        {
          $set: {
            'attachments.$.s3Key': s3Key,
            'attachments.$.archivedAt': new Date(),
          },
        },
      );

      this.logger.debug(`Archived attachment ${filename} for message ${gmailMessageId}`);
    } catch (err) {
      this.logger.error(`Failed to archive attachment ${attachmentId}: ${err}`);
      await this.attachmentModel.findOneAndUpdate(
        { organizationId, gmailMessageId, gmailAttachmentId: attachmentId },
        { $set: { archiveStatus: 'FAILED' } },
        { upsert: true },
      );
      throw err;
    }
  }
}
