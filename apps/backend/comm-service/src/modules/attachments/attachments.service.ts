import { Injectable, Logger, NotFoundException, GoneException } from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { GmailApiService } from '../sync/gmail-api.service';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly s3Client?: S3Client;
  private readonly s3Bucket?: string;
  private readonly cdnBaseUrl?: string;

  constructor(
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly gmailApi: GmailApiService,
    private readonly config: ConfigService,
  ) {
    this.s3Bucket = this.config.get<string>('WASABI_BUCKET');
    this.cdnBaseUrl = this.config.get<string>('BUNNY_CDN_BASE_URL');
    if (this.s3Bucket) {
      this.s3Client = new S3Client({
        region: this.config.get<string>('WASABI_REGION', 'us-east-1'),
        endpoint: this.config.get<string>('WASABI_ENDPOINT') || undefined,
        credentials: {
          accessKeyId: this.config.get<string>('WASABI_ACCESS_KEY_ID', ''),
          secretAccessKey: this.config.get<string>('WASABI_SECRET_ACCESS_KEY', ''),
        },
        forcePathStyle: true,
      });
    }
  }

  async getAttachmentUrl(
    organizationId: string,
    messageId: string,
    attachmentIndex: number,
    userId: string,
    role: UserRole,
  ): Promise<{ url: string; filename: string }> {
    const message = await this.findMessageByIdOrGmailId(organizationId, messageId);

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (!this.isPrivileged(role)) {
      const userIdentityIds = await this.resolveUserIdentityIds(organizationId, userId);
      if (!userIdentityIds.includes(message.identityId)) {
        throw new NotFoundException(`Message ${messageId} not found`);
      }
    }

    const attachment = message.attachments[attachmentIndex];
    if (!attachment) {
      throw new NotFoundException(`Attachment index ${attachmentIndex} not found`);
    }

    if (attachment.s3Key && this.s3Client && this.s3Bucket && this.cdnBaseUrl) {
      return { url: this.buildCdnUrl(attachment.s3Key), filename: attachment.filename };
    }

    if (!attachment.gmailAttachmentId) {
      throw new GoneException({ error: 'ATTACHMENT_UNAVAILABLE', filename: attachment.filename });
    }

    const identity = await this.identityModel
      .findOne({ _id: message.identityId, organizationId, isActive: true })
      .exec();

    if (!identity) {
      throw new GoneException({ error: 'ATTACHMENT_UNAVAILABLE', filename: attachment.filename });
    }

    try {
      const gmail = await this.gmailApi.getGmailClient(identity);
      const buffer = await this.gmailApi.getAttachment(
        gmail,
        message.gmailMessageId,
        attachment.gmailAttachmentId,
      );

      if (this.s3Client && this.s3Bucket && this.cdnBaseUrl) {
        const s3Key = `${organizationId}/${message.gmailMessageId}/${attachment.filename}`;
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: s3Key,
            Body: buffer,
            ContentType: attachment.mimeType,
            Metadata: {
              filename: attachment.filename,
              mimetype: attachment.mimeType,
            },
          }),
        );

        await this.messageModel.findByIdAndUpdate(message._id, {
          $set: { [`attachments.${attachmentIndex}.s3Key`]: s3Key },
        });

        return { url: this.buildCdnUrl(s3Key), filename: attachment.filename };
      }

      const url = `data:${attachment.mimeType};base64,${buffer.toString('base64')}`;
      return { url, filename: attachment.filename };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch attachment from Gmail for message ${message.gmailMessageId}: ${msg}`, error instanceof Error ? error.stack : undefined);
      const isTokenError = msg.toLowerCase().includes('token') || msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('401') || msg.toLowerCase().includes('403');
      throw new GoneException({
        error: 'ATTACHMENT_UNAVAILABLE',
        filename: attachment.filename,
        reason: isTokenError ? 'TOKEN_EXPIRED' : 'FETCH_FAILED',
      });
    }
  }

  async uploadAttachment(
    organizationId: string,
    file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
  ): Promise<{ s3Key: string; cdnUrl: string; filename: string; size: number; mimeType: string }> {
    if (!this.s3Client || !this.s3Bucket || !this.cdnBaseUrl) {
      throw new Error('Wasabi or Bunny CDN is not configured');
    }

    const s3Key = `${organizationId}/outbound/${Date.now()}-${file.originalname}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          filename: file.originalname,
          mimetype: file.mimetype,
        },
      }),
    );

    return {
      s3Key,
      cdnUrl: this.buildCdnUrl(s3Key),
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async fetchAttachmentBuffers(
    s3Keys: string[],
  ): Promise<Array<{ buffer: Buffer; filename: string; mimeType: string; size: number; s3Key: string }>> {
    if (!this.s3Client || !this.s3Bucket) {
      throw new Error('Wasabi is not configured');
    }

    return Promise.all(
      s3Keys.map(async (s3Key) => {
        const response = await this.s3Client!.send(
          new GetObjectCommand({ Bucket: this.s3Bucket, Key: s3Key }),
        );
        const buffer = await this.toBuffer(response.Body);
        const metadata = response.Metadata ?? {};
        const filename = metadata.filename ?? this.extractFilenameFromKey(s3Key);
        const mimeType = response.ContentType ?? metadata.mimetype ?? 'application/octet-stream';
        const size = response.ContentLength ?? buffer.length;

        return { buffer, filename, mimeType, size, s3Key };
      }),
    );
  }

  private buildCdnUrl(s3Key: string): string {
    return `${this.cdnBaseUrl?.replace(/\/+$/, '')}/${s3Key}`;
  }

  private extractFilenameFromKey(s3Key: string): string {
    const basename = s3Key.split('/').pop() ?? s3Key;
    return basename.replace(/^\d+-/, '');
  }

  private async toBuffer(body: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    if (typeof body === 'string') {
      return Buffer.from(body);
    }

    if (body && typeof body === 'object' && 'transformToByteArray' in body) {
      const byteArray = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(byteArray);
    }

    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    throw new Error('Attachment body is unavailable');
  }

  private async findMessageByIdOrGmailId(
    organizationId: string,
    messageId: string,
  ): Promise<CommMessageDocument | null> {
    const query = Types.ObjectId.isValid(messageId)
      ? {
          organizationId,
          $or: [{ _id: new Types.ObjectId(messageId) }, { gmailMessageId: messageId }],
        }
      : { organizationId, gmailMessageId: messageId };

    return this.messageModel.findOne(query).exec();
  }

  private async resolveUserIdentityIds(organizationId: string, userId: string): Promise<string[]> {
    const identities = await this.identityModel
      .find({ organizationId, userId, isActive: true })
      .select('_id')
      .lean()
      .exec();

    return identities.map((identity) => String(identity._id));
  }

  private isPrivileged(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.ADMIN;
  }
}
