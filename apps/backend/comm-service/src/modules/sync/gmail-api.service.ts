/**
 * GmailApiService
 *
 * Thin wrapper around googleapis Gmail client.
 * Handles transparent token refresh and updates encrypted tokens in the DB.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { IdentitiesService } from '../identities/identities.service';
import { TokenEncryptionService } from '../../common/crypto/token-encryption.service';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class GmailApiService {
  private readonly logger = new Logger(GmailApiService.name);

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly identitiesService: IdentitiesService,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async getAuthenticatedClient(identity: CommIdentityDocument): Promise<OAuth2Client> {
    const oauth2Client = new google.auth.OAuth2(
      this.config.get<string>('GMAIL_CLIENT_ID'),
      this.config.get<string>('GMAIL_CLIENT_SECRET'),
      this.config.get<string>('GMAIL_REDIRECT_URI'),
    );

    const { accessToken, refreshToken, tokenExpiresAt } =
      await this.identitiesService.getDecryptedCredentials(identity);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: tokenExpiresAt?.getTime(),
    });

    // Listen for token refresh events and persist updated tokens
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        try {
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
          this.metrics.incrementTokenRefresh(String(identity._id), 'success');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to persist refreshed token for identity ${identity._id}: ${errorMessage}`,
          );
          this.metrics.incrementTokenRefresh(String(identity._id), 'error');
          try {
            await this.identitiesService.markDegraded(String(identity._id), errorMessage);
          } catch (markDegradedError) {
            this.logger.error(
              `Failed to mark identity ${identity._id} degraded after token refresh error: ${
                markDegradedError instanceof Error
                  ? markDegradedError.message
                  : String(markDegradedError)
              }`,
            );
          }
        }
      }
    });

    return oauth2Client;
  }

  async getGmailClient(identity: CommIdentityDocument): Promise<gmail_v1.Gmail> {
    const auth = await this.getAuthenticatedClient(identity);
    return google.gmail({ version: 'v1', auth });
  }

  /**
   * Fetch messages list from Gmail.
   * Returns message IDs + thread IDs.
   */
  async listMessages(
    gmail: gmail_v1.Gmail,
    options: {
      after?: Date;
      pageToken?: string;
      maxResults?: number;
    },
  ): Promise<{ messages: gmail_v1.Schema$Message[]; nextPageToken?: string }> {
    const q = options.after
      ? `after:${Math.floor(options.after.getTime() / 1000)}`
      : undefined;

    const resp = await gmail.users.messages.list({
      userId: 'me',
      q,
      pageToken: options.pageToken,
      maxResults: options.maxResults ?? 100,
    });

    return {
      messages: resp.data.messages ?? [],
      nextPageToken: resp.data.nextPageToken ?? undefined,
    };
  }

  /**
   * Fetch full message by ID.
   */
  async getMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<gmail_v1.Schema$Message> {
    const resp = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return resp.data;
  }

  /**
   * Fetch Gmail history since a historyId.
   */
  async listHistory(
    gmail: gmail_v1.Gmail,
    startHistoryId: string,
    pageToken?: string,
  ): Promise<{ history: gmail_v1.Schema$History[]; nextPageToken?: string; historyId?: string }> {
    const resp = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      pageToken,
      historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
    });

    return {
      history: resp.data.history ?? [],
      nextPageToken: resp.data.nextPageToken ?? undefined,
      historyId: resp.data.historyId ?? undefined,
    };
  }

  /**
   * Get current history ID (for establishing sync baseline).
   */
  async getCurrentHistoryId(gmail: gmail_v1.Gmail): Promise<string> {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.historyId!;
  }

  /**
   * Register or renew a Gmail push watch for an identity.
   * Must be renewed before ~7 days (Google max) — we renew every 6 days.
   */
  async registerGmailWatch(identity: CommIdentityDocument): Promise<{ expiration: string; historyId: string }> {
    const topicName = this.config.get<string>('GOOGLE_PUBSUB_TOPIC');
    if (!topicName) {
      this.logger.warn('GOOGLE_PUBSUB_TOPIC not set — skipping Gmail watch registration');
      return { expiration: '', historyId: '' };
    }

    const gmail = await this.getGmailClient(identity);
    const resp = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName,
        labelIds: ['INBOX'],
      },
    });

    this.logger.log(
      `Gmail watch registered for identity ${identity._id}: expires ${resp.data.expiration}`,
    );

    return {
      expiration: resp.data.expiration ?? '',
      historyId: resp.data.historyId ?? '',
    };
  }

  /**
   * Download attachment data from Gmail.
   */
  async getAttachment(
    gmail: gmail_v1.Gmail,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer> {
    const resp = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    const data = resp.data.data ?? '';
    return Buffer.from(data, 'base64url');
  }
}
