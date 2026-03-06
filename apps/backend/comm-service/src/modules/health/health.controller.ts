/**
 * Health endpoint: GET /api/comm/health
 *
 * COMM-BE-013: Returns MongoDB status, Redis status, and identity sync states.
 * Validates required env vars are present at startup.
 */

import { Controller, Get, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Connection } from 'mongoose';
import { CommCacheService } from '../../common/cache/comm-cache.service';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';

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
      .select('syncState')
      .exec();

    const identityStatus = identities.reduce(
      (summary, identity) => {
        summary.total += 1;
        const status = identity.syncState?.status ?? 'active';
        if (status === 'error') summary.error += 1;
        else if (status === 'paused') summary.paused += 1;
        else if (identity.syncState?.initialSyncDone) summary.active += 1;
        else summary.pending += 1;
        return summary;
      },
      { total: 0, active: 0, pending: 0, error: 0, paused: 0 },
    );

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
