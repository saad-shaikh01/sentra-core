import {
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';
import { CommGateway } from '../gateway/comm.gateway';
import { CommAlert, CommAlertDocument, CommAlertSeverity, CommAlertType } from '../../schemas/comm-alert.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommSettingsService } from '../settings/comm-settings.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';

type AlertPayload = {
  dedupeKey: string;
  alertType: CommAlertType;
  severity: CommAlertSeverity;
  title: string;
  body: string;
  thread: CommThreadDocument;
  recipientUserId: string;
  reasonKeys?: string[];
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(CommAlert.name)
    private readonly alertModel: Model<CommAlertDocument>,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly settingsService: CommSettingsService,
    @Optional() private readonly gateway?: CommGateway,
  ) {}

  async listAlerts(
    organizationId: string,
    userId: string,
    query: QueryAlertsDto,
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const { skip } = toMongoosePagination(page, limit);
    const filter: Record<string, unknown> = {
      organizationId,
      recipientUserId: userId,
    };

    if (query.status === 'active') {
      filter.isActive = true;
    } else if (query.status === 'unread') {
      filter.isRead = false;
    }

    const [data, total, unreadCount] = await Promise.all([
      this.alertModel
        .find(filter)
        .sort({ isRead: 1, lastTriggeredAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.alertModel.countDocuments(filter),
      this.alertModel.countDocuments({
        organizationId,
        recipientUserId: userId,
        isRead: false,
      }),
    ]);

    return {
      ...buildCommPaginationResponse(data, total, page, limit),
      unreadCount,
    };
  }

  async markRead(
    organizationId: string,
    userId: string,
    alertId: string,
  ): Promise<void> {
    const alert = await this.alertModel
      .findOneAndUpdate(
        {
          _id: alertId,
          organizationId,
          recipientUserId: userId,
        },
        {
          $set: {
            isRead: true,
          },
        },
      )
      .exec();

    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    this.gateway?.emitToUser(userId, 'alert:updated', {
      id: alertId,
      isRead: true,
    });
  }

  async markAllRead(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.alertModel.updateMany(
      {
        organizationId,
        recipientUserId: userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      },
    ).exec();

    this.gateway?.emitToUser(userId, 'alert:all-read', { success: true });
  }

  async syncThreadAlerts(thread: CommThreadDocument): Promise<void> {
    const settings = await this.settingsService.getResolvedSettings(thread.organizationId);
    const identity = await this.identityModel
      .findById(thread.identityId)
      .select('_id userId')
      .lean()
      .exec();

    const recipientUserId = identity?.userId;
    if (!recipientUserId) {
      return;
    }

    const baseContext = {
      organizationId: thread.organizationId,
      recipientUserId,
      threadId: String(thread._id),
      gmailThreadId: thread.gmailThreadId,
    };

    if (!settings.trackingEnabled || !settings.inAppAlertsEnabled) {
      await this.alertModel.updateMany(
        { ...baseContext, isActive: true },
        { $set: { isActive: false } },
      ).exec();
      return;
    }

    const recipientLabel = thread.primaryRecipientEmail ?? 'recipient';
    const subjectLabel = thread.subject?.trim() || 'Untitled thread';
    const scoreReasons = (thread.scoreReasons ?? []).filter(Boolean);

    const shouldAlertMultipleOpens =
      settings.openTrackingEnabled &&
      settings.multipleOpenAlertsEnabled &&
      !thread.repliedAt &&
      (thread.recentEstimatedHumanOpenCount ?? 0) >= settings.multipleOpenThreshold &&
      !thread.suspiciousTrackingOnly;

    const shouldAlertHotLead =
      settings.hotLeadAlertsEnabled &&
      thread.hotLead &&
      (thread.engagementScore ?? 0) >= this.settingsService.getRuntimeSettings(settings).hotLeadThreshold;

    const shouldAlertOverdue =
      settings.overdueAlertsEnabled &&
      thread.needsFollowUpNow &&
      ['overdue', 'at_risk', 'ghosted'].includes(thread.silenceState ?? '');

    await Promise.all([
      shouldAlertMultipleOpens
        ? this.upsertAlert({
            dedupeKey: `multi_open:${thread.gmailThreadId}`,
            alertType: 'multi_open',
            severity: 'info',
            title: 'Repeated open signal detected',
            body: `${recipientLabel} triggered ${thread.recentEstimatedHumanOpenCount} estimated opens on "${subjectLabel}". Open tracking is still estimated.`,
            thread,
            recipientUserId,
            reasonKeys: ['multiple_estimated_opens'],
            metadata: {
              recentEstimatedHumanOpenCount: thread.recentEstimatedHumanOpenCount,
              subject: thread.subject,
            },
          })
        : this.resolveAlert(baseContext.organizationId, recipientUserId, `multi_open:${thread.gmailThreadId}`),
      shouldAlertHotLead
        ? this.upsertAlert({
            dedupeKey: `hot_lead:${thread.gmailThreadId}`,
            alertType: 'hot_lead',
            severity: 'success',
            title: 'Hot lead signal',
            body: scoreReasons[0]
              ? `${recipientLabel} looks warm. ${scoreReasons[0]}.`
              : `${recipientLabel} is scoring as a hot lead right now.`,
            thread,
            recipientUserId,
            reasonKeys: ['hot_lead'],
            metadata: {
              engagementScore: thread.engagementScore,
              engagementBand: thread.engagementBand,
              scoreReasons: scoreReasons.slice(0, 3),
            },
          })
        : this.resolveAlert(baseContext.organizationId, recipientUserId, `hot_lead:${thread.gmailThreadId}`),
      shouldAlertOverdue
        ? this.upsertAlert({
            dedupeKey: `overdue_follow_up:${thread.gmailThreadId}`,
            alertType: 'overdue_follow_up',
            severity: thread.silenceState === 'ghosted' ? 'warning' : 'info',
            title:
              thread.silenceState === 'ghosted'
                ? 'Follow-up looks ghosted'
                : 'Follow-up is overdue',
            body: scoreReasons.find((reason) => reason.toLowerCase().includes('no reply'))
              ? `${recipientLabel} needs attention. ${scoreReasons.find((reason) => reason.toLowerCase().includes('no reply'))}.`
              : `${recipientLabel} has gone quiet longer than expected.`,
            thread,
            recipientUserId,
            reasonKeys: ['overdue_follow_up'],
            metadata: {
              silenceState: thread.silenceState,
              silenceOverdueFactor: thread.silenceOverdueFactor,
              expectedReplyWindowMs: thread.expectedReplyWindowMs,
            },
          })
        : this.resolveAlert(baseContext.organizationId, recipientUserId, `overdue_follow_up:${thread.gmailThreadId}`),
    ]);
  }

  private async upsertAlert(input: AlertPayload): Promise<void> {
    const existing = await this.alertModel.findOne({
      organizationId: input.thread.organizationId,
      recipientUserId: input.recipientUserId,
      dedupeKey: input.dedupeKey,
    }).lean().exec();

    const alert = await this.alertModel
      .findOneAndUpdate(
        {
          organizationId: input.thread.organizationId,
          recipientUserId: input.recipientUserId,
          dedupeKey: input.dedupeKey,
        },
        {
          $set: {
            alertType: input.alertType,
            severity: input.severity,
            title: input.title,
            body: input.body,
            isActive: true,
            isRead: false,
            threadId: String(input.thread._id),
            gmailThreadId: input.thread.gmailThreadId,
            identityId: input.thread.identityId,
            entityType: input.thread.entityLinks?.[0]?.entityType,
            entityId: input.thread.entityLinks?.[0]?.entityId,
            lastTriggeredAt: new Date(),
            reasonKeys: input.reasonKeys ?? [],
            metadata: input.metadata,
          },
          $setOnInsert: {
            organizationId: input.thread.organizationId,
            recipientUserId: input.recipientUserId,
            dedupeKey: input.dedupeKey,
            firstTriggeredAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();

    this.gateway?.emitToUser(input.recipientUserId, existing ? 'alert:updated' : 'alert:new', alert);
  }

  private async resolveAlert(
    organizationId: string,
    recipientUserId: string,
    dedupeKey: string,
  ): Promise<void> {
    const resolved = await this.alertModel
      .findOneAndUpdate(
        {
          organizationId,
          recipientUserId,
          dedupeKey,
          isActive: true,
        },
        {
          $set: {
            isActive: false,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (resolved) {
      this.gateway?.emitToUser(recipientUserId, 'alert:updated', resolved);
    }
  }
}
