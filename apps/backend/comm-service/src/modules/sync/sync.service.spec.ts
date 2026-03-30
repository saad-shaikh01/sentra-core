import { Model } from 'mongoose';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommSyncJobDocument } from '../../schemas/comm-sync-job.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { GmailApiService } from './gmail-api.service';
import { SyncService } from './sync.service';
import { TrackingService } from '../tracking/tracking.service';
import { IntelligenceService } from '../intelligence/intelligence.service';

describe('SyncService', () => {
  let service: SyncService;
  let identityModel: {
    findByIdAndUpdate: jest.Mock;
  };
  let messageModel: {
    findOne: jest.Mock;
    exists: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let threadModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let syncQueue: {
    add: jest.Mock;
  };
  let gmailApi: {
    getGmailClient: jest.Mock;
    getCurrentHistoryId: jest.Mock;
    listMessages: jest.Mock;
    getMessage: jest.Mock;
  };
  let trackingService: {
    recordReplyDetected: jest.Mock;
    recordBounceDetected: jest.Mock;
  };
  let intelligenceService: {
    refreshThreadIntelligence: jest.Mock;
  };

  beforeEach(() => {
    identityModel = {
      findByIdAndUpdate: jest.fn(),
    };
    messageModel = {
      findOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(null),
      })),
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn(() => {
        const query = {
          sort: jest.fn(),
          lean: jest.fn(),
          exec: jest.fn().mockResolvedValue([
            {
              organizationId: 'org-1',
              gmailThreadId: 'gmail-thread-1',
              gmailMessageId: 'gmail-message-1',
              identityId: 'identity-1',
              from: { email: 'agent@example.com', name: 'Agent' },
              to: [{ email: 'client@example.com', name: 'Client' }],
              cc: [],
              bodyText: 'Hello',
              attachments: [],
              sentAt: new Date('2026-03-11T10:00:00.000Z'),
              isRead: true,
              isSentByIdentity: true,
              deliveryState: 'sent',
              isBounceDetected: false,
            },
          ]),
        };
        query.sort.mockReturnValue(query);
        query.lean.mockReturnValue(query);
        return query;
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: 'message-1',
        organizationId: 'org-1',
        gmailThreadId: 'gmail-thread-1',
        gmailMessageId: 'gmail-message-1',
        identityId: 'identity-1',
        from: { email: 'agent@example.com', name: 'Agent' },
        to: [{ email: 'client@example.com', name: 'Client' }],
        cc: [],
        bcc: [],
        attachments: [],
        sentAt: new Date('2026-03-11T10:00:00.000Z'),
        isRead: true,
        isSentByIdentity: true,
        deliveryState: 'sent',
        isBounceDetected: false,
        referenceIds: [],
        gmailLabels: ['SENT'],
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
    };
    threadModel = {
      findOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(null),
      })),
      findOneAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({ _id: 'thread-1' }),
      })),
    };
    syncQueue = {
      add: jest.fn(),
    };
    gmailApi = {
      getGmailClient: jest.fn().mockResolvedValue({}),
      getCurrentHistoryId: jest.fn().mockResolvedValue('history-1'),
      listMessages: jest.fn(),
      getMessage: jest.fn().mockResolvedValue({
        id: 'gmail-message-1',
        threadId: 'gmail-thread-1',
        labelIds: ['SENT'],
        payload: {
          headers: [
            { name: 'From', value: 'Agent <agent@example.com>' },
            { name: 'To', value: 'Client <client@example.com>' },
            { name: 'Subject', value: 'Outbound' },
            { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
          ],
          mimeType: 'text/plain',
          body: {
            data: Buffer.from('Hello').toString('base64url'),
          },
        },
      }),
    };
    gmailApi.listMessages.mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });
    trackingService = {
      recordReplyDetected: jest.fn().mockResolvedValue(undefined),
      recordBounceDetected: jest.fn().mockResolvedValue(undefined),
    };
    intelligenceService = {
      refreshThreadIntelligence: jest.fn().mockResolvedValue(null),
    };

    service = new SyncService(
      identityModel as unknown as Model<CommIdentityDocument>,
      threadModel as unknown as Model<CommThreadDocument>,
      messageModel as unknown as Model<CommMessageDocument>,
      {} as Model<CommSyncJobDocument>,
      syncQueue as never,
      { add: jest.fn() } as never,
      gmailApi as unknown as GmailApiService,
      trackingService as unknown as TrackingService,
      intelligenceService as unknown as IntelligenceService,
      undefined,
      undefined,
      {
        autoLinkThreads: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processMessage marks the thread as sent when Gmail marks the message as SENT', async () => {
    await service.processMessage(
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      } as unknown as CommIdentityDocument,
      'gmail-message-1',
    );

    expect(threadModel.findOneAndUpdate).toHaveBeenCalledWith(
      { organizationId: 'org-1', gmailThreadId: 'gmail-thread-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          hasSent: true,
        }),
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });

  it('parseGmailMessage strips unsafe script tags before storing bodyHtml', () => {
    const parseGmailMessage = (
      service as unknown as {
        parseGmailMessage: (
          raw: Record<string, unknown>,
          identity: CommIdentityDocument,
        ) => { bodyHtml?: string };
      }
    ).parseGmailMessage.bind(service);

    const parsed = parseGmailMessage(
      {
        id: 'gmail-message-2',
        threadId: 'gmail-thread-2',
        payload: {
          headers: [{ name: 'From', value: 'Agent <agent@example.com>' }],
          mimeType: 'text/html',
          body: {
            data: Buffer.from('<script>alert(1)</script>').toString('base64url'),
          },
        },
      },
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      } as unknown as CommIdentityDocument,
    );

    expect(parsed.bodyHtml).toBeUndefined();
  });

  it('parseGmailMessage preserves allowed img tags in sanitized bodyHtml', () => {
    const parseGmailMessage = (
      service as unknown as {
        parseGmailMessage: (
          raw: Record<string, unknown>,
          identity: CommIdentityDocument,
        ) => { bodyHtml?: string };
      }
    ).parseGmailMessage.bind(service);

    const parsed = parseGmailMessage(
      {
        id: 'gmail-message-3',
        threadId: 'gmail-thread-3',
        payload: {
          headers: [{ name: 'From', value: 'Agent <agent@example.com>' }],
          mimeType: 'text/html',
          body: {
            data: Buffer.from('<img src=\"https://cdn.example.com/img.png\" alt=\"img\">').toString(
              'base64url',
            ),
          },
        },
      },
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      } as unknown as CommIdentityDocument,
    );

    expect(parsed.bodyHtml).toContain('<img');
    expect(parsed.bodyHtml).toContain('https://cdn.example.com/img.png');
  });

  it('parseGmailMessage returns the expected message shape for multipart Gmail payloads', () => {
    const parseGmailMessage = (
      service as unknown as {
        parseGmailMessage: (
          raw: Record<string, unknown>,
          identity: CommIdentityDocument,
        ) => {
          organizationId: string;
          gmailThreadId: string;
          gmailMessageId: string;
          identityId: string;
          from: { email: string; name?: string };
          to: Array<{ email: string; name?: string }>;
          cc: Array<{ email: string; name?: string }>;
          subject?: string;
          bodyText?: string;
          bodyHtml?: string;
          attachments: Array<{
            filename: string;
            mimeType: string;
            size: number;
            gmailAttachmentId?: string;
          }>;
          isRead: boolean;
          isSentByIdentity: boolean;
          gmailLabels: string[];
        };
      }
    ).parseGmailMessage.bind(service);

    const parsed = parseGmailMessage(
      {
        id: 'gmail-message-4',
        threadId: 'gmail-thread-4',
        labelIds: ['INBOX', 'UNREAD'],
        payload: {
          headers: [
            { name: 'From', value: 'Client <client@example.com>' },
            { name: 'To', value: 'Agent <agent@example.com>' },
            { name: 'Cc', value: 'Manager <manager@example.com>' },
            { name: 'Subject', value: 'Quarterly update' },
            { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Plain body').toString('base64url'),
              },
            },
            {
              mimeType: 'text/html',
              body: {
                data: Buffer.from('<h1>Quarterly update</h1><p>HTML body</p>').toString('base64url'),
              },
            },
            {
              filename: 'report.pdf',
              mimeType: 'application/pdf',
              body: {
                attachmentId: 'attachment-1',
                size: 2048,
              },
            },
          ],
        },
      },
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      } as unknown as CommIdentityDocument,
    );

    expect(parsed).toMatchObject({
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-4',
      gmailMessageId: 'gmail-message-4',
      identityId: 'identity-1',
      from: { email: 'client@example.com', name: 'Client' },
      to: [{ email: 'agent@example.com', name: 'Agent' }],
      cc: [{ email: 'manager@example.com', name: 'Manager' }],
      subject: 'Quarterly update',
      bodyText: 'Plain body',
      isRead: false,
      isSentByIdentity: false,
      deliveryState: 'none',
      gmailLabels: ['INBOX', 'UNREAD'],
    });
    expect(parsed.bodyHtml).toContain('<h1>Quarterly update</h1>');
    expect(parsed.attachments).toEqual([
      {
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        gmailAttachmentId: 'attachment-1',
      },
    ]);
  });

  it('throws GMAIL_RATE_LIMITED with the parsed retry-after value when Gmail returns 429', async () => {
    gmailApi.listMessages.mockRejectedValue({
      response: {
        status: 429,
        headers: {
          'retry-after': '120',
        },
      },
    });

    await expect(
      service.performInitialSync({
        _id: 'identity-1',
        organizationId: 'org-1',
      } as unknown as CommIdentityDocument),
    ).rejects.toMatchObject({
      message: 'GMAIL_RATE_LIMITED',
      retryAfterSeconds: 120,
    });
  });

  it('includes requestId in BullMQ job data when triggering incremental sync', async () => {
    await service.triggerIncrementalSyncForIdentity('identity-1', 'org-1', 'req-123');

    expect(syncQueue.add).toHaveBeenCalledWith(
      'incremental-sync',
      {
        identityId: 'identity-1',
        requestId: 'req-123',
      },
      { attempts: 2, backoff: { type: 'fixed', delay: 10000 } },
    );
  });
});
