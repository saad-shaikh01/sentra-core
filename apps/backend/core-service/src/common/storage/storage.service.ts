import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnHostname: string;

  constructor(private config: ConfigService) {
    const endpoint = this.config.getOrThrow<string>('WASABI_ENDPOINT');
    const region = this.config.get<string>('WASABI_REGION', 'us-east-1');
    this.bucket = this.config.getOrThrow<string>('WASABI_BUCKET');
    this.cdnHostname = this.config.getOrThrow<string>('BUNNY_CDN_HOSTNAME');

    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('WASABI_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('WASABI_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true, // required for Wasabi
    });
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: string,
  ): Promise<string> {
    const ext = extname(originalName).toLowerCase();
    const key = `${folder}/${randomUUID()}${ext}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ACL: 'public-read',
        }),
      );
    } catch (err) {
      this.logger.error(`Wasabi upload failed: ${(err as Error).message}`);
      throw new BadRequestException('File upload failed');
    }

    // Return Bunny CDN URL
    return `https://${this.cdnHostname}/${key}`;
  }

  async delete(cdnUrl: string): Promise<void> {
    try {
      // Extract S3 key from CDN URL
      const key = cdnUrl.replace(`https://${this.cdnHostname}/`, '');
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(`Wasabi delete failed: ${(err as Error).message}`);
    }
  }
}
