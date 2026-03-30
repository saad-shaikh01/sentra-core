import { Model } from 'mongoose';
import { CommAlertDocument } from '../../schemas/comm-alert.schema';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommGateway } from '../gateway/comm.gateway';
import { CommSettingsService } from '../settings/comm-settings.service';
import { AlertsService } from './alerts.service';

function execQuery<T>(value: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('AlertsService', () => {
  let service: AlertsService;
  let alertRecords: Array<Record<string, unknown>>;
  let alertModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateMany: jest.Mock;
  };
  let identityModel: {
    findById: jest.Mock;
  };
  let settingsService: {
    getResolvedSettings: jest.Mock;
    getRuntimeSettings: jest.Mock;
  };
  let gateway: {
    emitToUser: jest.Mock;
  };

  beforeEach(() => {
    alertRecords = [];
    alertModel = {
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(alertRecords),
      })),
      countDocuments: jest.fn(async (query: Record<string, unknown>) => {
        if (query.isRead === false) {
          return alertRecords.filter((alert) => alert.isRead === false).length;
        }
        return alertRecords.length;
      }),
      findOne: jest.fn((query: Record<string, unknown>) =>
        execQuery(
          alertRecords.find(
            (alert) =>
              alert.organizationId === query.organizationId &&
              alert.recipientUserId === query.recipientUserId &&
              alert.dedupeKey === query.dedupeKey,
          ) ?? null,
        ),
      ),
      findOneAndUpdate: jest.fn((query: Record<string, unknown>, update: Record<string, unknown>) => {
        let existing = alertRecords.find(
          (alert) =>
            alert.organizationId === query.organizationId &&
            alert.recipientUserId === query.recipientUserId &&
            alert.dedupeKey === query.dedupeKey,
        );

        if (!existing) {
          if (!('$setOnInsert' in update)) {
            return {
              lean: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue(null),
            };
          }
          existing = {
            _id: `alert-${alertRecords.length + 1}`,
            organizationId: query.organizationId,
            recipientUserId: query.recipientUserId,
            dedupeKey: query.dedupeKey,
            ...(update.$setOnInsert as Record<string, unknown>),
          };
          alertRecords.push(existing);
        }

        Object.assign(existing, update.$set as Record<string, unknown>);
        return {
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(existing),
        };
      }),
      updateMany: jest.fn(() => execQuery(undefined)),
    };
    identityModel = {
      findById: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'identity-1', userId: 'user-1' }),
      })),
    };
    settingsService = {
      getResolvedSettings: jest.fn().mockResolvedValue({
        trackingEnabled: true,
        openTrackingEnabled: true,
        inAppAlertsEnabled: true,
        multipleOpenAlertsEnabled: true,
        multipleOpenThreshold: 3,
        hotLeadAlertsEnabled: true,
        overdueAlertsEnabled: true,
      }),
      getRuntimeSettings: jest.fn().mockReturnValue({
        hotLeadThreshold: 70,
      }),
    };
    gateway = {
      emitToUser: jest.fn(),
    };

    service = new AlertsService(
      alertModel as unknown as Model<CommAlertDocument>,
      identityModel as unknown as Model<CommIdentityDocument>,
      settingsService as unknown as CommSettingsService,
      gateway as unknown as CommGateway,
    );
  });

  it('creates active alerts for repeated opens and hot leads', async () => {
    await service.syncThreadAlerts({
      _id: 'thread-1',
      organizationId: 'org-1',
      identityId: 'identity-1',
      gmailThreadId: 'gmail-thread-1',
      subject: 'Proposal',
      primaryRecipientEmail: 'client@example.com',
      recentEstimatedHumanOpenCount: 3,
      suspiciousTrackingOnly: false,
      repliedAt: undefined,
      hotLead: true,
      engagementScore: 82,
      needsFollowUpNow: false,
      silenceState: 'watch',
      scoreReasons: ['Opened 3 times in the last 24h'],
      entityLinks: [],
    } as unknown as CommThreadDocument);

    expect(alertRecords).toHaveLength(2);
    expect(alertRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alertType: 'multi_open', isActive: true }),
        expect.objectContaining({ alertType: 'hot_lead', isActive: true }),
      ]),
    );
    expect(gateway.emitToUser).toHaveBeenCalled();
  });

  it('marks stale alerts inactive when the thread no longer qualifies', async () => {
    alertRecords.push({
      _id: 'alert-1',
      organizationId: 'org-1',
      recipientUserId: 'user-1',
      dedupeKey: 'overdue_follow_up:gmail-thread-1',
      isActive: true,
      isRead: false,
    });

    await service.syncThreadAlerts({
      _id: 'thread-1',
      organizationId: 'org-1',
      identityId: 'identity-1',
      gmailThreadId: 'gmail-thread-1',
      subject: 'Proposal',
      primaryRecipientEmail: 'client@example.com',
      recentEstimatedHumanOpenCount: 0,
      suspiciousTrackingOnly: false,
      repliedAt: new Date('2026-03-30T08:00:00.000Z'),
      hotLead: false,
      engagementScore: 30,
      needsFollowUpNow: false,
      silenceState: 'none',
      scoreReasons: [],
      entityLinks: [],
    } as unknown as CommThreadDocument);

    expect(alertModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'overdue_follow_up:gmail-thread-1',
        isActive: true,
      }),
      expect.objectContaining({
        $set: { isActive: false },
      }),
      { new: true },
    );
  });
});
