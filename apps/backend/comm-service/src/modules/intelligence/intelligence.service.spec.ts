import { Model } from 'mongoose';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommMessageEventDocument } from '../../schemas/comm-message-event.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { IntelligenceService } from './intelligence.service';

function createQueryChain<T>(value: T) {
  const query = {
    sort: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  };
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('IntelligenceService', () => {
  let service: IntelligenceService;
  let threadModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let messageModel: {
    find: jest.Mock;
  };
  let eventModel: {
    countDocuments: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-30T10:00:00.000Z'));
    threadModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    messageModel = {
      find: jest.fn(),
    };
    eventModel = {
      countDocuments: jest.fn(),
    };

    service = new IntelligenceService(
      threadModel as unknown as Model<CommThreadDocument>,
      messageModel as unknown as Model<CommMessageDocument>,
      eventModel as unknown as Model<CommMessageEventDocument>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes thread intelligence with recipient-level response timing and explainable queues', async () => {
    threadModel.findOne.mockReturnValue(
      createExecQuery({
        _id: '507f1f77bcf86cd799439011',
        organizationId: 'org-1',
        gmailThreadId: 'gmail-thread-1',
        replyState: 'waiting',
        deliveryState: 'sent',
        lastOutboundAt: new Date('2026-03-29T22:00:00.000Z'),
        repliedAt: undefined,
        estimatedHumanOpenCount: 3,
        suspiciousOpenCount: 0,
        hasOpenSignal: true,
        primaryRecipientEmail: undefined,
        entityLinks: [{ entityType: 'lead', entityId: 'lead-1' }],
      }),
    );
    messageModel.find.mockReturnValue(
      createQueryChain([
        {
          sentAt: new Date('2026-03-29T22:00:00.000Z'),
          isSentByIdentity: true,
          isBounceDetected: false,
          trackedRecipientEmail: 'client@example.com',
          to: [{ email: 'client@example.com' }],
          cc: [],
          bcc: [],
        },
      ]),
    );
    threadModel.find.mockImplementation((query: Record<string, unknown>) => {
      if (query.primaryRecipientEmail === 'client@example.com') {
        return createQueryChain([
          { firstReplyTimeMs: 4 * 60 * 60 * 1000 },
          { firstReplyTimeMs: 6 * 60 * 60 * 1000 },
          { firstReplyTimeMs: 10 * 60 * 60 * 1000 },
        ]);
      }

      if (query['entityLinks.entityId'] === 'lead-1') {
        return createQueryChain([{ firstReplyTimeMs: 8 * 60 * 60 * 1000 }]);
      }

      return createQueryChain([{ firstReplyTimeMs: 12 * 60 * 60 * 1000 }]);
    });
    eventModel.countDocuments.mockImplementation(async (query: Record<string, unknown>) => {
      if (query.threadId && query['requestMeta.isHumanEstimated']) {
        return 3;
      }
      if (query.threadId && query['requestMeta.isSuspicious']) {
        return 0;
      }
      return 0;
    });
    threadModel.findByIdAndUpdate.mockImplementation((_id: string, update: Record<string, unknown>) =>
      createExecQuery({
        _id: '507f1f77bcf86cd799439011',
        gmailThreadId: 'gmail-thread-1',
        ...(update.$set as Record<string, unknown>),
      }),
    );

    const thread = await service.refreshThreadIntelligence('org-1', 'gmail-thread-1');

    expect(threadModel.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        $set: expect.objectContaining({
          primaryRecipientEmail: 'client@example.com',
          responseTimeScope: 'recipient_email',
          responseTimeComparableCount: 3,
          responseTimeSignalQuality: 'weak',
          recentEstimatedHumanOpenCount: 3,
          needsFollowUpNow: true,
          hotLead: true,
          openedButNotReplied: true,
        }),
      }),
      { new: true },
    );
    expect(thread?.scoreReasons).toEqual(
      expect.arrayContaining([
        'Opened 3 times in the last 24h',
        'Opened but not replied',
      ]),
    );
  });

  it('builds a conservative summary response with queue counts and response-time confidence', async () => {
    eventModel.countDocuments.mockImplementation(async (query: Record<string, unknown>) => {
      if (query.eventType === 'sent') return 12;
      if (query.eventType === 'reply_detected') return 5;
      if (query.eventType === 'open_pixel' && query['requestMeta.isHumanEstimated']) return 9;
      if (query.eventType === 'open_pixel' && query['requestMeta.isSuspicious']) return 2;
      if (query.eventType === 'bounce_detected') return 1;
      if (query.eventType === 'send_failed') return 1;
      return 0;
    });
    threadModel.find.mockReturnValue(
      createQueryChain([
        { firstReplyTimeMs: 5 * 60 * 60 * 1000 },
        { firstReplyTimeMs: 7 * 60 * 60 * 1000 },
      ]),
    );
    threadModel.countDocuments.mockImplementation(async (query: Record<string, unknown>) => {
      if (query.needsFollowUpNow) return 4;
      if (query.hotLead) return 3;
      if (query.openedButNotReplied) return 2;
      if (query.suspiciousTrackingOnly) return 1;
      if (query.silenceState) return 5;
      return 0;
    });

    const summary = await service.getSummary('org-1', {
      dateFrom: '2026-03-01T00:00:00.000Z',
      dateTo: '2026-03-30T23:59:59.000Z',
    });

    expect(summary.totals).toEqual({
      trackedSends: 12,
      replies: 5,
      estimatedOpens: 9,
      suspiciousOpens: 2,
      bounces: 1,
      sendFailures: 1,
    });
    expect(summary.responseTimes).toMatchObject({
      sampleSize: 2,
      signalQuality: 'weak',
      humanWindow: 'Median 6h',
    });
    expect(summary.queues).toEqual({
      needsFollowUp: 4,
      hotLeads: 3,
      overdue: 5,
      openedNoReply: 2,
      suspiciousOnly: 1,
    });
  });
});
