/**
 * WatchRenewalService
 *
 * Periodically renews Gmail push watches for all active identities.
 * Gmail watch max expiry is ~7 days; we renew every 6 days.
 *
 * Also registers watch immediately after identity OAuth connect
 * (called from SyncService.triggerInitialSync).
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { GmailApiService } from './gmail-api.service';

const RENEWAL_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

@Injectable()
export class WatchRenewalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WatchRenewalService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly gmailApi: GmailApiService,
  ) {}

  onModuleInit(): void {
    // Renew watches every 6 days
    this.timer = setInterval(() => this.renewAllWatches(), RENEWAL_INTERVAL_MS);
    // Run once after a short startup delay (non-blocking)
    setTimeout(() => this.renewAllWatches(), 10_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Register a Gmail watch for a newly connected identity.
   * Called right after OAuth callback and initial sync trigger.
   */
  async registerWatchForIdentity(identity: CommIdentityDocument): Promise<void> {
    try {
      await this.gmailApi.registerGmailWatch(identity);
    } catch (err) {
      // Non-fatal — polling fallback remains active
      this.logger.warn(`Failed to register Gmail watch for identity ${identity._id}: ${err}`);
    }
  }

  /**
   * Renew watches for all active identities.
   * Idempotent — calling watch() again resets the expiry.
   */
  private async renewAllWatches(): Promise<void> {
    const topic = process.env.GOOGLE_PUBSUB_TOPIC;
    if (!topic) {
      // Pub/Sub not configured — skip silently
      return;
    }

    let identities: CommIdentityDocument[];
    try {
      identities = await this.identityModel.find({ isActive: true }).exec();
    } catch (err) {
      this.logger.error(`WatchRenewal: failed to load identities: ${err}`);
      return;
    }

    this.logger.log(`WatchRenewal: renewing watches for ${identities.length} active identities`);

    for (const identity of identities) {
      try {
        await this.gmailApi.registerGmailWatch(identity);
      } catch (err) {
        this.logger.warn(`WatchRenewal: failed to renew watch for identity ${identity._id}: ${err}`);
      }
    }
  }
}
