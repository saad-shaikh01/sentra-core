/**
 * PubsubController
 *
 * Handles Google Pub/Sub push webhook for Gmail push notifications.
 *
 * POST /api/comm/sync/webhook
 *
 * Auth: Google-signed JWT in Authorization: Bearer <token> header.
 *       Verified using google-auth-library OAuth2Client.verifyIdToken().
 *       Audience must match COMM_PUBSUB_AUDIENCE env var.
 *
 * On valid message: enqueue incremental sync for the matching identity.
 * Always returns 204 for valid auth (including unmatched emails) to prevent retries.
 * Returns 401 for invalid JWT.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { SyncService } from './sync.service';

@Controller('sync')
export class PubsubController {
  private readonly logger = new Logger(PubsubController.name);

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly syncService: SyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Google Pub/Sub push endpoint.
   * Google sends a signed JWT in Authorization: Bearer <token>.
   * Payload: { message: { data: base64(JSON), messageId, publishTime }, subscription }
   */
  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handlePubSubPush(
    @Headers('authorization') authHeader: string,
    @Body() body: Record<string, any>,
  ): Promise<void> {
    // Extract and verify the Google-signed JWT
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const audience = this.config.get<string>('COMM_PUBSUB_AUDIENCE');
    if (!audience) {
      this.logger.warn('COMM_PUBSUB_AUDIENCE not configured — rejecting Pub/Sub push');
      throw new UnauthorizedException('Pub/Sub audience not configured');
    }

    try {
      const client = new OAuth2Client();
      await client.verifyIdToken({ idToken: token, audience });
    } catch (err) {
      this.logger.warn(`Pub/Sub JWT verification failed: ${err}`);
      throw new UnauthorizedException('Invalid Pub/Sub JWT');
    }

    // Decode the Pub/Sub message payload
    const message = body?.message;
    if (!message?.data) {
      // Valid auth but no actionable payload — return 204 to prevent retries
      this.logger.debug('Pub/Sub message has no data field — ignoring');
      return;
    }

    let payload: { emailAddress?: string; historyId?: string };
    try {
      const raw = Buffer.from(message.data as string, 'base64').toString('utf8');
      payload = JSON.parse(raw) as { emailAddress?: string; historyId?: string };
    } catch {
      this.logger.warn('Failed to decode Pub/Sub message data — ignoring');
      return;
    }

    const { emailAddress, historyId } = payload;
    if (!emailAddress) {
      this.logger.debug('Pub/Sub payload missing emailAddress — ignoring');
      return;
    }

    // Find the identity matching this email address
    const identity = await this.identityModel.findOne({
      email: emailAddress,
      isActive: true,
    });

    if (!identity) {
      // Valid push but no matching identity — return 204 to prevent retries
      this.logger.debug(`No active identity for email ${emailAddress} — ignoring push`);
      return;
    }

    this.logger.log(
      `Pub/Sub push for ${emailAddress} (historyId=${historyId}) — enqueuing incremental sync`,
    );

    await this.syncService.triggerIncrementalSyncForIdentity(
      String(identity._id),
      identity.organizationId,
    );
  }
}
