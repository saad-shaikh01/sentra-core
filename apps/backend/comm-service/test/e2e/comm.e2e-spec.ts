import { ConfigService } from '@nestjs/config';
import { UserRole } from '@sentra-core/types';
import { Model } from 'mongoose';
import { CommCacheService } from '../../src/common/cache/comm-cache.service';
import { TokenEncryptionService } from '../../src/common/crypto/token-encryption.service';
import { MetricsService } from '../../src/common/metrics/metrics.service';
import { CommEntityLinkDocument } from '../../src/schemas/comm-entity-link.schema';
import { CommIdentityDocument } from '../../src/schemas/comm-identity.schema';
import { CommMessageDocument } from '../../src/schemas/comm-message.schema';
import { CommSyncJobDocument } from '../../src/schemas/comm-sync-job.schema';
import { CommThreadDocument } from '../../src/schemas/comm-thread.schema';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AttachmentsService } from '../../src/modules/attachments/attachments.service';
import { EntityLinksService } from '../../src/modules/entity-links/entity-links.service';
import { IdentitiesService } from '../../src/modules/identities/identities.service';
import { MessagesService } from '../../src/modules/messages/messages.service';
import { IntelligenceService } from '../../src/modules/intelligence/intelligence.service';
import { GmailApiService } from '../../src/modules/sync/gmail-api.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { TrackingService } from '../../src/modules/tracking/tracking.service';
import { ThreadsService } from '../../src/modules/threads/threads.service';

type TokensHandler = (tokens: {
  access_token?: string | null;
  expiry_date?: number | null;
}) => Promise<void>;

const mockOAuthEventHandlers: Record<string, TokensHandler> = {};
const mockSetCredentials = jest.fn();
const mockOn = jest.fn((event: string, handler: TokensHandler) => {
  mockOAuthEventHandlers[event] = handler;
});

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: mockSetCredentials,
        on: mockOn,
      })),
    },
    gmail: jest.fn(),
  },
}));

type EntityRef = {
  email: string;
  name?: string;
};

type AttachmentRecord = {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
  s3Key?: string;
};

type IdentityRecord = {
  _id: string;
  organizationId: string;
  userId: string;
  email: string;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt?: Date;
  sendAsAliases: Array<{ email: string; isDefault?: boolean }>;
  isActive: boolean;
  syncState?: {
    status?: string;
    lastError?: string;
    initialSyncDone?: boolean;
    fullBackfillDone?: boolean;
    historyId?: string;
    lastSyncAt?: Date;
  };
};

type ThreadRecord = {
  _id: string;
  organizationId: string;
  identityId: string;
  gmailThreadId: string;
  subject?: string;
  snippet?: string;
  participants: EntityRef[];
  entityLinks: Array<{
    entityType: string;
    entityId: string;
    linkedBy: string;
    linkedAt?: Date;
  }>;
  messageCount: number;
  hasUnread: boolean;
  hasSent: boolean;
  replyState?: string;
  deliveryState?: string;
  bounceState?: string;
  lastOutboundAt?: Date;
  lastInboundAt?: Date;
  repliedAt?: Date;
  bounceDetectedAt?: Date;
  bounceReason?: string;
  lastSendFailureAt?: Date;
  lastSendFailureReason?: string;
  isArchived: boolean;
  lastMessageAt?: Date;
  toObject?: () => ThreadRecord;
};

type MessageRecord = {
  _id: string;
  organizationId: string;
  gmailThreadId: string;
  gmailMessageId: string;
  identityId: string;
  from: EntityRef;
  to: EntityRef[];
  cc: EntityRef[];
  bcc: EntityRef[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments: AttachmentRecord[];
  sentAt?: Date;
  gmailInternalDate?: Date;
  rfcMessageId?: string;
  inReplyToRfcMessageId?: string;
  referenceIds?: string[];
  headers?: Record<string, string>;
  isRead: boolean;
  isSentByIdentity: boolean;
  isBounceDetected?: boolean;
  deliveryState?: string;
  bounceDetectedAt?: Date;
  bounceReason?: string;
  sentByUserId?: string;
  gmailLabels: string[];
};

type EntityLinkRecord = {
  _id: string;
  organizationId: string;
  gmailThreadId: string;
  entityType: string;
  entityId: string;
  linkedBy: string;
  linkedByUserId: string;
};

type QueryChain<T> = {
  sort: jest.MockedFunction<(arg: Record<string, 1 | -1>) => QueryChain<T>>;
  skip: jest.MockedFunction<(arg: number) => QueryChain<T>>;
  limit: jest.MockedFunction<(arg: number) => QueryChain<T>>;
  select: jest.MockedFunction<(arg: string) => QueryChain<T>>;
  lean: jest.MockedFunction<() => QueryChain<T>>;
  exec: jest.MockedFunction<() => Promise<T>>;
  then?: Promise<T>['then'];
  catch?: Promise<T>['catch'];
};

function pathValues(source: unknown, path: string): unknown[] {
  const segments = path.split('.');
  let current: unknown[] = [source];

  for (const segment of segments) {
    const next: unknown[] = [];
    for (const value of current) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && segment in item) {
            next.push((item as Record<string, unknown>)[segment]);
          }
        }
      } else if (value && typeof value === 'object' && segment in value) {
        next.push((value as Record<string, unknown>)[segment]);
      }
    }
    current = next;
  }

  return current;
}

function matchesQuery(source: Record<string, unknown>, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') {
      const branches = expected as Record<string, unknown>[];
      return branches.some((branch) => matchesQuery(source, branch));
    }

    const values = pathValues(source, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        const allowed = (expected as { $in: unknown[] }).$in;
        return values.some((value) => allowed.includes(value));
      }
      if ('$ne' in expected) {
        const disallowed = (expected as { $ne: unknown }).$ne;
        return values.every((value) => value !== disallowed);
      }
    }

    return values.some((value) => value === expected);
  });
}

function getByPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function setByPath(source: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current: Record<string, unknown> = source;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = current[segment];

    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

function applyUpdate(
  target: Record<string, unknown>,
  update: Record<string, unknown>,
  isInsert = false,
): void {
  if (update.$set && typeof update.$set === 'object') {
    for (const [path, value] of Object.entries(update.$set as Record<string, unknown>)) {
      setByPath(target, path, value);
    }
  }

  if (isInsert && update.$setOnInsert && typeof update.$setOnInsert === 'object') {
    for (const [path, value] of Object.entries(update.$setOnInsert as Record<string, unknown>)) {
      setByPath(target, path, value);
    }
  }

  if (update.$inc && typeof update.$inc === 'object') {
    for (const [path, value] of Object.entries(update.$inc as Record<string, number>)) {
      const current = getByPath(target, path);
      setByPath(target, path, Number(current ?? 0) + value);
    }
  }

  if (update.$max && typeof update.$max === 'object') {
    for (const [path, value] of Object.entries(update.$max as Record<string, unknown>)) {
      const current = getByPath(target, path);
      if (current === undefined || current === null || current < value) {
        setByPath(target, path, value);
      }
    }
  }

  if (update.$addToSet && typeof update.$addToSet === 'object') {
    for (const [path, rawValue] of Object.entries(update.$addToSet as Record<string, unknown>)) {
      const currentValue = getByPath(target, path);
      const currentArray = Array.isArray(currentValue) ? currentValue : [];
      const additions =
        rawValue && typeof rawValue === 'object' && '$each' in rawValue
          ? ((rawValue as { $each: unknown[] }).$each ?? [])
          : [rawValue];

      for (const addition of additions) {
        const exists = currentArray.some(
          (item) => JSON.stringify(item) === JSON.stringify(addition),
        );
        if (!exists) {
          currentArray.push(addition);
        }
      }

      setByPath(target, path, currentArray);
    }
  }
}

function createArrayQuery<T extends Record<string, unknown>>(items: T[]): QueryChain<T[]> {
  let working = [...items];
  let projectedFields: string[] | null = null;
  let leanResult = false;

  const query = {
    sort: jest.fn((sortSpec: Record<string, 1 | -1>) => {
      const [[field, direction]] = Object.entries(sortSpec) as [string, 1 | -1][];
      working = [...working].sort((left, right) => {
        const leftValue = pathValues(left, field)[0];
        const rightValue = pathValues(right, field)[0];
        if (leftValue === rightValue) return 0;
        if (leftValue === undefined) return 1;
        if (rightValue === undefined) return -1;
        return leftValue! > rightValue! ? -direction : direction;
      });
      return query;
    }),
    skip: jest.fn((amount: number) => {
      working = working.slice(amount);
      return query;
    }),
    limit: jest.fn((amount: number) => {
      working = working.slice(0, amount);
      return query;
    }),
    select: jest.fn((fields: string) => {
      projectedFields = fields
        .split(/\s+/)
        .filter(Boolean)
        .filter((field) => !field.startsWith('-'));
      return query;
    }),
    lean: jest.fn(() => {
      leanResult = true;
      return query;
    }),
    exec: jest.fn(async () => {
      const projected = projectedFields
        ? working.map((item) =>
            Object.fromEntries(projectedFields!.map((field) => [field, getByPath(item, field)])) as T,
          )
        : working;

      return leanResult ? projected.map((item) => ({ ...item })) : projected;
    }),
  } satisfies QueryChain<T[]>;

  query.then = (onFulfilled, onRejected) => query.exec().then(onFulfilled, onRejected);
  query.catch = (onRejected) => query.exec().catch(onRejected);

  return query;
}

function createSingleQuery<T extends Record<string, unknown> | Record<string, unknown>[] | null>(
  item: T,
) {
  let selectedFieldNames: string[] | null = null;
  let sortSpec: Record<string, 1 | -1> | null = null;

  const query = {
    sort: jest.fn((nextSortSpec: Record<string, 1 | -1>) => {
      sortSpec = nextSortSpec;
      return query;
    }),
    select: jest.fn((fields: string) => {
      selectedFieldNames = fields.split(/\s+/).filter(Boolean);
      return query;
    }),
    exec: jest.fn(async () => {
      let working = item;
      if (Array.isArray(working) && sortSpec) {
        const [[field, direction]] = Object.entries(sortSpec) as [string, 1 | -1][];
        working = [...working].sort((left, right) => {
          const leftValue = pathValues(left, field)[0];
          const rightValue = pathValues(right, field)[0];
          if (leftValue === rightValue) return 0;
          if (leftValue === undefined) return 1;
          if (rightValue === undefined) return -1;
          return leftValue! > rightValue! ? -direction : direction;
        })[0] as T;
      }

      if (!working) {
        return null;
      }

      if (!selectedFieldNames) {
        return working;
      }

      return Object.fromEntries(
        selectedFieldNames.map((field) => [field, getByPath(working as Record<string, unknown>, field)]),
      ) as T;
    }),
  };

  query.then = (onFulfilled, onRejected) => query.exec().then(onFulfilled, onRejected);
  query.catch = (onRejected) => query.exec().catch(onRejected);

  return query;
}

function asThreadDocument(thread: ThreadRecord): CommThreadDocument {
  thread.toObject = () => ({
    ...thread,
    participants: [...thread.participants],
    entityLinks: [...thread.entityLinks],
  });
  return thread as unknown as CommThreadDocument;
}

function createHarness() {
  const identities: IdentityRecord[] = [];
  const threads: ThreadRecord[] = [];
  const messages: MessageRecord[] = [];
  const entityLinks: EntityLinkRecord[] = [];
  const queuedJobs: Array<{ name: string; data: Record<string, unknown> }> = [];

  const identityModel = {
    find: jest.fn((query: Record<string, unknown>) =>
      createArrayQuery(
        identities.filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query)),
      ),
    ),
    findOne: jest.fn((query: Record<string, unknown>) => {
      const match =
        identities.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;
      return createSingleQuery(match as unknown as Record<string, unknown> | null);
    }),
    countDocuments: jest.fn(async (query: Record<string, unknown>) =>
      identities.filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query)).length,
    ),
    findByIdAndUpdate: jest.fn(async (id: string, update: Record<string, unknown>) => {
      const identity = identities.find((item) => item._id === id);
      if (!identity) {
        return null;
      }

      applyUpdate(identity as unknown as Record<string, unknown>, update);
      return identity;
    }),
  };

  const threadModel = {
    find: jest.fn((query: Record<string, unknown>) =>
      createArrayQuery(
        threads
          .filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query))
          .map((item) => item as unknown as Record<string, unknown>),
      ),
    ),
    findOne: jest.fn((query: Record<string, unknown>) => {
      const match =
        threads.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;
      return createSingleQuery(
        match ? (asThreadDocument(match) as unknown as Record<string, unknown>) : null,
      );
    }),
    findOneAndUpdate: jest.fn((query: Record<string, unknown>, update: Record<string, unknown>) => {
      let thread =
        threads.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;

      if (!thread && update.$setOnInsert) {
        thread = {
          _id: `thread-${threads.length + 1}`,
          organizationId: '',
          identityId: '',
          gmailThreadId: '',
          participants: [],
          entityLinks: [],
          messageCount: 0,
          hasUnread: false,
          hasSent: false,
          isArchived: false,
        };
        applyUpdate(thread as unknown as Record<string, unknown>, update, true);
        threads.push(thread);
      } else if (thread) {
        applyUpdate(thread as unknown as Record<string, unknown>, update);
      }

      return {
        exec: jest.fn().mockResolvedValue(thread ? asThreadDocument(thread) : null),
      };
    }),
    findByIdAndUpdate: jest.fn(async (id: string, update: Record<string, unknown>) => {
      const thread = threads.find((item) => item._id === id);
      if (!thread) {
        return null;
      }

      applyUpdate(thread as unknown as Record<string, unknown>, update);
      return asThreadDocument(thread);
    }),
    countDocuments: jest.fn(async (query: Record<string, unknown>) =>
      threads.filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query)).length,
    ),
    updateOne: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      const thread =
        threads.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;
      if (!thread) {
        return { acknowledged: true, modifiedCount: 0 };
      }

      applyUpdate(thread as unknown as Record<string, unknown>, update);
      return { acknowledged: true, modifiedCount: 1 };
    }),
  };

  const messageModel = {
    find: jest.fn((query: Record<string, unknown>) =>
      createArrayQuery(
        messages
          .filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query))
          .map((item) => item as unknown as Record<string, unknown>),
      ),
    ),
    findOne: jest.fn((query: Record<string, unknown>) => {
      const matches = messages.filter((item) =>
        matchesQuery(item as unknown as Record<string, unknown>, query),
      );
      const match =
        matches.length > 1
          ? (matches as unknown as Record<string, unknown>[])
          : ((matches[0] ?? null) as unknown as Record<string, unknown> | null);
      return createSingleQuery(match);
    }),
    exists: jest.fn(async (query: Record<string, unknown>) =>
      messages.some((item) => matchesQuery(item as unknown as Record<string, unknown>, query)),
    ),
    findOneAndUpdate: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      let message =
        messages.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;

      if (!message && update.$setOnInsert) {
        message = {
          _id: `message-${messages.length + 1}`,
          organizationId: '',
          gmailThreadId: '',
          gmailMessageId: '',
          identityId: '',
          from: { email: '' },
          to: [],
          cc: [],
          bcc: [],
          attachments: [],
          isRead: false,
          isSentByIdentity: false,
          gmailLabels: [],
        };
        applyUpdate(message as unknown as Record<string, unknown>, update, true);
        if (update.$set) {
          applyUpdate(message as unknown as Record<string, unknown>, update);
        }
        messages.push(message);
      } else if (message && update.$set) {
        applyUpdate(message as unknown as Record<string, unknown>, update);
      }

      return message as unknown as CommMessageDocument | null;
    }),
    countDocuments: jest.fn(async (query: Record<string, unknown>) =>
      messages.filter((item) => matchesQuery(item as unknown as Record<string, unknown>, query)).length,
    ),
    updateMany: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      const matching = messages.filter((item) =>
        matchesQuery(item as unknown as Record<string, unknown>, query),
      );
      for (const message of matching) {
        applyUpdate(message as unknown as Record<string, unknown>, update);
      }

      return { acknowledged: true, modifiedCount: matching.length };
    }),
    findByIdAndUpdate: jest.fn(async (id: string, update: Record<string, unknown>) => {
      const message = messages.find((item) => item._id === id);
      if (!message) {
        return null;
      }

      applyUpdate(message as unknown as Record<string, unknown>, update);
      return message as unknown as CommMessageDocument;
    }),
  };

  const entityLinkModel = {
    findOneAndUpdate: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      let entityLink =
        entityLinks.find((item) => matchesQuery(item as unknown as Record<string, unknown>, query)) ??
        null;

      if (!entityLink && update.$setOnInsert) {
        entityLink = {
          _id: `entity-link-${entityLinks.length + 1}`,
          ...(update.$setOnInsert as Omit<EntityLinkRecord, '_id'>),
        };
        entityLinks.push(entityLink);
      }

      return entityLink as unknown as CommEntityLinkDocument | null;
    }),
  };

  const syncQueue = {
    add: jest.fn(async (name: string, data: Record<string, unknown>) => {
      queuedJobs.push({ name, data });
      return { id: `${name}-${queuedJobs.length}` };
    }),
  };

  return {
    identities,
    threads,
    messages,
    entityLinks,
    queuedJobs,
    identityModel,
    threadModel,
    messageModel,
    entityLinkModel,
    syncQueue,
  };
}

describe('COMM regression e2e', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(mockOAuthEventHandlers)) {
      delete mockOAuthEventHandlers[key];
    }
    mockSetCredentials.mockReset();
    mockOn.mockClear();
  });

  it('completes an initial sync cycle, persists messages, sets hasSent, and auto-links the thread', async () => {
    const harness = createHarness();
    harness.identities.push({
      _id: 'identity-1',
      organizationId: 'org-1',
      userId: 'user-1',
      email: 'agent@example.com',
      sendAsAliases: [{ email: 'agent@example.com', isDefault: true }],
      isActive: true,
      syncState: { initialSyncDone: false, fullBackfillDone: false, status: 'active' },
    });

    const entityLinksService = new EntityLinksService(
      harness.entityLinkModel as unknown as Model<CommEntityLinkDocument>,
      harness.threadModel as unknown as Model<CommThreadDocument>,
      {
        lookupByEmails: jest.fn().mockResolvedValue([
          {
            id: 'client-1',
            email: 'client@example.com',
            entityType: 'client',
          },
        ]),
      } as never,
    );

    const gmailApi = {
      getGmailClient: jest.fn().mockResolvedValue({}),
      getCurrentHistoryId: jest.fn().mockResolvedValue('history-1'),
      listMessages: jest.fn().mockResolvedValue({
        messages: [{ id: 'gmail-message-sent' }, { id: 'gmail-message-inbound' }],
        nextPageToken: undefined,
      }),
      getMessage: jest.fn(async (_gmail: unknown, messageId: string) => {
        if (messageId === 'gmail-message-sent') {
          return {
            id: 'gmail-message-sent',
            threadId: 'gmail-thread-1',
            labelIds: ['SENT'],
            payload: {
              headers: [
                { name: 'From', value: 'Agent <agent@example.com>' },
                { name: 'To', value: 'Client <client@example.com>' },
                { name: 'Subject', value: 'Quarterly follow-up' },
                { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
              ],
              mimeType: 'text/plain',
              body: {
                data: Buffer.from('Outbound hello').toString('base64url'),
              },
            },
          };
        }

        return {
          id: 'gmail-message-inbound',
          threadId: 'gmail-thread-1',
          labelIds: ['INBOX', 'UNREAD'],
          payload: {
            headers: [
              { name: 'From', value: 'Client <client@example.com>' },
              { name: 'To', value: 'Agent <agent@example.com>' },
              { name: 'Subject', value: 'Quarterly follow-up' },
              { name: 'Date', value: 'Wed, 11 Mar 2026 11:00:00 +0000' },
            ],
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Inbound reply').toString('base64url'),
            },
          },
        };
      }),
    };
    const trackingService = {
      recordReplyDetected: jest.fn().mockResolvedValue(undefined),
      recordBounceDetected: jest.fn().mockResolvedValue(undefined),
    };
    const intelligenceService = {
      refreshThreadIntelligence: jest.fn().mockResolvedValue(null),
    };

    const service = new SyncService(
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      harness.threadModel as unknown as Model<CommThreadDocument>,
      harness.messageModel as unknown as Model<CommMessageDocument>,
      {} as Model<CommSyncJobDocument>,
      harness.syncQueue as never,
      { add: jest.fn() } as never,
      gmailApi as unknown as GmailApiService,
      trackingService as unknown as TrackingService,
      intelligenceService as unknown as IntelligenceService,
      undefined,
      undefined,
      entityLinksService,
    );

    const processed = await service.performInitialSync(
      harness.identities[0] as unknown as CommIdentityDocument,
      'req-sync-1',
    );

    for (const job of harness.queuedJobs.filter((queuedJob) => queuedJob.name === 'process-message')) {
      await service.processMessage(
        harness.identities[0] as unknown as CommIdentityDocument,
        String(job.data.messageId),
      );
    }

    expect(processed).toBe(2);
    expect(harness.messages).toHaveLength(2);
    expect(harness.threads).toHaveLength(1);
    expect(harness.threads[0]).toMatchObject({
      gmailThreadId: 'gmail-thread-1',
      hasSent: true,
      hasUnread: true,
      messageCount: 2,
      replyState: 'replied',
      deliveryState: 'sent',
    });
    expect(harness.threads[0].lastOutboundAt).toEqual(new Date('2026-03-11T10:00:00.000Z'));
    expect(harness.threads[0].lastInboundAt).toEqual(new Date('2026-03-11T11:00:00.000Z'));
    expect(harness.threads[0].repliedAt).toEqual(new Date('2026-03-11T11:00:00.000Z'));
    expect(harness.entityLinks).toEqual([
      expect.objectContaining({
        gmailThreadId: 'gmail-thread-1',
        entityType: 'client',
        entityId: 'client-1',
        linkedBy: 'AUTO',
      }),
    ]);
    expect(harness.threads[0].entityLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'client',
          entityId: 'client-1',
          linkedBy: 'AUTO',
        }),
      ]),
    );
  });

  it('sends a message, marks the thread read, and removes Gmail UNREAD while clearing hasUnread', async () => {
    const harness = createHarness();
    harness.identities.push({
      _id: 'identity-1',
      organizationId: 'org-1',
      userId: 'user-1',
      email: 'agent@example.com',
      sendAsAliases: [{ email: 'agent@example.com', isDefault: true }],
      isActive: true,
      syncState: { initialSyncDone: true, fullBackfillDone: false, status: 'active' },
    });

    const gmailSend = jest.fn().mockResolvedValue({
      data: {
        id: 'gmail-message-1',
        threadId: 'gmail-thread-1',
      },
    });
    const gmailModify = jest.fn().mockResolvedValue(undefined);

    const gmailApi = {
      getGmailClient: jest.fn().mockResolvedValue({
        users: {
          messages: {
            send: gmailSend,
          },
          threads: {
            modify: gmailModify,
          },
        },
      }),
      getMessage: jest.fn().mockResolvedValue({
        id: 'gmail-message-1',
        threadId: 'gmail-thread-1',
        internalDate: String(new Date('2026-03-11T10:00:00.000Z').getTime()),
        labelIds: ['SENT'],
        payload: {
          headers: [
            { name: 'From', value: 'Agent <agent@example.com>' },
            { name: 'To', value: 'Client <client@example.com>' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
            { name: 'Message-ID', value: '<sent-1@example.com>' },
          ],
          mimeType: 'text/plain',
          body: {
            data: Buffer.from('Hello there').toString('base64url'),
          },
        },
      }),
    };

    gmailApi.getMessage.mockImplementation(async (_gmail: unknown, messageId: string) => {
      if (messageId === 'gmail-message-1') {
        return {
          id: 'gmail-message-1',
          threadId: 'gmail-thread-1',
          internalDate: String(new Date('2026-03-11T10:00:00.000Z').getTime()),
          labelIds: ['SENT'],
          payload: {
            headers: [
              { name: 'From', value: 'Agent <agent@example.com>' },
              { name: 'To', value: 'Client <client@example.com>' },
              { name: 'Subject', value: 'Hello' },
              { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
              { name: 'Message-ID', value: '<sent-1@example.com>' },
            ],
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Hello there').toString('base64url'),
            },
          },
        };
      }

      return {
        id: 'gmail-message-2',
        threadId: 'gmail-thread-1',
        internalDate: String(new Date('2026-03-11T11:00:00.000Z').getTime()),
        labelIds: ['INBOX', 'UNREAD'],
        payload: {
          headers: [
            { name: 'From', value: 'Client <client@example.com>' },
            { name: 'To', value: 'Agent <agent@example.com>' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Date', value: 'Wed, 11 Mar 2026 11:00:00 +0000' },
            { name: 'In-Reply-To', value: '<sent-1@example.com>' },
            { name: 'References', value: '<sent-1@example.com>' },
          ],
          mimeType: 'text/plain',
          body: {
            data: Buffer.from('Reply body').toString('base64url'),
          },
        },
      };
    });
    const trackingService = {
      prepareOpenTracking: jest.fn().mockResolvedValue(null),
      injectOpenTrackingPixel: jest.fn((bodyHtml: string) => bodyHtml),
      activateOpenTracking: jest.fn().mockResolvedValue(undefined),
      abandonPreparedOpenTracking: jest.fn().mockResolvedValue(undefined),
      recordSentEvent: jest.fn().mockResolvedValue(undefined),
      recordSendFailedEvent: jest.fn().mockResolvedValue(undefined),
      recordReplyDetected: jest.fn().mockResolvedValue(undefined),
      recordBounceDetected: jest.fn().mockResolvedValue(undefined),
    };
    const intelligenceService = {
      refreshThreadIntelligence: jest.fn().mockResolvedValue(null),
    };

    const syncService = new SyncService(
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      harness.threadModel as unknown as Model<CommThreadDocument>,
      harness.messageModel as unknown as Model<CommMessageDocument>,
      {} as Model<CommSyncJobDocument>,
      harness.syncQueue as never,
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

    const messagesService = new MessagesService(
      harness.messageModel as unknown as Model<CommMessageDocument>,
      harness.threadModel as unknown as Model<CommThreadDocument>,
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      harness.entityLinkModel as unknown as Model<CommEntityLinkDocument>,
      {
        isPrivileged: jest.fn((role: UserRole) => role === UserRole.ADMIN || role === UserRole.OWNER),
        resolveUserIdentityIds: jest.fn().mockResolvedValue(['identity-1']),
      } as never,
      gmailApi as unknown as GmailApiService,
      syncService,
      trackingService as unknown as TrackingService,
      {
        fetchAttachmentBuffers: jest.fn().mockResolvedValue([]),
      } as unknown as AttachmentsService,
      {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
      undefined,
      undefined,
    );

    const threadsService = new ThreadsService(
      harness.threadModel as unknown as Model<CommThreadDocument>,
      harness.messageModel as unknown as Model<CommMessageDocument>,
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      gmailApi as unknown as GmailApiService,
    );

    await messagesService.sendMessage('org-1', 'user-1', {
      identityId: 'identity-1',
      to: ['client@example.com'],
      subject: 'Hello',
      bodyText: 'Hello there',
    });

    await syncService.processMessage(
      harness.identities[0] as unknown as CommIdentityDocument,
      'gmail-message-2',
    );

    expect(harness.messages[0]).toMatchObject({
      gmailMessageId: 'gmail-message-1',
      rfcMessageId: 'sent-1@example.com',
      deliveryState: 'sent',
      sentByUserId: 'user-1',
    });
    expect(harness.threads[0].hasUnread).toBe(true);
    expect(harness.threads[0].replyState).toBe('replied');

    await threadsService.markThreadRead(
      'org-1',
      'gmail-thread-1',
      'user-1',
      UserRole.FRONTSELL_AGENT,
    );

    expect(gmailModify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'gmail-thread-1',
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
    expect(harness.threads[0].hasUnread).toBe(false);
    expect(harness.messages.every((message) => message.isRead)).toBe(true);
  });

  it('marks the identity degraded when token refresh persistence fails', async () => {
    const harness = createHarness();
    harness.identities.push({
      _id: 'identity-1',
      organizationId: 'org-1',
      userId: 'user-1',
      email: 'agent@example.com',
      encryptedAccessToken: 'encrypted-access',
      encryptedRefreshToken: 'encrypted-refresh',
      tokenExpiresAt: new Date('2026-03-11T00:00:00.000Z'),
      sendAsAliases: [{ email: 'agent@example.com', isDefault: true }],
      isActive: true,
      syncState: { status: 'active', initialSyncDone: true, fullBackfillDone: false },
    });

    harness.identityModel.findByIdAndUpdate.mockImplementation(
      async (id: string, update: Record<string, unknown>) => {
        const identity = harness.identities.find((item) => item._id === id);
        if (!identity) {
          return null;
        }

        const setPayload = update.$set as Record<string, unknown> | undefined;
        if (setPayload?.encryptedAccessToken) {
          throw new Error('write failed');
        }

        applyUpdate(identity as unknown as Record<string, unknown>, update);
        return identity;
      },
    );

    const identitiesService = new IdentitiesService(
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      } as unknown as CommCacheService,
      {
        encrypt: jest.fn().mockReturnValue('encrypted-token'),
        decrypt: jest.fn((value: string) => value.replace('encrypted-', '')),
      } as unknown as TokenEncryptionService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
    );

    jest.spyOn(identitiesService, 'getDecryptedCredentials').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    const gmailApiService = new GmailApiService(
      harness.identityModel as unknown as Model<CommIdentityDocument>,
      identitiesService,
      {
        encrypt: jest.fn().mockReturnValue('encrypted-token'),
      } as unknown as TokenEncryptionService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      {
        incrementTokenRefresh: jest.fn(),
      } as unknown as MetricsService,
    );

    await gmailApiService.getAuthenticatedClient(
      harness.identities[0] as unknown as CommIdentityDocument,
    );

    await mockOAuthEventHandlers.tokens({
      access_token: 'new-access-token',
      expiry_date: Date.now(),
    });

    expect(harness.identities[0].syncState).toMatchObject({
      status: 'error',
      lastError: 'write failed',
    });
  });
});
