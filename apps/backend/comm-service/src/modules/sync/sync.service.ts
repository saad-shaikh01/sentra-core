/**
 * SyncService
 *
 * Orchestrates Gmail sync for all active identities.
 *
 * Sync phases:
 *   Phase A: 90-day fast import, triggered after OAuth callback
 *   Phase B: Full backfill (rate-limited, 10 calls/min)
 *   Incremental: Repeatable job every 5min using history.list
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommSyncJob, CommSyncJobDocument } from '../../schemas/comm-sync-job.schema';
import { GmailApiService } from './gmail-api.service';
import { gmail_v1 } from 'googleapis';
import { CommGateway } from '../gateway/comm.gateway';
import { WatchRenewalService } from './watch-renewal.service';
import { COMM_ATTACHMENT_QUEUE, COMM_SYNC_QUEUE } from './sync.constants';
import { EntityLinksService } from '../entity-links/entity-links.service';
import sanitizeHtml from 'sanitize-html';

type RateLimitedError = Error & {
  retryAfterSeconds?: number;
};

type SyncJobData = {
  identityId: string;
  requestId?: string;
};

type InitialSyncJobData = SyncJobData & {
  days: number;
};

type ProcessMessageJobData = SyncJobData & {
  messageId: string;
};

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private incrementalTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommSyncJob.name)
    private readonly syncJobModel: Model<CommSyncJobDocument>,
    @InjectQueue(COMM_SYNC_QUEUE)
    private readonly syncQueue: Queue,
    @InjectQueue(COMM_ATTACHMENT_QUEUE)
    private readonly attachmentQueue: Queue,
    private readonly gmailApi: GmailApiService,
    @Optional() private readonly gateway?: CommGateway,
    @Optional() private readonly watchRenewal?: WatchRenewalService,
    private readonly entityLinksService?: EntityLinksService,
  ) {}

  onModuleInit() {
    // Start incremental polling every 5 minutes
    this.incrementalTimer = setInterval(() => this.triggerIncrementalSync(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.incrementalTimer) {
      clearInterval(this.incrementalTimer);
    }
  }

  /**
   * Trigger initial 90-day sync after OAuth callback.
   * Enqueues a job immediately.
   */
  async triggerInitialSync(identityId: string, requestId?: string): Promise<void> {
    const bullJob = await this.syncQueue.add(
      'initial-sync',
      { identityId, days: 90, requestId } satisfies InitialSyncJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    // Persist sync job record and register Gmail watch
    const identity = await this.identityModel.findById(identityId).exec();
    if (identity) {
      await this.syncJobModel.create({
        organizationId: identity.organizationId,
        identityId,
        jobType: 'full_sync',
        status: 'pending',
        bullJobId: String(bullJob.id),
      });

      // Register Gmail push watch for this identity (non-blocking, failures tolerated)
      if (this.watchRenewal) {
        void this.watchRenewal.registerWatchForIdentity(identity);
      }
    }

    this.logger.log(`Enqueued initial sync for identity ${identityId}`);
  }

  /**
   * Trigger incremental sync for a specific identity (controller-invoked).
   */
  async triggerIncrementalSyncForIdentity(
    identityId: string,
    organizationId: string,
    requestId?: string,
  ): Promise<void> {
    await this.syncQueue.add(
      'incremental-sync',
      { identityId, requestId } satisfies SyncJobData,
      { attempts: 2, backoff: { type: 'fixed', delay: 10000 } },
    );
    this.logger.log(`Manual incremental sync triggered for identity ${identityId}`);
  }

  /**
   * Record a sync job failure in the DLQ.
   */
  async recordDlqFailure(identityId: string, organizationId: string, jobType: string, error: Error): Promise<void> {
    await this.syncJobModel.findOneAndUpdate(
      { identityId, jobType, status: { $in: ['pending', 'running', 'failed'] } },
      {
        $set: {
          status: 'dlq',
          errorDetails: {
            message: error.message,
            stack: error.stack?.slice(0, 500),
            attemptsMade: 3,
          },
          completedAt: new Date(),
        },
      },
      { sort: { createdAt: -1 } },
    );
    this.logger.error(`Job moved to DLQ for identity ${identityId}: ${error.message}`);
  }

  /**
   * Trigger incremental sync for all identities that have completed initial sync.
   */
  async triggerIncrementalSync(): Promise<void> {
    const identities = await this.identityModel
      .find({ isActive: true, 'syncState.initialSyncDone': true })
      .exec();

    for (const identity of identities) {
      await this.syncQueue.add(
        'incremental-sync',
        { identityId: String(identity._id), requestId: undefined } satisfies SyncJobData,
        {
          attempts: 2,
          backoff: { type: 'fixed', delay: 10000 },
          jobId: `incremental:${identity._id}:${Date.now()}`,
        },
      );
    }

    if (identities.length > 0) {
      this.logger.debug(`Enqueued incremental sync for ${identities.length} identities`);
    }
  }

  /**
   * Perform 90-day fast import for an identity.
   * Called by the sync processor.
   */
  async performInitialSync(identity: CommIdentityDocument, requestId?: string): Promise<number> {
    const gmail = await this.gmailApi.getGmailClient(identity);

    const after = new Date();
    after.setDate(after.getDate() - 90);

    // Get baseline historyId before import
    const historyId = await this.executeGmailCall(
      String(identity._id),
      () => this.gmailApi.getCurrentHistoryId(gmail),
    );

    let pageToken: string | undefined;
    let processed = 0;

    // Count total messages first for progress reporting
    let totalEstimate = 0;

    do {
      const { messages, nextPageToken } = await this.executeGmailCall(
        String(identity._id),
        () =>
          this.gmailApi.listMessages(gmail, {
            after,
            pageToken,
            maxResults: 100,
          }),
      );

      totalEstimate += messages.length;

      for (const msg of messages) {
        if (msg.id) {
          await this.syncQueue.add(
            'process-message',
            {
              identityId: String(identity._id),
              messageId: msg.id,
              requestId,
            } satisfies ProcessMessageJobData,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          );
          processed++;

          // Emit progress every 50 messages
          if (processed % 50 === 0) {
            this.gateway?.emitToOrg(identity.organizationId, 'sync:progress', {
              identityId: String(identity._id),
              synced: processed,
              processed,
              total: totalEstimate,
            });
          }
        }
      }

      pageToken = nextPageToken;
    } while (pageToken);

    // Update sync state
    await this.identityModel.findByIdAndUpdate(identity._id, {
      $set: {
        'syncState.historyId': historyId,
        'syncState.lastSyncAt': new Date(),
        'syncState.initialSyncDone': true,
      },
    });

    this.logger.log(`Initial sync queued ${processed} messages for identity ${identity._id}`);
    return processed;
  }

  /**
   * Perform incremental sync using Gmail history API.
   * Called by the sync processor.
   */
  async performIncrementalSync(identity: CommIdentityDocument, requestId?: string): Promise<number> {
    const historyId = identity.syncState?.historyId;
    if (!historyId) {
      this.logger.warn(`No historyId for identity ${identity._id}, skipping incremental sync`);
      return 0;
    }

    const gmail = await this.gmailApi.getGmailClient(identity);
    let pageToken: string | undefined;
    let newHistoryId = historyId;
    let processed = 0;

    do {
      const { history, nextPageToken, historyId: latestId } = await this.executeGmailCall(
        String(identity._id),
        () =>
          this.gmailApi.listHistory(
            gmail,
            historyId,
            pageToken,
          ),
      );

      if (latestId) newHistoryId = latestId;

      for (const item of history) {
        for (const msg of item.messagesAdded ?? []) {
          if (msg.message?.id) {
            await this.syncQueue.add(
            'process-message',
              {
                identityId: String(identity._id),
                messageId: msg.message.id,
                requestId,
              } satisfies ProcessMessageJobData,
              { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
            );
            processed++;
          }
        }
      }

      pageToken = nextPageToken;
    } while (pageToken);

    await this.identityModel.findByIdAndUpdate(identity._id, {
      $set: {
        'syncState.historyId': newHistoryId,
        'syncState.lastSyncAt': new Date(),
      },
    });

    return processed;
  }

  /**
   * Fetch and persist a single Gmail message.
   * Called by the sync processor.
   */
  async processMessage(identity: CommIdentityDocument, gmailMessageId: string): Promise<void> {
    const gmail = await this.gmailApi.getGmailClient(identity);

    // Skip if already processed
    const existing = await this.messageModel.findOne({
      organizationId: identity.organizationId,
      gmailMessageId,
    });
    if (existing) return;

    const raw = await this.executeGmailCall(
      String(identity._id),
      () => this.gmailApi.getMessage(gmail, gmailMessageId),
    );
    const parsed = this.parseGmailMessage(raw, identity);

    const isNew = !(await this.messageModel.exists({ organizationId: identity.organizationId, gmailMessageId }));

    await this.messageModel.findOneAndUpdate(
      { organizationId: identity.organizationId, gmailMessageId },
      { $setOnInsert: parsed },
      { upsert: true },
    );

    // Upsert thread
    const thread = await this.upsertThread(identity, raw, parsed);
    if (parsed.gmailThreadId) {
      await this.entityLinksService?.autoLinkThreads(identity.organizationId, [parsed.gmailThreadId]);
    }

    // Emit realtime event for newly inbound messages
    if (isNew && !parsed.isSentByIdentity) {
      this.gateway?.emitToOrg(identity.organizationId, 'message:new', {
        threadId: String(thread._id),
        gmailThreadId: parsed.gmailThreadId,
        direction: 'inbound',
        message: {
          id: gmailMessageId,
          gmailMessageId,
          gmailThreadId: parsed.gmailThreadId,
          from: parsed.from,
          subject: parsed.subject,
          snippet: parsed.bodyText?.slice(0, 200) ?? '',
          sentAt: parsed.sentAt,
          identityId: parsed.identityId,
        },
      });
    }

    // Queue attachment archival if S3 is configured
    const s3Bucket = process.env.S3_BUCKET;
    if (s3Bucket && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        if (att.gmailAttachmentId) {
          await this.attachmentQueue.add('archive-attachment', {
            organizationId: identity.organizationId,
            identityId: String(identity._id),
            gmailMessageId,
            attachmentId: att.gmailAttachmentId,
            filename: att.filename,
          });
        }
      }
    }
  }

  private parseGmailMessage(
    raw: gmail_v1.Schema$Message,
    identity: CommIdentityDocument,
  ): Partial<CommMessage> {
    const headers = raw.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    const parseEmailList = (header: string) => {
      return header
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const match = s.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
          if (match) {
            return { name: match[1].trim() || undefined, email: match[2].trim() || s };
          }
          return { email: s };
        });
    };

    const from = parseEmailList(getHeader('from'))[0] ?? { email: '' };
    const to = parseEmailList(getHeader('to'));
    const cc = parseEmailList(getHeader('cc'));
    const bcc = parseEmailList(getHeader('bcc'));
    const subject = getHeader('subject') || undefined;
    const dateStr = getHeader('date');
    const sentAt = dateStr ? new Date(dateStr) : undefined;

    // Extract body
    let bodyText: string | undefined;
    let rawBodyHtml: string | undefined;
    const attachments: CommMessage['attachments'] = [];

    const extractParts = (parts: gmail_v1.Schema$MessagePart[] = []) => {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyText = Buffer.from(part.body.data, 'base64url').toString('utf8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          rawBodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf8');
        } else if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType ?? 'application/octet-stream',
            size: part.body.size ?? 0,
            gmailAttachmentId: part.body.attachmentId,
          });
        }
        if (part.parts) extractParts(part.parts);
      }
    };

    if (raw.payload?.parts) {
      extractParts(raw.payload.parts);
    } else if (raw.payload?.body?.data) {
      const mime = raw.payload.mimeType ?? 'text/plain';
      const text = Buffer.from(raw.payload.body.data, 'base64url').toString('utf8');
      if (mime === 'text/html') rawBodyHtml = text;
      else bodyText = text;
    }

    const bodyHtml = rawBodyHtml
      ? sanitizeHtml(rawBodyHtml, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ['src', 'alt', 'width', 'height'],
            a: ['href', 'target', 'rel'],
          },
          allowedSchemes: ['https', 'data'],
          allowedSchemesByTag: { img: ['https', 'data'] },
        }) || undefined
      : undefined;

    const labels = raw.labelIds ?? [];
    const isRead = !labels.includes('UNREAD');
    const isSentByIdentity = labels.includes('SENT');

    return {
      organizationId: identity.organizationId,
      gmailThreadId: raw.threadId!,
      gmailMessageId: raw.id!,
      identityId: String(identity._id),
      from,
      to,
      cc,
      bcc,
      subject,
      bodyText,
      bodyHtml,
      attachments,
      sentAt,
      isRead,
      isSentByIdentity,
      gmailLabels: labels,
    };
  }

  private async upsertThread(
    identity: CommIdentityDocument,
    raw: gmail_v1.Schema$Message,
    parsed: Partial<CommMessage>,
  ): Promise<CommThreadDocument> {
    const participants = [
      parsed.from,
      ...(parsed.to ?? []),
      ...(parsed.cc ?? []),
    ].filter((p): p is { email: string; name?: string } => Boolean(p?.email));

    return (await this.threadModel.findOneAndUpdate(
      { organizationId: identity.organizationId, gmailThreadId: raw.threadId! },
      {
        $setOnInsert: {
          organizationId: identity.organizationId,
          identityId: String(identity._id),
          gmailThreadId: raw.threadId!,
          subject: parsed.subject,
          entityLinks: [],
        },
        $addToSet: {
          participants: { $each: participants },
        },
        $inc: { messageCount: 1 },
        $max: { lastMessageAt: parsed.sentAt ?? new Date() },
        $set: {
          snippet: parsed.bodyText?.slice(0, 200) ?? parsed.bodyHtml?.replace(/<[^>]+>/g, '').slice(0, 200),
          hasUnread: !parsed.isRead,
          ...(parsed.isSentByIdentity ? { hasSent: true } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec())!;
  }

  private async executeGmailCall<T>(
    identityId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const rateLimitedError = this.toRateLimitedError(identityId, error);
      if (rateLimitedError) {
        throw rateLimitedError;
      }

      throw error;
    }
  }

  private toRateLimitedError(identityId: string, error: unknown): RateLimitedError | null {
    const status =
      typeof error === 'object' && error !== null
        ? (
            ('code' in error ? error.code : undefined) ??
            ('status' in error ? error.status : undefined) ??
            ('response' in error &&
            typeof error.response === 'object' &&
            error.response !== null &&
            'status' in error.response
              ? error.response.status
              : undefined)
          )
        : undefined;

    if (status !== 429) {
      return null;
    }

    const retryAfterHeader =
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'headers' in error.response &&
      typeof error.response.headers === 'object' &&
      error.response.headers !== null
        ? (error.response.headers as Record<string, unknown>)['retry-after']
        : undefined;

    const parsedRetryAfter =
      typeof retryAfterHeader === 'string'
        ? Number.parseInt(retryAfterHeader, 10)
        : Array.isArray(retryAfterHeader) && typeof retryAfterHeader[0] === 'string'
          ? Number.parseInt(retryAfterHeader[0], 10)
          : Number.NaN;

    const retryAfterSeconds =
      Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : 60;

    this.logger.warn(
      `Gmail rate limited for identity ${identityId}; retry after ${retryAfterSeconds}s`,
    );

    const rateLimitedError = new Error('GMAIL_RATE_LIMITED') as RateLimitedError;
    rateLimitedError.retryAfterSeconds = retryAfterSeconds;
    return rateLimitedError;
  }
}
