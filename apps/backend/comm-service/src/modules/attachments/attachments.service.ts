import { Injectable, Logger, NotFoundException, GoneException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { GmailApiService } from '../sync/gmail-api.service';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly s3Client?: S3Client;
  private readonly s3Bucket?: string;

  constructor(
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly gmailApi: GmailApiService,
    private readonly config: ConfigService,
  ) {
    this.s3Bucket = this.config.get<string>('S3_BUCKET');
    if (this.s3Bucket) {
      this.s3Client = new S3Client({
        region: this.config.get<string>('S3_REGION', 'us-east-1'),
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      });
    }
  }

  /**
   * Returns a presigned S3 URL for a message attachment.
   * If not yet archived (s3Key null), fetches from Gmail and archives first.
   */
  async getAttachmentUrl(
    organizationId: string,
    messageId: string,
    attachmentIndex: number,
  ): Promise<{ url: string; filename: string }> {
    const message = await this.messageModel
      .findOne({ _id: messageId, organizationId })
      .exec();

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    const att = message.attachments[attachmentIndex];
    if (!att) {
      throw new NotFoundException(`Attachment index ${attachmentIndex} not found`);
    }

    if (att.s3Key && this.s3Client && this.s3Bucket) {
      // Normal path — attachment already archived
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({ Bucket: this.s3Bucket, Key: att.s3Key }),
        { expiresIn: 900 }, // 15 minutes
      );
      return { url, filename: att.filename };
    }

    // Edge case — not archived yet; attempt live Gmail fetch + archive
    if (!att.gmailAttachmentId) {
      throw new GoneException({ error: 'ATTACHMENT_UNAVAILABLE', filename: att.filename });
    }

    const identity = await this.identityModel
      .findOne({ organizationId, isActive: true })
      .exec();

    if (!identity) {
      throw new GoneException({ error: 'ATTACHMENT_UNAVAILABLE', filename: att.filename });
    }

    try {
      const gmail = await this.gmailApi.getGmailClient(identity);
      const buffer = await this.gmailApi.getAttachment(gmail, message.gmailMessageId, att.gmailAttachmentId!);

      if (this.s3Client && this.s3Bucket) {
        const s3Key = `${organizationId}/${message.gmailMessageId}/${att.filename}`;
        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: s3Key,
          Body: buffer,
        }));

        // Update s3Key on message doc
        await this.messageModel.findByIdAndUpdate(message._id, {
          $set: { [`attachments.${attachmentIndex}.s3Key`]: s3Key },
        });

        const url = await getSignedUrl(
          this.s3Client,
          new GetObjectCommand({ Bucket: this.s3Bucket, Key: s3Key }),
          { expiresIn: 900 },
        );
        return { url, filename: att.filename };
      }

      // S3 not configured — return data URL as fallback (dev only)
      const url = `data:${att.mimeType};base64,${buffer.toString('base64')}`;
      return { url, filename: att.filename };
    } catch (err) {
      this.logger.error(`Failed to fetch attachment from Gmail: ${err}`);
      throw new GoneException({ error: 'ATTACHMENT_UNAVAILABLE', filename: att.filename });
    }
  }

  /**
   * Upload a file for outbound compose (pre-upload before send).
   */
  async uploadAttachment(
    organizationId: string,
    file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
  ): Promise<{ s3Key: string; filename: string; size: number; mimeType: string }> {
    if (!this.s3Client || !this.s3Bucket) {
      throw new Error('S3 not configured');
    }

    const s3Key = `${organizationId}/outbound/${Date.now()}-${file.originalname}`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    return { s3Key, filename: file.originalname, size: file.size, mimeType: file.mimetype };
  }
}
