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
import {
  deriveThreadState,
  mergeAttachments,
  parseGmailMessage as parseCanonicalGmailMessage,
  ParsedGmailMessage,
} from './gmail-message.utils';
import { TrackingService } from '../tracking/tracking.service';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { CommSettingsService, ResolvedCommSettings, resolveCommSettings } from '../settings/comm-settings.service';

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

type SyncMessageOptions = {
  emitInboundEvent?: boolean;
  sentByUserId?: string;
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
    private readonly trackingService: TrackingService,
    private readonly intelligenceService: IntelligenceService,
    private readonly settingsService: CommSettingsService,
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
    await this.syncGmailMessage(identity, gmailMessageId);
  }

  async syncGmailMessage(
    identity: CommIdentityDocument,
    gmailMessageId: string,
    options: SyncMessageOptions = {},
  ): Promise<{
    isNew: boolean;
    message: CommMessageDocument;
    thread: CommThreadDocument;
    parsed: ParsedGmailMessage;
  }> {
    const gmail = await this.gmailApi.getGmailClient(identity);
    const existing = await this.messageModel.findOne({
      organizationId: identity.organizationId,
      gmailMessageId,
    }).exec();
    const raw = await this.executeGmailCall(
      String(identity._id),
      () => this.gmailApi.getMessage(gmail, gmailMessageId),
    );
    const parsed = this.parseGmailMessage(raw, identity);
    const mergedAttachments = mergeAttachments(existing?.attachments, parsed.attachments);
    const sentByUserId = existing?.sentByUserId ?? options.sentByUserId;
    const isNew = !existing;

    const {
      organizationId: parsedOrgId,
      gmailMessageId: parsedMsgId,
      gmailThreadId: parsedThreadId,
      identityId: parsedIdentityId,
      ...mutableFields
    } = parsed;

    const message = (await this.messageModel.findOneAndUpdate(
      { organizationId: identity.organizationId, gmailMessageId },
      {
        $set: {
          ...mutableFields,
          attachments: mergedAttachments,
          ...(sentByUserId ? { sentByUserId } : {}),
        },
        $setOnInsert: {
          organizationId: parsedOrgId,
          gmailMessageId: parsedMsgId,
          gmailThreadId: parsedThreadId,
          identityId: parsedIdentityId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ))!;

    await this.applyBounceDetection(identity.organizationId, message);
    let thread: CommThreadDocument;
    try {
      thread = await this.refreshThreadState(
        identity.organizationId,
        parsed.gmailThreadId,
        String(identity._id),
      );
    } catch (error) {
      this.logger.error(
        `refreshThreadState failed for ${gmailMessageId} (thread ${parsed.gmailThreadId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    if (isNew && !parsed.isSentByIdentity && !parsed.isBounceDetected && thread.replyState === 'replied') {
      try {
        await this.trackingService.recordReplyDetected(message, thread);
      } catch (error) {
        this.logger.warn(
          `Failed to record reply-detected event for ${gmailMessageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (parsed.gmailThreadId) {
      await this.entityLinksService?.autoLinkThreads(identity.organizationId, [parsed.gmailThreadId]);
    }

    if (options.emitInboundEvent !== false && isNew && !parsed.isSentByIdentity) {
      this.gateway?.emitToOrg(identity.organizationId, 'message:new', {
        threadId: String(thread._id),
        gmailThreadId: parsed.gmailThreadId,
        direction: 'inbound',
        message: {
          id: String(message._id),
          gmailMessageId,
          gmailThreadId: parsed.gmailThreadId,
          from: parsed.from,
          subject: parsed.subject,
          snippet: parsed.bodyText?.slice(0, 200) ?? parsed.subject ?? '',
          sentAt: parsed.sentAt,
          identityId: parsed.identityId,
        },
      });
    }

    const archiveBucket = process.env.WASABI_BUCKET ?? process.env.S3_BUCKET;
    if (archiveBucket && mergedAttachments.length > 0) {
      for (const attachment of mergedAttachments) {
        if (attachment.gmailAttachmentId) {
          await this.attachmentQueue.add('archive-attachment', {
            organizationId: identity.organizationId,
            identityId: String(identity._id),
            gmailMessageId,
            attachmentId: attachment.gmailAttachmentId,
            filename: attachment.filename,
          });
        }
      }
    }

    return { isNew, message, thread, parsed };
  }

  async refreshThreadState(
    organizationId: string,
    gmailThreadId: string,
    identityId: string,
  ): Promise<CommThreadDocument> {
    let settings: ResolvedCommSettings;
    try {
      settings = await this.settingsService.getResolvedSettings(organizationId);
    } catch (error) {
      this.logger.warn(
        `Failed to load comm settings for org ${organizationId}, falling back to defaults: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      settings = resolveCommSettings(null);
    }
    const runtimeSettings = this.settingsService.getRuntimeSettings(settings);
    const [existingThread, messages] = await Promise.all([
      this.threadModel.findOne({ organizationId, gmailThreadId }).exec(),
      this.messageModel
        .find({ organizationId, gmailThreadId })
        .sort({ sentAt: 1, _id: 1 })
        .lean()
        .exec(),
    ]);

    const derived = deriveThreadState(
      messages,
      existingThread ?? undefined,
      new Date(),
      {
        freshReplyWindowMs: runtimeSettings.freshReplyWindowMs,
        ghostedReplyWindowMs: runtimeSettings.ghostedReplyWindowMs,
      },
    );
    const thread = (await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId },
      {
        $setOnInsert: {
          organizationId,
          gmailThreadId,
          entityLinks: [],
        },
        $set: {
          identityId,
          participants: derived.participants,
          messageCount: derived.messageCount,
          lastMessageAt: derived.lastMessageAt,
          lastOutboundAt: derived.lastOutboundAt,
          lastInboundAt: derived.lastInboundAt,
          repliedAt: derived.repliedAt,
          replyState: derived.replyState,
          deliveryState: derived.deliveryState,
          bounceState: derived.bounceState,
          bounceDetectedAt: derived.bounceDetectedAt,
          bounceReason: derived.bounceReason,
          hasUnread: derived.hasUnread,
          hasSent: derived.hasSent,
          subject: derived.subject ?? existingThread?.subject,
          snippet: derived.snippet ?? existingThread?.snippet,
          gmailLabels: [...new Set(messages.flatMap((m) => m.gmailLabels ?? []))],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec())!;

    try {
      return (await this.intelligenceService.refreshThreadIntelligence(
        organizationId,
        gmailThreadId,
      )) ?? thread;
    } catch (error) {
      this.logger.warn(
        `Failed to refresh thread intelligence for ${gmailThreadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return thread;
    }
  }

  async recordThreadSendFailure(
    organizationId: string,
    gmailThreadId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId },
      {
        $set: {
          lastSendFailureAt: new Date(),
          lastSendFailureReason: errorMessage,
          deliveryState: 'send_failed',
        },
      },
    ).exec();

    try {
      await this.intelligenceService.refreshThreadIntelligence(organizationId, gmailThreadId);
    } catch (error) {
      this.logger.warn(
        `Failed to refresh send-failure intelligence for ${gmailThreadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private parseGmailMessage(
    raw: gmail_v1.Schema$Message,
    identity: CommIdentityDocument,
  ): ParsedGmailMessage {
    return parseCanonicalGmailMessage(raw, identity);
  }

  private async applyBounceDetection(
    organizationId: string,
    message: CommMessageDocument,
  ): Promise<void> {
    if (!message.isBounceDetected) {
      return;
    }

    const referenceIds = [
      message.inReplyToRfcMessageId,
      ...(message.referenceIds ?? []),
    ].filter((candidate): candidate is string => Boolean(candidate));

    if (referenceIds.length === 0) {
      return;
    }

    const outbound = await this.messageModel.findOne({
      organizationId,
      isSentByIdentity: true,
      rfcMessageId: { $in: referenceIds },
    }).exec();

    if (!outbound) {
      return;
    }

    await this.messageModel.findByIdAndUpdate(outbound._id, {
      $set: {
        deliveryState: 'bounce_detected',
        bounceDetectedAt: message.bounceDetectedAt ?? message.sentAt ?? new Date(),
        bounceReason: message.bounceReason ?? outbound.bounceReason ?? 'Bounce detected from mailbox sync',
      },
    }).exec();

    const thread = await this.refreshThreadState(organizationId, outbound.gmailThreadId, outbound.identityId);
    try {
      await this.trackingService.recordBounceDetected(outbound, thread, message);
    } catch (error) {
      this.logger.warn(
        `Failed to record bounce-detected event for ${outbound.gmailMessageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
    ]
      .filter((p): p is { email: string; name?: string } => Boolean(p?.email))
      // Normalize emails to lowercase so backfill queries always match regardless of
      // how Gmail headers cased the address (e.g. John.Doe@Gmail.com → john.doe@gmail.com).
      .map((p) => ({ ...p, email: p.email.toLowerCase().trim() }));

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
