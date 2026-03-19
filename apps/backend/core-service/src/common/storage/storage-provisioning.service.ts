import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import axios from 'axios';
import { PrismaService } from '@sentra-core/prisma-client';

@Injectable()
export class StorageProvisioningService {
  private readonly logger = new Logger(StorageProvisioningService.name);
  private readonly s3: S3Client;
  private readonly bunnyCdnApiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.s3 = new S3Client({
      endpoint: this.config.getOrThrow<string>('WASABI_ENDPOINT'),
      region: this.config.get<string>('WASABI_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('WASABI_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('WASABI_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
    this.bunnyCdnApiKey = this.config.getOrThrow<string>('BUNNYCDN_API_KEY');
  }

  async provisionForOrg(orgId: string): Promise<void> {
    const bucketName = await this.createOrgBucket(orgId);
    const { id: cdnPullZoneId, hostname: cdnHostname } = await this.createOrgPullZone(
      orgId,
      bucketName,
    );

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { storageBucket: bucketName, cdnPullZoneId, cdnHostname },
    });
  }

  async createOrgBucket(orgId: string): Promise<string> {
    const bucketName = `sentra-org-${orgId}`;

    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Bucket ${bucketName} already exists, skipping create`);
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Created Wasabi bucket: ${bucketName}`);
    }

    await this.s3.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE'],
              AllowedOrigins: [
                'https://sales.sentracore.com',
                'https://pm.sentracore.com',
                'https://hrms.sentracore.com',
                ...(this.config.get('NODE_ENV') === 'development'
                  ? [
                      'http://localhost:3000',
                      'http://localhost:3001',
                      'http://localhost:3002',
                      'http://localhost:3003',
                      'http://localhost:3004',
                      'http://localhost:3005',
                    ]
                  : []),
              ],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );

    return bucketName;
  }

  async createOrgPullZone(
    orgId: string,
    bucketName: string,
  ): Promise<{ id: number; hostname: string }> {
    const shortId = orgId.replace(/-/g, '').substring(0, 12);
    const zoneName = `sentra-${shortId}`;
    const wasabiEndpoint = this.config.getOrThrow<string>('WASABI_ENDPOINT');
    const endpointHost = wasabiEndpoint.replace(/^https?:\/\//, '');
    const originUrl = `https://${endpointHost}/${bucketName}`;

    try {
      const response = await axios.post(
        'https://api.bunny.net/pullzone',
        {
          Name: zoneName,
          OriginUrl: originUrl,
          Type: 0,
          CacheControlMaxAgeOverride: 31536000,
          CacheControlPublicMaxAgeOverride: 31536000,
        },
        {
          headers: {
            AccessKey: this.bunnyCdnApiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const zone = response.data as {
        Id: number;
        Hostnames: Array<{ Value: string }>;
      };

      const hostname =
        zone.Hostnames.find((host) => host.Value.includes('b-cdn.net'))?.Value ??
        `${zoneName}.b-cdn.net`;

      this.logger.log(`Created BunnyCDN pull zone: ${zoneName} -> ${hostname}`);
      return { id: zone.Id, hostname };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        this.logger.warn(`BunnyCDN zone ${zoneName} may already exist, returning fallback hostname`);
        return { id: 0, hostname: `${zoneName}.b-cdn.net` };
      }
      throw err;
    }
  }
}
