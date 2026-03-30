import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommMessageEventDocument } from '../../schemas/comm-message-event.schema';
import { CommMessageTrackingTokenDocument } from '../../schemas/comm-message-tracking-token.schema';
import { TrackingService } from './tracking.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createSortQuery<T>(value: T) {
  const query = {
    sort: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  };
  query.sort.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

describe('TrackingService', () => {
  let service: TrackingService;
  let messageRecords: Array<Record<string, unknown>>;
  let threadRecords: Array<Record<string, unknown>>;
  let eventRecords: Array<Record<string, unknown>>;
  let tokenRecords: Array<Record<string, unknown>>;

  let messageModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let threadModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let eventModel: {
    create: jest.Mock;
    findOne: jest.Mock;
  };
  let tokenModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let config: {
    get: jest.Mock;
  };
  let intelligenceService: {
    refreshThreadIntelligence: jest.Mock;
  };

  beforeEach(() => {
    messageRecords = [];
    threadRecords = [];
    eventRecords = [];
    tokenRecords = [];

    messageModel = {
      findById: jest.fn((id: string) =>
        createExecQuery(messageRecords.find((record) => record._id === id) ?? null),
      ),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createExecQuery(
          messageRecords.find(
            (record) =>
              record.organizationId === query.organizationId &&
              record.gmailMessageId === query.gmailMessageId,
          ) ?? null,
        ),
      ),
      findByIdAndUpdate: jest.fn((id: string, update: Record<string, unknown>) => {
        const existing = messageRecords.find((record) => record._id === id);
        if (existing) {
          if (update.$set) {
            Object.assign(existing, update.$set as Record<string, unknown>);
          }
          if (update.$inc) {
            for (const [key, value] of Object.entries(update.$inc as Record<string, number>)) {
              existing[key] = Number(existing[key] ?? 0) + value;
            }
          }
          if (update.$min) {
            for (const [key, value] of Object.entries(update.$min as Record<string, unknown>)) {
              const current = existing[key];
              if (!current || current > value) {
                existing[key] = value;
              }
            }
          }
        }
        return createExecQuery(existing ?? null);
      }),
    };

    threadModel = {
      findById: jest.fn((id: string) =>
        createExecQuery(threadRecords.find((record) => record._id === id) ?? null),
      ),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createExecQuery(
          threadRecords.find(
            (record) =>
              record.organizationId === query.organizationId &&
              record.gmailThreadId === query.gmailThreadId,
          ) ?? null,
        ),
      ),
      findByIdAndUpdate: jest.fn((id: string, update: Record<string, unknown>) => {
        const existing = threadRecords.find((record) => record._id === id);
        if (existing && update.$set) {
          Object.assign(existing, update.$set as Record<string, unknown>);
        }
        return createExecQuery(existing ?? null);
      }),
      findOneAndUpdate: jest.fn((query: Record<string, unknown>, update: Record<string, unknown>) => {
        const existing = threadRecords.find(
          (record) =>
            record.organizationId === query.organizationId &&
            record.gmailThreadId === query.gmailThreadId,
        );
        if (existing) {
          if (update.$set) {
            Object.assign(existing, update.$set as Record<string, unknown>);
          }
          if (update.$inc) {
            for (const [key, value] of Object.entries(update.$inc as Record<string, number>)) {
              existing[key] = Number(existing[key] ?? 0) + value;
            }
          }
          if (update.$min) {
            for (const [key, value] of Object.entries(update.$min as Record<string, unknown>)) {
              const current = existing[key];
              if (!current || current > value) {
                existing[key] = value;
              }
            }
          }
        }
        return createExecQuery(existing ?? null);
      }),
    };

    eventModel = {
      create: jest.fn(async (payload: Record<string, unknown>) => {
        const event = { _id: `event-${eventRecords.length + 1}`, ...payload };
        eventRecords.push(event);
        return event;
      }),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createSortQuery(
          eventRecords
            .filter(
              (event) =>
                event.organizationId === query.organizationId &&
                event.tokenId === query.tokenId &&
                event.eventType === query.eventType,
            )
            .slice()
            .sort((left, right) => Number(new Date(right.occurredAt as string | Date)) - Number(new Date(left.occurredAt as string | Date)))[0] ?? null,
        ),
      ),
    };

    tokenModel = {
      create: jest.fn(async (payload: Record<string, unknown>) => {
        const token = { _id: `token-${tokenRecords.length + 1}`, ...payload };
        tokenRecords.push(token);
        return token;
      }),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createExecQuery(
          tokenRecords.find(
            (record) =>
              record.tokenHash === query.tokenHash &&
              record.tokenType === query.tokenType &&
              record.status === query.status,
          ) ?? null,
        ),
      ),
      findByIdAndUpdate: jest.fn((id: string, update: Record<string, unknown>) => {
        const existing = tokenRecords.find((record) => record._id === id);
        if (existing && update.$set) {
          Object.assign(existing, update.$set as Record<string, unknown>);
        }
        return createExecQuery(existing ?? null);
      }),
    };

    config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'COMM_TRACKING_BASE_URL') {
          return 'https://comm.example.com/api/comm';
        }
        if (key === 'COMM_ENCRYPTION_MASTER_KEY') {
          return 'tracking-secret';
        }
        return defaultValue;
      }),
    };
    intelligenceService = {
      refreshThreadIntelligence: jest.fn().mockResolvedValue(null),
    };

    service = new TrackingService(
      messageModel as unknown as Model<CommMessageDocument>,
      threadModel as unknown as Model<CommThreadDocument>,
      eventModel as unknown as Model<CommMessageEventDocument>,
      tokenModel as unknown as Model<CommMessageTrackingTokenDocument>,
      config as unknown as ConfigService,
      intelligenceService as never,
    );
  });

  it('creates per-message tracking tokens for outbound HTML mail', async () => {
    const prepared = await service.prepareOpenTracking({
      organizationId: 'org-1',
      identityId: 'identity-1',
      to: ['client@example.com'],
      cc: [],
      bcc: [],
    });

    expect(prepared).toMatchObject({
      tokenId: 'token-1',
      trackingMode: 'per_message',
      recipientEmail: 'client@example.com',
    });
    expect(prepared?.pixelUrl).toContain('/track/o/');
    expect(tokenRecords[0]).toMatchObject({
      organizationId: 'org-1',
      identityId: 'identity-1',
      recipientEmail: 'client@example.com',
      trackingMode: 'per_message',
      status: 'reserved',
    });
  });

  it('captures an open pixel, logs the immutable event, and updates derived counters', async () => {
    const prepared = await service.prepareOpenTracking({
      organizationId: 'org-1',
      identityId: 'identity-1',
      to: ['client@example.com'],
      cc: [],
      bcc: [],
    });

    messageRecords.push({
      _id: 'message-1',
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-1',
      gmailMessageId: 'gmail-message-1',
      identityId: 'identity-1',
      to: [{ email: 'client@example.com' }],
      trackingEnabled: true,
      trackingMode: 'per_message',
      sentAt: new Date(Date.now() - 5 * 60 * 1000),
      openCount: 0,
      estimatedHumanOpenCount: 0,
      suspiciousOpenCount: 0,
    });
    threadRecords.push({
      _id: 'thread-1',
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-1',
      entityLinks: [{ entityType: 'client', entityId: 'client-1' }],
      trackedOpenCount: 0,
      estimatedHumanOpenCount: 0,
      suspiciousOpenCount: 0,
      hasOpenSignal: false,
    });
    tokenRecords[0].status = 'active';
    tokenRecords[0].messageId = 'message-1';
    tokenRecords[0].threadId = 'thread-1';
    tokenRecords[0].gmailMessageId = 'gmail-message-1';
    tokenRecords[0].gmailThreadId = 'gmail-thread-1';

    await service.captureOpenPixel(prepared!.rawToken, {
      ip: '203.0.113.10',
      userAgent: 'GoogleImageProxy',
      referer: 'https://mail.googleusercontent.com/proxy/abc',
    });

    expect(eventRecords).toHaveLength(1);
    expect(eventRecords[0]).toMatchObject({
      eventType: 'open_pixel',
      recipientEmail: 'client@example.com',
      requestMeta: expect.objectContaining({
        source: 'google_image_proxy',
        isSuspicious: false,
        isHumanEstimated: true,
      }),
    });
    expect(messageRecords[0]).toMatchObject({
      openCount: 1,
      estimatedHumanOpenCount: 1,
      suspiciousOpenCount: 0,
      openTrackingState: 'open_signal_detected',
      lastOpenSource: 'google_image_proxy',
    });
    expect(threadRecords[0]).toMatchObject({
      trackedOpenCount: 1,
      estimatedHumanOpenCount: 1,
      suspiciousOpenCount: 0,
      hasOpenSignal: true,
      lastOpenSource: 'google_image_proxy',
    });
  });

  it('marks immediate scanner opens as suspicious instead of confident human opens', async () => {
    const prepared = await service.prepareOpenTracking({
      organizationId: 'org-1',
      identityId: 'identity-1',
      to: ['client@example.com'],
      cc: [],
      bcc: [],
    });

    messageRecords.push({
      _id: 'message-1',
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-1',
      gmailMessageId: 'gmail-message-1',
      identityId: 'identity-1',
      to: [{ email: 'client@example.com' }],
      trackingEnabled: true,
      trackingMode: 'per_message',
      sentAt: new Date(),
      openCount: 0,
      estimatedHumanOpenCount: 0,
      suspiciousOpenCount: 0,
    });
    threadRecords.push({
      _id: 'thread-1',
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-1',
      entityLinks: [],
      trackedOpenCount: 0,
      estimatedHumanOpenCount: 0,
      suspiciousOpenCount: 0,
      hasOpenSignal: false,
    });
    tokenRecords[0].status = 'active';
    tokenRecords[0].messageId = 'message-1';
    tokenRecords[0].threadId = 'thread-1';
    tokenRecords[0].gmailMessageId = 'gmail-message-1';
    tokenRecords[0].gmailThreadId = 'gmail-thread-1';

    await service.captureOpenPixel(prepared!.rawToken, {
      ip: '198.51.100.1',
      userAgent: 'Proofpoint URL Defense',
      referer: undefined,
    });

    expect(eventRecords[0]).toMatchObject({
      requestMeta: expect.objectContaining({
        source: 'security_scanner',
        isSuspicious: true,
        isHumanEstimated: false,
      }),
    });
    expect(messageRecords[0]).toMatchObject({
      openCount: 1,
      estimatedHumanOpenCount: 0,
      suspiciousOpenCount: 1,
      openTrackingState: 'suspicious_signal_detected',
      lastOpenSource: 'security_scanner',
    });
  });
});
