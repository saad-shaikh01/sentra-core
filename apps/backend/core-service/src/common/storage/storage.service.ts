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
  private readonly wasabiEndpoint: string;
  private readonly bunnyBaseUrl?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    const endpoint = this.config.getOrThrow<string>('WASABI_ENDPOINT');
    const region = this.config.get<string>('WASABI_REGION', 'us-east-1');
    this.bucket = this.config.getOrThrow<string>('WASABI_BUCKET');
    this.wasabiEndpoint = endpoint.replace(/\/+$/, '');
    this.bunnyBaseUrl = this.normalizeBaseUrl(
      this.config.get<string>('BUNNY_CDN_BASE_URL') || this.config.get<string>('BUNNY_CDN_HOSTNAME'),
    );

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

  private normalizeBaseUrl(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol.replace(/\/+$/, '');
  }

  private normalizeKey(key: string): string {
    return key.replace(/^\/+/, '');
  }

  private resolvePublicBaseUrl(bucket: string, cdnHostname?: string | null): string {
    const orgCdnBaseUrl = this.normalizeBaseUrl(cdnHostname);
    if (orgCdnBaseUrl) {
      return orgCdnBaseUrl;
    }

    if (bucket === this.bucket && this.bunnyBaseUrl) {
      return this.bunnyBaseUrl;
    }

    return `${this.wasabiEndpoint}/${bucket}`;
  }

  private async getOrgStorageConfig(
    orgId: string,
  ): Promise<{ bucket: string; cdnHostname?: string | null }> {
    const cacheKey = `org-storage:${orgId}`;
    const cached = await this.cache.get<{ bucket: string; cdnHostname?: string | null }>(cacheKey);
    if (cached) {
      return cached;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { storageBucket: true, cdnHostname: true },
    });

    if (!org?.storageBucket) {
      return { bucket: this.bucket };
    }

    const result = { bucket: org.storageBucket, cdnHostname: org.cdnHostname };

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
    const { bucket } = orgId
      ? await this.getOrgStorageConfig(orgId)
      : { bucket: this.bucket };

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

    // Return the file key only (e.g. brands/id/logos/uuid.png)
    return key;
  }

  buildUrl(
    key: string | null | undefined,
    orgStorageBucket?: string | null,
    orgCdnHostname?: string | null,
  ): string | undefined {
    if (!key) return undefined;
    // If key is already a full URL (legacy data), return as-is
    if (key.startsWith('http')) return key;
    const bucket = orgStorageBucket ?? this.bucket;
    const normalizedKey = this.normalizeKey(key);
    return `${this.resolvePublicBaseUrl(bucket, orgCdnHostname)}/${normalizedKey}`;
  }

  async getUrl(key: string | null | undefined, orgId?: string): Promise<string | undefined> {
    if (!key) return undefined;
    if (key.startsWith('http')) return key;
    if (!orgId) {
      return this.buildUrl(key);
    }

    const { bucket, cdnHostname } = await this.getOrgStorageConfig(orgId);
    return this.buildUrl(key, bucket, cdnHostname);
  }

  async delete(fileKeyOrUrl: string, orgId?: string): Promise<void> {
    try {
      const { bucket } = orgId
        ? await this.getOrgStorageConfig(orgId)
        : { bucket: this.bucket };

      let key: string;
      if (!fileKeyOrUrl.startsWith('http')) {
        // Already a key
        key = this.normalizeKey(fileKeyOrUrl);
      } else {
        // Legacy URL — extract key from pathname
        const pathname = new URL(fileKeyOrUrl).pathname.replace(/^\/+/, '');
        key = pathname.startsWith(`${bucket}/`) ? pathname.slice(bucket.length + 1) : pathname;
        key = this.normalizeKey(key);
      }

      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Wasabi delete failed: ${(err as Error).message}`);
    }
  }
}
