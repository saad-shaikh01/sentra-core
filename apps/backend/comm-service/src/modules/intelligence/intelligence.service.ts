import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import {
  CommMessageEvent,
  CommMessageEventDocument,
} from '../../schemas/comm-message-event.schema';
import {
  CommThread,
  CommThreadDocument,
  CommThreadResponseTimeScope,
} from '../../schemas/comm-thread.schema';
import { AlertsService } from '../alerts/alerts.service';
import { CommSettingsService } from '../settings/comm-settings.service';
import { IntelligenceSummaryQueryDto } from './dto/intelligence-summary.dto';
import {
  calculateThreadIntelligenceScore,
  deriveSilenceState,
  formatDuration,
  resolveExpectedReplyWindowMs,
  selectResponseTimeScope,
    summarizeResponseTimes,
  } from './intelligence.utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_OPEN_WINDOW_MS = DAY_MS;
const MAX_HISTORICAL_THREADS = 50;

type ThreadMessageSnapshot = Pick<
  CommMessage,
  'sentAt' | 'isSentByIdentity' | 'isBounceDetected' | 'trackedRecipientEmail' | 'to' | 'cc' | 'bcc'
>;

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommMessageEvent.name)
    private readonly eventModel: Model<CommMessageEventDocument>,
    private readonly settingsService: CommSettingsService,
    private readonly alertsService: AlertsService,
  ) {}

  async refreshThreadIntelligence(
    organizationId: string,
    gmailThreadId: string,
  ): Promise<CommThreadDocument | null> {
    const thread = await this.threadModel
      .findOne({ organizationId, gmailThreadId })
      .exec();

    if (!thread) {
      return null;
    }

    const messages = await this.messageModel
      .find({ organizationId, gmailThreadId })
      .sort({ sentAt: 1, _id: 1 })
      .select('sentAt isSentByIdentity isBounceDetected trackedRecipientEmail to cc bcc')
      .lean()
      .exec() as ThreadMessageSnapshot[];
    const settings = await this.settingsService.getResolvedSettings(organizationId);
    const runtimeSettings = this.settingsService.getRuntimeSettings(settings);

    const latestOutbound = [...messages].reverse().find((message) => message.isSentByIdentity && message.sentAt);
    const primaryRecipientEmail =
      this.resolvePrimaryRecipientEmail(latestOutbound) ?? thread.primaryRecipientEmail;
    const entityLink = thread.entityLinks?.[0];

    const firstReplyTimeMs = this.resolveFirstReplyTimeMs(messages, latestOutbound);
    const responseTimeSelection = await this.resolveHistoricalResponseTimes({
      organizationId,
      threadId: String(thread._id),
      primaryRecipientEmail,
      entityType: entityLink?.entityType,
      entityId: entityLink?.entityId,
    });
    const expectedReplyWindowMs = latestOutbound
      ? resolveExpectedReplyWindowMs(responseTimeSelection.stats)
      : undefined;
    const silenceState = deriveSilenceState({
      replyState: thread.replyState,
      lastOutboundAt: thread.lastOutboundAt,
      repliedAt: thread.repliedAt,
      expectedReplyWindowMs: expectedReplyWindowMs ?? 2 * DAY_MS,
      thresholds: runtimeSettings.silenceThresholds,
    });
    const recentOpenMetrics = await this.getRecentOpenMetrics(organizationId, String(thread._id));
    const score = calculateThreadIntelligenceScore({
      replyState: thread.replyState,
      deliveryState: thread.deliveryState,
      lastOutboundAt: thread.lastOutboundAt,
      repliedAt: thread.repliedAt,
      expectedReplyWindowMs,
      silenceOverdueFactor: silenceState.silenceOverdueFactor,
      silenceState: silenceState.silenceState,
      responseTimeSignalQuality: responseTimeSelection.stats.signalQuality,
      recentEstimatedHumanOpenCount: recentOpenMetrics.estimatedHumanOpenCount,
      recentSuspiciousOpenCount: recentOpenMetrics.suspiciousOpenCount,
      estimatedHumanOpenCount: thread.estimatedHumanOpenCount ?? 0,
      suspiciousOpenCount: thread.suspiciousOpenCount ?? 0,
      hasOpenSignal: Boolean(thread.hasOpenSignal),
      now: new Date(),
      engagementScoreMultiplier: runtimeSettings.engagementScoreMultiplier,
      hotLeadThreshold: runtimeSettings.hotLeadThreshold,
    });

    const refreshedThread = await this.threadModel.findByIdAndUpdate(
      thread._id,
      {
        $set: {
          primaryRecipientEmail,
          recentEstimatedHumanOpenCount: recentOpenMetrics.estimatedHumanOpenCount,
          recentSuspiciousOpenCount: recentOpenMetrics.suspiciousOpenCount,
          firstReplyTimeMs,
          responseTimeComparableCount: responseTimeSelection.stats.comparableCount,
          responseTimeMedianMs: responseTimeSelection.stats.medianMs,
          responseTimeP75Ms: responseTimeSelection.stats.p75Ms,
          responseTimeAverageMs: responseTimeSelection.stats.averageMs,
          responseTimeSignalQuality: responseTimeSelection.stats.signalQuality,
          responseTimeScope: responseTimeSelection.scope,
          expectedReplyWindowMs,
          silenceState: silenceState.silenceState,
          silenceOverdueFactor: silenceState.silenceOverdueFactor,
          engagementScore: score.engagementScore,
          engagementBand: score.engagementBand,
          engagementScoreConfidence: score.engagementScoreConfidence,
          scoreReasons: score.scoreReasons,
          needsFollowUpNow: score.needsFollowUpNow,
          hotLead: score.hotLead,
          openedButNotReplied: score.openedButNotReplied,
          suspiciousTrackingOnly: score.suspiciousTrackingOnly,
          lastIntelligenceRefreshAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (refreshedThread) {
      try {
        await this.alertsService.syncThreadAlerts(refreshedThread);
      } catch (error) {
        this.logger.warn(
          `Failed to sync alerts for thread ${gmailThreadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return refreshedThread;
  }

  async getSummary(
    organizationId: string,
    query: IntelligenceSummaryQueryDto,
  ): Promise<{
    dateRange: { dateFrom: string; dateTo: string };
    totals: {
      trackedSends: number;
      replies: number;
      estimatedOpens: number;
      suspiciousOpens: number;
      bounces: number;
      sendFailures: number;
    };
    responseTimes: {
      sampleSize: number;
      medianMs?: number;
      averageMs?: number;
      p75Ms?: number;
      signalQuality: string;
      humanWindow?: string;
    };
    queues: {
      needsFollowUp: number;
      hotLeads: number;
      overdue: number;
      openedNoReply: number;
      suspiciousOnly: number;
    };
  }> {
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const occurredAtFilter = { $gte: dateFrom, $lte: dateTo };
    const queueDateFilter = { $gte: dateFrom, $lte: dateTo };

    const [
      trackedSends,
      replies,
      estimatedOpens,
      suspiciousOpens,
      bounces,
      sendFailures,
      responseTimeRows,
      needsFollowUp,
      hotLeads,
      overdue,
      openedNoReply,
      suspiciousOnly,
    ] = await Promise.all([
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'sent',
        occurredAt: occurredAtFilter,
        'metadata.trackingEnabled': true,
      }),
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'reply_detected',
        occurredAt: occurredAtFilter,
      }),
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'open_pixel',
        occurredAt: occurredAtFilter,
        'requestMeta.isHumanEstimated': true,
      }),
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'open_pixel',
        occurredAt: occurredAtFilter,
        'requestMeta.isSuspicious': true,
      }),
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'bounce_detected',
        occurredAt: occurredAtFilter,
      }),
      this.eventModel.countDocuments({
        organizationId,
        eventType: 'send_failed',
        occurredAt: occurredAtFilter,
      }),
      this.threadModel
        .find({
          organizationId,
          repliedAt: occurredAtFilter,
          firstReplyTimeMs: { $gt: 0 },
        })
        .select('firstReplyTimeMs')
        .lean()
        .exec(),
      this.threadModel.countDocuments({
        organizationId,
        needsFollowUpNow: true,
        isArchived: { $ne: true },
        lastMessageAt: queueDateFilter,
      }),
      this.threadModel.countDocuments({
        organizationId,
        hotLead: true,
        isArchived: { $ne: true },
        lastMessageAt: queueDateFilter,
      }),
      this.threadModel.countDocuments({
        organizationId,
        silenceState: { $in: ['overdue', 'at_risk', 'ghosted'] },
        isArchived: { $ne: true },
        lastMessageAt: queueDateFilter,
      }),
      this.threadModel.countDocuments({
        organizationId,
        openedButNotReplied: true,
        isArchived: { $ne: true },
        lastMessageAt: queueDateFilter,
      }),
      this.threadModel.countDocuments({
        organizationId,
        suspiciousTrackingOnly: true,
        isArchived: { $ne: true },
        lastMessageAt: queueDateFilter,
      }),
    ]);

    const responseTimeStats = summarizeResponseTimes(
      responseTimeRows
        .map((row) => row.firstReplyTimeMs)
        .filter((value): value is number => typeof value === 'number' && value > 0),
    );

    return {
      dateRange: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      },
      totals: {
        trackedSends,
        replies,
        estimatedOpens,
        suspiciousOpens,
        bounces,
        sendFailures,
      },
      responseTimes: {
        sampleSize: responseTimeStats.comparableCount,
        medianMs: responseTimeStats.medianMs,
        averageMs: responseTimeStats.averageMs,
        p75Ms: responseTimeStats.p75Ms,
        signalQuality: responseTimeStats.signalQuality,
        humanWindow: responseTimeStats.medianMs
          ? `Median ${formatDuration(responseTimeStats.medianMs)}`
          : undefined,
      },
      queues: {
        needsFollowUp,
        hotLeads,
        overdue,
        openedNoReply,
        suspiciousOnly,
      },
    };
  }

  private resolveFirstReplyTimeMs(
    messages: ThreadMessageSnapshot[],
    latestOutbound?: ThreadMessageSnapshot,
  ): number | undefined {
    if (!latestOutbound?.sentAt) {
      return undefined;
    }

    const firstInboundReply = messages.find(
      (message) =>
        !message.isSentByIdentity &&
        !message.isBounceDetected &&
        message.sentAt &&
        message.sentAt.getTime() >= latestOutbound.sentAt!.getTime(),
    );

    if (!firstInboundReply?.sentAt) {
      return undefined;
    }

    const diff = firstInboundReply.sentAt.getTime() - latestOutbound.sentAt.getTime();
    return diff > 0 ? diff : undefined;
  }

  private async resolveHistoricalResponseTimes(input: {
    organizationId: string;
    threadId: string;
    primaryRecipientEmail?: string;
    entityType?: string;
    entityId?: string;
  }): Promise<{
    scope: CommThreadResponseTimeScope;
    stats: ReturnType<typeof summarizeResponseTimes>;
  }> {
    const candidateStats: Array<{
      scope: CommThreadResponseTimeScope;
      stats: ReturnType<typeof summarizeResponseTimes>;
    }> = [];

    if (input.primaryRecipientEmail) {
      candidateStats.push({
        scope: 'recipient_email',
        stats: summarizeResponseTimes(
          await this.fetchHistoricalReplyTimes({
            organizationId: input.organizationId,
            threadId: input.threadId,
            primaryRecipientEmail: input.primaryRecipientEmail,
          }),
        ),
      });
    }

    if (input.entityType && input.entityId) {
      candidateStats.push({
        scope: 'entity',
        stats: summarizeResponseTimes(
          await this.fetchHistoricalReplyTimes({
            organizationId: input.organizationId,
            threadId: input.threadId,
            entityType: input.entityType,
            entityId: input.entityId,
          }),
        ),
      });
    }

    // Organization scope is the CRM-wide baseline for this workspace, not a recipient-company match.
    candidateStats.push({
      scope: 'organization',
      stats: summarizeResponseTimes(
        await this.fetchHistoricalReplyTimes({
          organizationId: input.organizationId,
          threadId: input.threadId,
        }),
      ),
    });

    return selectResponseTimeScope(candidateStats);
  }

  private async fetchHistoricalReplyTimes(input: {
    organizationId: string;
    threadId: string;
    primaryRecipientEmail?: string;
    entityType?: string;
    entityId?: string;
  }): Promise<number[]> {
    const query: Record<string, unknown> = {
      organizationId: input.organizationId,
      _id: { $ne: new Types.ObjectId(input.threadId) },
      firstReplyTimeMs: { $gt: 0 },
      repliedAt: { $exists: true },
    };

    if (input.primaryRecipientEmail) {
      query.primaryRecipientEmail = input.primaryRecipientEmail;
    }

    if (input.entityType && input.entityId) {
      query['entityLinks.entityType'] = input.entityType;
      query['entityLinks.entityId'] = input.entityId;
    }

    const rows = await this.threadModel
      .find(query)
      .sort({ repliedAt: -1 })
      .limit(MAX_HISTORICAL_THREADS)
      .select('firstReplyTimeMs')
      .lean()
      .exec();

    return rows
      .map((row) => row.firstReplyTimeMs)
      .filter((value): value is number => typeof value === 'number' && value > 0);
  }

  private async getRecentOpenMetrics(
    organizationId: string,
    threadId: string,
  ): Promise<{ estimatedHumanOpenCount: number; suspiciousOpenCount: number }> {
    const occurredAt = { $gte: new Date(Date.now() - RECENT_OPEN_WINDOW_MS) };

    const [estimatedHumanOpenCount, suspiciousOpenCount] = await Promise.all([
      this.eventModel.countDocuments({
        organizationId,
        threadId,
        eventType: 'open_pixel',
        occurredAt,
        'requestMeta.isHumanEstimated': true,
      }),
      this.eventModel.countDocuments({
        organizationId,
        threadId,
        eventType: 'open_pixel',
        occurredAt,
        'requestMeta.isSuspicious': true,
      }),
    ]);

    return {
      estimatedHumanOpenCount,
      suspiciousOpenCount,
    };
  }

  private resolvePrimaryRecipientEmail(message?: ThreadMessageSnapshot): string | undefined {
    const recipients = [
      message?.trackedRecipientEmail,
      ...(message?.to?.map((entry) => entry.email) ?? []),
      ...(message?.cc?.map((entry) => entry.email) ?? []),
      ...(message?.bcc?.map((entry) => entry.email) ?? []),
    ]
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));

    return recipients[0];
  }

  private resolveDateRange(dateFrom?: string, dateTo?: string): { dateFrom: Date; dateTo: Date } {
    const resolvedDateTo = dateTo ? new Date(dateTo) : new Date();
    const resolvedDateFrom = dateFrom
      ? new Date(dateFrom)
      : new Date(resolvedDateTo.getTime() - 30 * DAY_MS);

    if (!Number.isFinite(resolvedDateFrom.getTime()) || !Number.isFinite(resolvedDateTo.getTime())) {
      this.logger.warn('Invalid intelligence summary date range received, falling back to last 30 days');
      return {
        dateFrom: new Date(Date.now() - 30 * DAY_MS),
        dateTo: new Date(),
      };
    }

    return {
      dateFrom: resolvedDateFrom,
      dateTo: resolvedDateTo,
    };
  }
}
