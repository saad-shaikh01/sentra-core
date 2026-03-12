import { UserRole } from '@sentra-core/types';
import { Model } from 'mongoose';
import { CommEntityLinkDocument } from '../../schemas/comm-entity-link.schema';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { AuditService } from '../audit/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { IdentitiesService } from '../identities/identities.service';
import { GmailApiService } from '../sync/gmail-api.service';
import { ThreadsService } from '../threads/threads.service';
import { MessagesService } from './messages.service';

type SortDirection = 1 | -1;

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

function createArrayQuery<T extends Record<string, unknown>>(items: T[]) {
  let working = [...items];
  let projectedFields: string[] | null = null;
  let leanResult = false;

  const query = {
    sort: jest.fn((sortSpec: Record<string, SortDirection>) => {
      const [[field, direction]] = Object.entries(sortSpec) as [string, SortDirection][];
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
      projectedFields = fields.split(/\s+/).filter(Boolean);
      return query;
    }),
    lean: jest.fn(() => {
      leanResult = true;
      return query;
    }),
    exec: jest.fn(async () => {
      const projected = projectedFields
        ? working.map((item) =>
            Object.fromEntries(
              projectedFields!.map((field) => [field, (item as Record<string, unknown>)[field]]),
            ) as T,
          )
        : working;

      return leanResult ? projected.map((item) => ({ ...item })) : projected;
    }),
  };

  return query;
}

function createSingleQuery<T extends Record<string, unknown> | null>(item: T) {
  let selectedField: string | null = null;

  const query = {
    select: jest.fn((field: string) => {
      selectedField = field;
      return query;
    }),
    exec: jest.fn(async () => {
      if (!item) return null;
      if (!selectedField) return item;
      return { [selectedField]: item[selectedField] } as T;
    }),
  };

  return query;
}

describe('MessagesService', () => {
  let messagesService: MessagesService;
  let threadsService: ThreadsService;
  let gmailSendMock: jest.Mock;

  let threadRecords: Array<Record<string, unknown>>;
  let messageRecords: Array<Record<string, unknown>>;
  let identityRecords: Array<Record<string, unknown>>;
  let entityLinkRecords: Array<Record<string, unknown>>;

  let messageModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
  };
  let threadModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let identityModel: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let entityLinkModel: {
    findOneAndUpdate: jest.Mock;
  };
  let identitiesService: {
    isPrivileged: jest.Mock;
    resolveUserIdentityIds: jest.Mock;
  };
  let attachmentsService: {
    fetchAttachmentBuffers: jest.Mock;
  };
  let buildMimeSpy: jest.SpyInstance<Promise<string>, [unknown]>;

  beforeEach(() => {
    threadRecords = [];
    messageRecords = [];
    entityLinkRecords = [];
    identityRecords = [
      {
        _id: 'identity-1',
        organizationId: 'org-1',
        email: 'agent@example.com',
        sendAsAliases: [{ email: 'agent@example.com', isDefault: true }],
        isActive: true,
      },
    ];

    messageModel = {
      find: jest.fn((query: Record<string, unknown>) =>
        createArrayQuery(messageRecords.filter((item) => matchesQuery(item, query))),
      ),
      countDocuments: jest.fn(async (query: Record<string, unknown>) =>
        messageRecords.filter((item) => matchesQuery(item, query)).length,
      ),
      findOneAndUpdate: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        let existing = messageRecords.find((item) => matchesQuery(item, query));
        if (!existing) {
          existing = {
            _id: `message-${messageRecords.length + 1}`,
            ...(update.$setOnInsert as Record<string, unknown>),
          };
          messageRecords.push(existing);
        }
        return existing;
      }),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createSingleQuery(
          messageRecords.find((item) => matchesQuery(item, query)) ?? null,
        ),
      ),
    };

    threadModel = {
      find: jest.fn((query: Record<string, unknown>) =>
        createArrayQuery(threadRecords.filter((item) => matchesQuery(item, query))),
      ),
      countDocuments: jest.fn(async (query: Record<string, unknown>) =>
        threadRecords.filter((item) => matchesQuery(item, query)).length,
      ),
      findOneAndUpdate: jest.fn((query: Record<string, unknown>, update: Record<string, unknown>) => {
        const addToSet = update.$addToSet as
          | { participants?: { $each: Array<Record<string, unknown>> } }
          | undefined;
        let existing = threadRecords.find((item) => matchesQuery(item, query));
        if (!existing) {
          existing = {
            _id: `thread-${threadRecords.length + 1}`,
            messageCount: 0,
            participants: [],
            entityLinks: [],
            hasUnread: false,
            hasSent: false,
            isArchived: false,
            ...(update.$setOnInsert as Record<string, unknown>),
          };
          threadRecords.push(existing);
        }

        if (update.$inc) {
          for (const [key, value] of Object.entries(update.$inc as Record<string, number>)) {
            existing[key] = Number(existing[key] ?? 0) + value;
          }
        }

        if (update.$max) {
          for (const [key, value] of Object.entries(update.$max as Record<string, unknown>)) {
            const current = existing[key];
            if (!current || current < value) {
              existing[key] = value;
            }
          }
        }

        if (update.$set) {
          Object.assign(existing, update.$set as Record<string, unknown>);
        }

        if (addToSet?.participants?.$each) {
          const participants = addToSet.participants.$each;
          for (const participant of participants) {
            if (!(existing.participants as Array<Record<string, unknown>>).some((item) => item.email === participant.email)) {
              (existing.participants as Array<Record<string, unknown>>).push(participant);
            }
          }
        }

        return {
          exec: jest.fn().mockResolvedValue(existing),
        };
      }),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createSingleQuery(
          threadRecords.find((item) => matchesQuery(item, query)) ?? null,
        ),
      ),
      updateOne: jest.fn(async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        const addToSet = update.$addToSet as { entityLinks?: Record<string, unknown> } | undefined;
        const existing = threadRecords.find((item) => matchesQuery(item, query));
        if (existing && addToSet?.entityLinks) {
          const nextLink = addToSet.entityLinks;
          const links = existing.entityLinks as Array<Record<string, unknown>>;
          if (!links.some((link) => link.entityType === nextLink.entityType && link.entityId === nextLink.entityId)) {
            links.push(nextLink);
          }
        }
      }),
    };

    identityModel = {
      find: jest.fn((query: Record<string, unknown>) =>
        createArrayQuery(identityRecords.filter((item) => matchesQuery(item, query))),
      ),
      findOne: jest.fn((query: Record<string, unknown>) =>
        createSingleQuery(
          identityRecords.find((item) => matchesQuery(item, query)) ?? null,
        ),
      ),
    };

    entityLinkModel = {
      findOneAndUpdate: jest.fn(async (_query: Record<string, unknown>, update: Record<string, unknown>) => {
        entityLinkRecords.push(update.$setOnInsert as Record<string, unknown>);
      }),
    };

    identitiesService = {
      isPrivileged: jest.fn((role: UserRole) => role === UserRole.ADMIN || role === UserRole.OWNER),
      resolveUserIdentityIds: jest.fn(async () => ['identity-1']),
    };
    attachmentsService = {
      fetchAttachmentBuffers: jest.fn(async () => []),
    };

    gmailSendMock = jest.fn().mockResolvedValue({
      data: {
        id: 'gmail-message-1',
        threadId: 'gmail-thread-1',
      },
    });

    messagesService = new MessagesService(
      messageModel as unknown as Model<CommMessageDocument>,
      threadModel as unknown as Model<CommThreadDocument>,
      identityModel as unknown as Model<CommIdentityDocument>,
      entityLinkModel as unknown as Model<CommEntityLinkDocument>,
      identitiesService as unknown as IdentitiesService,
      {
        getGmailClient: jest.fn().mockResolvedValue({
          users: {
            messages: {
              send: gmailSendMock,
            },
          },
        }),
      } as unknown as GmailApiService,
      attachmentsService as unknown as AttachmentsService,
      {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
      undefined,
      undefined,
    );

    threadsService = new ThreadsService(
      threadModel as unknown as Model<CommThreadDocument>,
      messageModel as unknown as Model<CommMessageDocument>,
      identityModel as unknown as Model<CommIdentityDocument>,
      {} as GmailApiService,
    );

    buildMimeSpy = jest
      .spyOn(
        messagesService as unknown as { buildMime: (options: unknown) => Promise<string> },
        'buildMime',
      )
      .mockResolvedValue('raw-mime');
  });

  it('sendMessage marks the thread as sent and the thread appears in the sent filter', async () => {
    await messagesService.sendMessage('org-1', 'user-1', {
      identityId: 'identity-1',
      to: ['client@example.com'],
      subject: 'Hello',
      bodyText: 'Hello there',
    });

    expect(threadRecords).toHaveLength(1);
    expect(threadRecords[0].hasSent).toBe(true);

    const sentThreads = await threadsService.listThreads(
      'org-1',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, filter: 'sent' },
    );

    expect(sentThreads.data).toHaveLength(1);
    expect(sentThreads.data[0]).toMatchObject({
      gmailThreadId: 'gmail-thread-1',
      hasSent: true,
    });
  });

  it('sendMessage linked to an entity appears in the entity timeline as an outbound message', async () => {
    await messagesService.sendMessage('org-1', 'user-1', {
      identityId: 'identity-1',
      to: ['client@example.com'],
      subject: 'Hello',
      bodyText: 'Hello there',
      entityType: 'client',
      entityId: 'client-1',
    });

    const timeline = await messagesService.listMessages(
      'org-1',
      'user-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, entityType: 'client', entityId: 'client-1' },
    );

    expect(timeline.data).toHaveLength(1);
    expect(timeline.data[0]).toMatchObject({
      gmailThreadId: 'gmail-thread-1',
      isSentByIdentity: true,
      subject: 'Hello',
    });
  });

  it('buildMime includes attachments as multipart MIME parts', async () => {
    buildMimeSpy.mockRestore();

    const rawMime = await (
      messagesService as unknown as {
        buildMime: (options: {
          from: string;
          to: string[];
          subject: string;
          text?: string;
          attachments?: Array<{ buffer: Buffer; filename: string; mimeType: string }>;
        }) => Promise<string>;
      }
    ).buildMime({
      from: 'agent@example.com',
      to: ['client@example.com'],
      subject: 'Attached',
      text: 'See attachment',
      attachments: [
        {
          buffer: Buffer.from('hello attachment'),
          filename: 'notes.txt',
          mimeType: 'text/plain',
        },
      ],
    });

    const decoded = Buffer.from(rawMime, 'base64url').toString('utf8');

    expect(decoded).toContain('multipart/mixed');
    expect(decoded).toContain('filename=notes.txt');
    expect(decoded).toContain('aGVsbG8gYXR0YWNobWVudA==');
  });

  it('sendMessage with attachmentS3Keys sends MIME with a binary attachment part', async () => {
    buildMimeSpy.mockRestore();
    attachmentsService.fetchAttachmentBuffers.mockResolvedValue([
      {
        buffer: Buffer.from('attachment-bytes'),
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: 16,
        s3Key: 'org-1/outbound/invoice.pdf',
      },
    ]);

    await messagesService.sendMessage('org-1', 'user-1', {
      identityId: 'identity-1',
      to: ['client@example.com'],
      subject: 'Invoice',
      bodyText: 'See attached',
      attachmentS3Keys: ['org-1/outbound/invoice.pdf'],
    });

    expect(attachmentsService.fetchAttachmentBuffers).toHaveBeenCalledWith(['org-1/outbound/invoice.pdf']);
    const raw = gmailSendMock.mock.calls[0][0].requestBody.raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');

    expect(decoded).toContain('multipart/mixed');
    expect(decoded).toContain('filename=invoice.pdf');
    expect(decoded).toContain(Buffer.from('attachment-bytes').toString('base64'));
    expect(messageRecords[0].attachments).toEqual([
      {
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: 16,
        s3Key: 'org-1/outbound/invoice.pdf',
      },
    ]);
  });

  it('replyAll expands recipients to include the original to and cc addresses except the sending identity', async () => {
    messageRecords.push({
      _id: 'message-original',
      organizationId: 'org-1',
      gmailThreadId: 'gmail-thread-1',
      gmailMessageId: 'gmail-message-original',
      identityId: 'identity-1',
      from: { email: 'client@example.com' },
      to: [{ email: 'agent@example.com' }, { email: 'teammate@example.com' }],
      cc: [{ email: 'manager@example.com' }, { email: 'agent@example.com' }],
      bcc: [],
      subject: 'Hello',
      bodyText: 'Original body',
      attachments: [],
      isRead: false,
      isSentByIdentity: false,
      gmailLabels: ['INBOX'],
    });

    await messagesService.replyToMessage('org-1', 'user-1', 'gmail-message-original', {
      identityId: 'identity-1',
      bodyText: 'Replying to all',
      replyAll: true,
    });

    expect(buildMimeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['client@example.com', 'teammate@example.com'],
        cc: ['manager@example.com'],
      }),
    );
    expect(messageRecords[1]).toMatchObject({
      to: [{ email: 'client@example.com' }, { email: 'teammate@example.com' }],
      cc: [{ email: 'manager@example.com' }],
    });
  });
});
