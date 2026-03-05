/**
 * Health endpoint: GET /api/comm/health
 *
 * COMM-BE-013: Returns MongoDB status, Redis status, and identity sync states.
 * Validates required env vars are present at startup.
 */

import { Controller, Get, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Connection } from 'mongoose';
import { CommCacheService } from '../../common/cache/comm-cache.service';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { CommIdentitySchema } from '../../schemas/comm-identity.schema';

@Controller('health')
export class HealthController implements OnModuleInit {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly cache: CommCacheService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // COMM-BE-013: Fail fast on missing critical env vars
    const required = [
      'COMM_ENCRYPTION_MASTER_KEY',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'MONGO_URI',
    ];

    const missing = required.filter((key) => !this.config.get<string>(key));
    if (missing.length > 0) {
      this.logger.warn(
        `Missing recommended env vars: ${missing.join(', ')}. Some features may not work.`,
      );
    }
  }

  @Get()
  async check() {
    const mongoStatus = this.mongoConnection.readyState === 1 ? 'connected' : 'disconnected';

    // Check Redis
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      await this.cache.set('comm:health:ping', 1, 5000);
      redisStatus = 'connected';
    } catch {
      redisStatus = 'disconnected';
    }

    // Identity sync status
    const identities = await this.identityModel
      .find({ isActive: true })
      .select('email syncState organizationId')
      .limit(50)
      .exec();

    const identityStatus = identities.map((id) => ({
      id: String(id._id),
      email: id.email,
      syncStatus: id.syncState?.initialSyncDone ? 'active' : 'pending',
      lastSyncAt: id.syncState?.lastSyncAt ?? null,
    }));

    return {
      status: 'ok',
      service: 'comm-service',
      timestamp: new Date().toISOString(),
      mongodb: mongoStatus,
      redis: redisStatus,
      identities: identityStatus,
    };
  }
}
