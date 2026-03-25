import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '@sentra-core/prisma-client';
import { CacheService } from '../cache';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    const endpoint = this.config.getOrThrow<string>('WASABI_ENDPOINT');
    const region = this.config.get<string>('WASABI_REGION', 'us-east-1');
    this.bucket = this.config.getOrThrow<string>('WASABI_BUCKET');
    const rawCdnHost = this.config.getOrThrow<string>('BUNNY_CDN_HOSTNAME').trim().replace(/\/+$/, '');
    this.cdnBaseUrl = /^https?:\/\//i.test(rawCdnHost) ? rawCdnHost : `https://${rawCdnHost}`;

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

  private async getOrgBucket(orgId: string): Promise<{ bucket: string; cdnBase: string }> {
    const cacheKey = `org-storage:${orgId}`;
    const cached = await this.cache.get<{ bucket: string; cdnBase: string }>(cacheKey);
    if (cached) {
      return cached;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { storageBucket: true, cdnHostname: true },
    });

    if (!org?.storageBucket || !org.cdnHostname) {
      return { bucket: this.bucket, cdnBase: this.cdnBaseUrl };
    }

    const result = {
      bucket: org.storageBucket,
      cdnBase: org.cdnHostname.startsWith('http')
        ? org.cdnHostname
        : `https://${org.cdnHostname}`,
    };

    await this.cache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: string,
    orgId?: string,
  ): Promise<string> {
    const ext = extname(originalName).toLowerCase();
    const key = `${folder}/${randomUUID()}${ext}`;
    const { bucket, cdnBase } = orgId
      ? await this.getOrgBucket(orgId)
      : { bucket: this.bucket, cdnBase: this.cdnBaseUrl };

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      this.logger.error(`Wasabi upload failed: ${(err as Error).message}`);
      throw new BadRequestException('File upload failed');
    }

    // Return Bunny CDN URL
    return `${cdnBase}/${key}`;
  }

  async delete(cdnUrl: string, orgId?: string): Promise<void> {
    try {
      const { bucket, cdnBase } = orgId
        ? await this.getOrgBucket(orgId)
        : { bucket: this.bucket, cdnBase: this.cdnBaseUrl };
      // Extract S3 key from CDN URL
      const prefix = `${cdnBase}/`;
      const key = cdnUrl.startsWith(prefix)
        ? cdnUrl.slice(prefix.length)
        : new URL(cdnUrl).pathname.replace(/^\/+/, '');
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(`Wasabi delete failed: ${(err as Error).message}`);
    }
  }
}
