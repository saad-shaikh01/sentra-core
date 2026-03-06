/**
 * SyncProcessor
 *
 * BullMQ worker that processes comm-sync queue jobs.
 * Jobs: initial-sync, incremental-sync, process-message
 *
 * COMM-BE-010: On incremental sync, if historyId is expired (INVALID_ARGUMENT),
 *              fall back to a full_sync job automatically.
 * COMM-BE-012: Handle labelsAdded/labelsRemoved to sync isRead + labelIds on
 *              messages and threads.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { SyncService } from './sync.service';
import { GmailApiService } from './gmail-api.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { COMM_SYNC_QUEUE } from './sync.constants';

@Processor(COMM_SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    private readonly syncService: SyncService,
    private readonly gmailApi: GmailApiService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const start = Date.now();
    try {
      switch (job.name) {
        case 'initial-sync':
          await this.handleInitialSync(job);
          break;
        case 'incremental-sync':
          await this.handleIncrementalSync(job);
          break;
        case 'process-message':
          await this.handleProcessMessage(job);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (err) {
      this.metrics.incrementSyncError(job.name);
      throw err;
    } finally {
      this.metrics.recordSyncDuration(job.name, (Date.now() - start) / 1000);
    }
  }

  private async handleInitialSync(job: Job<{ identityId: string; days: number }>) {
    const identity = await this.getIdentity(job.data.identityId);
    if (!identity) return;

    this.logger.log(`Starting initial sync for identity ${job.data.identityId}`);
    await this.syncService.performInitialSync(identity);
  }

  private async handleIncrementalSync(job: Job<{ identityId: string }>) {
    const identity = await this.getIdentity(job.data.identityId);
    if (!identity) return;

    try {
      await this.syncService.performIncrementalSync(identity);

      // COMM-BE-012: Process label events from the last incremental sync
      await this.syncLabelUpdates(identity);
    } catch (err: any) {
      // COMM-BE-010: If historyId is expired, fall back to full sync
      const isHistoryExpired =
        err?.code === 404 ||
        (typeof err?.message === 'string' && err.message.includes('INVALID_ARGUMENT'));

      if (isHistoryExpired) {
        this.logger.warn(
          `HistoryId expired for identity ${job.data.identityId} — falling back to full sync`,
        );
        await this.syncService.triggerInitialSync(job.data.identityId);
        return;
      }

      throw err;
    }
  }

  private async handleProcessMessage(job: Job<{ identityId: string; messageId: string }>) {
    const identity = await this.getIdentity(job.data.identityId);
    if (!identity) return;

    await this.syncService.processMessage(identity, job.data.messageId);
    this.metrics.incrementMessagesProcessed(job.data.identityId);
  }

  /**
   * COMM-BE-012: Sync label changes to messages and threads.
   * Reads the latest message labelIds from MongoDB and updates isRead/thread state.
   */
  private async syncLabelUpdates(identity: CommIdentityDocument): Promise<void> {
    try {
      const gmail = await this.gmailApi.getGmailClient(identity);

      // Find messages that have changed labels since last incremental sync
      // Strategy: for messages fetched in the last sync window, re-check label state
      const recentMessages = await this.messageModel
        .find({
          organizationId: identity.organizationId,
          identityId: String(identity._id),
          updatedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // last 5 min
        })
        .select('gmailMessageId gmailThreadId isRead gmailLabels')
        .exec();

      for (const msg of recentMessages) {
        try {
          const raw = await gmail.users.messages.get({
            userId: 'me',
            id: msg.gmailMessageId,
            format: 'minimal',
          });

          const labels = raw.data.labelIds ?? [];
          const isRead = !labels.includes('UNREAD');

          if (
            isRead !== msg.isRead ||
            JSON.stringify(labels.sort()) !== JSON.stringify([...msg.gmailLabels].sort())
          ) {
            await this.messageModel.findByIdAndUpdate(msg._id, {
              $set: { isRead, gmailLabels: labels },
            });

            // Update thread read state
            await this.threadModel.findOneAndUpdate(
              {
                organizationId: identity.organizationId,
                gmailThreadId: msg.gmailThreadId,
              },
              { $set: { hasUnread: !isRead } },
            );
          }
        } catch {
          // Non-fatal — skip individual message label sync failures
        }
      }
    } catch (err) {
      this.logger.warn(`Label sync failed for identity ${identity._id}: ${err}`);
    }
  }

  private async getIdentity(identityId: string): Promise<CommIdentityDocument | null> {
    const identity = await this.identityModel.findById(identityId).exec();
    if (!identity || !identity.isActive) {
      this.logger.warn(`Identity ${identityId} not found or inactive — skipping job`);
      return null;
    }
    return identity;
  }
}
