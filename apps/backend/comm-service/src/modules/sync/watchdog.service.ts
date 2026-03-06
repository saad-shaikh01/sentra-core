/**
 * WatchdogService — Token Refresh Watchdog (COMM-BE-016)
 *
 * Runs every 30 minutes. For each active identity:
 *   - Attempts proactive token refresh via Google OAuth2
 *   - On invalid_grant / revoked token:
 *       • Sets syncState.status = 'error' on the identity document
 *       • Emits identity:error WS event to the org
 *       • Writes audit log entry
 *
 * Token refresh is also triggered on every sync job start and outbound send
 * (handled transparently by googleapis OAuth2Client 'tokens' event in GmailApiService).
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { CommGateway } from '../gateway/comm.gateway';
import { AuditService } from '../audit/audit.service';
import { CommAuditAction } from '../../schemas/comm-audit-log.schema';

const WATCHDOG_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Error substrings that indicate a token is permanently revoked / invalid */
const REVOCATION_INDICATORS = [
  'invalid_grant',
  'Token has been expired or revoked',
  'token_revoked',
  'unauthorized_client',
];

function isRevocationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return REVOCATION_INDICATORS.some((indicator) =>
    msg.toLowerCase().includes(indicator.toLowerCase()),
  );
}

@Injectable()
export class WatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WatchdogService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
    @Optional() private readonly gateway?: CommGateway,
    @Optional() private readonly audit?: AuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.run(), WATCHDOG_INTERVAL_MS);
    // Run once shortly after startup
    setTimeout(() => this.run(), 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    let identities: CommIdentityDocument[];
    try {
      identities = await this.identityModel.find({ isActive: true }).exec();
    } catch (err) {
      this.logger.error(`Watchdog: failed to load identities: ${err}`);
      return;
    }

    this.logger.debug(`Watchdog: scanning ${identities.length} active identities`);

    for (const identity of identities) {
      await this.checkIdentity(identity);
    }
  }

  private async checkIdentity(identity: CommIdentityDocument): Promise<void> {
    try {
      const accessToken = this.encryption.decrypt(
        identity.encryptedAccessToken,
        identity.organizationId,
      );
      const refreshToken = this.encryption.decrypt(
        identity.encryptedRefreshToken,
        identity.organizationId,
      );

      const oauth2Client = new google.auth.OAuth2(
        this.config.get<string>('GMAIL_CLIENT_ID'),
        this.config.get<string>('GMAIL_CLIENT_SECRET'),
        this.config.get<string>('GMAIL_REDIRECT_URI'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: identity.tokenExpiresAt?.getTime(),
      });

      // Persist refreshed token if Google returns a new one
      oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
          const encryptedAccessToken = this.encryption.encrypt(
            tokens.access_token,
            identity.organizationId,
          );
          await this.identityModel.findByIdAndUpdate(identity._id, {
            $set: {
              encryptedAccessToken,
              tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            },
          });
        }
      });

      // Force a token refresh — will throw if revoked
      const { token } = await oauth2Client.getAccessToken();
      if (!token) {
        throw new Error('getAccessToken returned null — token may be revoked');
      }

      this.logger.debug(`Watchdog: token OK for identity ${identity._id}`);
    } catch (err) {
      if (isRevocationError(err)) {
        await this.handleRevocation(identity, err as Error);
      } else {
        // Transient error (network, quota) — log and continue
        this.logger.warn(`Watchdog: transient error for identity ${identity._id}: ${err}`);
      }
    }
  }

  private async handleRevocation(
    identity: CommIdentityDocument,
    err: Error,
  ): Promise<void> {
    this.logger.error(
      `Watchdog: token revoked/invalid for identity ${identity._id} (${identity.email}): ${err.message}`,
    );

    // Mark identity as error state
    await this.identityModel.findByIdAndUpdate(identity._id, {
      $set: {
        'syncState.status': 'error',
        'syncState.lastError': err.message,
      },
    });

    // Emit WS event so the frontend can prompt re-authentication
    this.gateway?.emitToOrg(identity.organizationId, 'identity:error', {
      identityId: String(identity._id),
      email: identity.email,
      errorMessage: 'Gmail authentication token has been revoked. Please reconnect this account.',
    });

    // Audit log
    await this.audit?.log({
      organizationId: identity.organizationId,
      actorUserId: 'system',
      action: 'IDENTITY_TOKEN_REFRESHED' satisfies CommAuditAction,
      entityType: 'identity',
      entityId: String(identity._id),
      metadata: {
        error: err.message,
        revoked: true,
        email: identity.email,
      },
    });
  }
}
