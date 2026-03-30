import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { Model } from 'mongoose';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { GmailApiService } from '../sync/gmail-api.service';
import { ThreadsService } from './threads.service';

type QueryChain<T> = {
  sort: jest.MockedFunction<(arg: unknown) => QueryChain<T>>;
  skip: jest.MockedFunction<(arg: number) => QueryChain<T>>;
  limit: jest.MockedFunction<(arg: number) => QueryChain<T>>;
  select: jest.MockedFunction<(arg: string) => QueryChain<T>>;
  lean: jest.MockedFunction<() => QueryChain<T>>;
  exec: jest.MockedFunction<() => Promise<T>>;
};

function createQueryChain<T>(value: T): QueryChain<T> {
  const chain = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  } as QueryChain<T>;

  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);

  return chain;
}

describe('ThreadsService', () => {
  let service: ThreadsService;
  let threadModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let messageModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
    updateMany: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let identityModel: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let gmailApi: {
    getGmailClient: jest.Mock;
  };
  let gateway: {
    emitToOrg: jest.Mock;
  };
  let gmailModify: jest.Mock;

  beforeEach(() => {
    threadModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };
    messageModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      updateMany: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    identityModel = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    gmailModify = jest.fn().mockResolvedValue(undefined);
    gmailApi = {
      getGmailClient: jest.fn().mockResolvedValue({
        users: {
          threads: {
            modify: gmailModify,
          },
        },
      }),
    };
    gateway = {
      emitToOrg: jest.fn(),
    };

    service = new ThreadsService(
      threadModel as unknown as Model<CommThreadDocument>,
      messageModel as unknown as Model<CommMessageDocument>,
      identityModel as unknown as Model<CommIdentityDocument>,
      gmailApi as unknown as GmailApiService,
      gateway as never,
    );
  });

  it('listThreads returns only threads in the non-privileged user identity set', async () => {
    const identityQuery = createQueryChain([{ _id: 'identity-1' }, { _id: 'identity-2' }]);
    const threadsQuery = createQueryChain([{ _id: 'thread-1', identityId: 'identity-1' }]);
    identityModel.find.mockReturnValue(identityQuery);
    threadModel.find.mockReturnValue(threadsQuery);
    threadModel.countDocuments.mockResolvedValue(1);

    const result = await service.listThreads(
      'org-1',
      'user-1',
      UserRole.FRONTSELL_AGENT,
      { page: 1, limit: 20, filter: 'all' },
    );

    expect(identityModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      isActive: true,
    });
    expect(threadModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      identityId: { $in: ['identity-1', 'identity-2'] },
      isArchived: { $ne: true },
    });
    expect(result.data).toEqual([{ _id: 'thread-1', identityId: 'identity-1' }]);
  });

  it('listThreads returns all org threads for ADMIN users', async () => {
    const threadsQuery = createQueryChain([
      { _id: 'thread-1', identityId: 'identity-1' },
      { _id: 'thread-2', identityId: 'identity-2' },
    ]);
    threadModel.find.mockReturnValue(threadsQuery);
    threadModel.countDocuments.mockResolvedValue(2);

    const result = await service.listThreads(
      'org-1',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, filter: 'all', scope: 'all' },
    );

    expect(identityModel.find).not.toHaveBeenCalled();
    expect(threadModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      isArchived: { $ne: true },
    });
    expect(result.data).toHaveLength(2);
  });

  it('listThreads with the sent filter applies hasSent true and excludes archived threads', async () => {
    const threadsQuery = createQueryChain([
      { _id: 'thread-1', identityId: 'identity-1', hasSent: true, isArchived: false },
    ]);
    threadModel.find.mockReturnValue(threadsQuery);
    threadModel.countDocuments.mockResolvedValue(1);

    const result = await service.listThreads(
      'org-1',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, filter: 'sent', scope: 'all' },
    );

    expect(threadModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      hasSent: true,
      isArchived: { $ne: true },
    });
    expect(result.data).toEqual([
      { _id: 'thread-1', identityId: 'identity-1', hasSent: true, isArchived: false },
    ]);
  });

  it('listThreads with the opened filter applies hasOpenSignal true and excludes archived threads', async () => {
    const threadsQuery = createQueryChain([
      { _id: 'thread-1', identityId: 'identity-1', hasOpenSignal: true, isArchived: false },
    ]);
    threadModel.find.mockReturnValue(threadsQuery);
    threadModel.countDocuments.mockResolvedValue(1);

    const result = await service.listThreads(
      'org-1',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, filter: 'opened', scope: 'all' },
    );

    expect(threadModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      hasOpenSignal: true,
      isArchived: { $ne: true },
    });
    expect(result.data).toEqual([
      { _id: 'thread-1', identityId: 'identity-1', hasOpenSignal: true, isArchived: false },
    ]);
  });

  it('listThreads with the hot_lead filter prioritizes stored engagement queues', async () => {
    const threadsQuery = createQueryChain([
      { _id: 'thread-1', identityId: 'identity-1', hotLead: true, engagementScore: 82, isArchived: false },
    ]);
    threadModel.find.mockReturnValue(threadsQuery);
    threadModel.countDocuments.mockResolvedValue(1);

    const result = await service.listThreads(
      'org-1',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20, filter: 'hot_lead', scope: 'all' } as never,
    );

    expect(threadModel.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      hotLead: true,
      isArchived: { $ne: true },
    });
    expect(threadsQuery.sort).toHaveBeenCalledWith({
      hotLead: -1,
      engagementScore: -1,
      lastOpenedAt: -1,
      lastMessageAt: -1,
    });
    expect(result.data).toEqual([
      { _id: 'thread-1', identityId: 'identity-1', hotLead: true, engagementScore: 82, isArchived: false },
    ]);
  });

  it('getThread throws NotFoundException for a thread owned by another user', async () => {
    threadModel.findOne.mockReturnValue(
      createQueryChain({
        _id: 'thread-2',
        identityId: 'identity-2',
        gmailThreadId: 'gmail-thread-2',
        toObject: () => ({
          _id: 'thread-2',
          identityId: 'identity-2',
          gmailThreadId: 'gmail-thread-2',
        }),
      }),
    );
    identityModel.find.mockReturnValue(createQueryChain([{ _id: 'identity-1' }]));

    await expect(
      service.getThread('org-1', 'gmail-thread-2', 'user-1', UserRole.FRONTSELL_AGENT),
    ).rejects.toThrow(new NotFoundException('Thread gmail-thread-2 not found'));
  });

  it('getThread succeeds for ADMIN even when the thread belongs to another user', async () => {
    const thread = {
      _id: 'thread-2',
      identityId: 'identity-2',
      gmailThreadId: 'gmail-thread-2',
      replyState: 'waiting',
      deliveryState: 'bounce_detected',
      bounceState: 'detected',
      lastOutboundAt: '2026-03-20T09:00:00.000Z',
      toObject: () => ({
        _id: 'thread-2',
        identityId: 'identity-2',
        gmailThreadId: 'gmail-thread-2',
        replyState: 'waiting',
        deliveryState: 'bounce_detected',
        bounceState: 'detected',
        lastOutboundAt: '2026-03-20T09:00:00.000Z',
      }),
    };
    threadModel.findOne.mockReturnValue(createQueryChain(thread));
    messageModel.find.mockReturnValue(
      createQueryChain([{ _id: 'message-1', gmailThreadId: 'gmail-thread-2' }]),
    );

    const result = await service.getThread('org-1', 'gmail-thread-2', 'admin-1', UserRole.ADMIN);

    expect(result).toEqual(
      expect.objectContaining({
        _id: 'thread-2',
        identityId: 'identity-2',
        gmailThreadId: 'gmail-thread-2',
        replyState: 'waiting',
        deliveryState: 'bounce_detected',
        bounceState: 'detected',
        lastOutboundAt: '2026-03-20T09:00:00.000Z',
        messages: [
          expect.objectContaining({
            _id: 'message-1',
            gmailThreadId: 'gmail-thread-2',
            replyState: 'waiting',
            deliveryState: 'bounce_detected',
            bounceState: 'detected',
            lastOutboundAt: '2026-03-20T09:00:00.000Z',
            tracking: expect.objectContaining({
              replyState: 'waiting',
              deliveryState: 'bounce_detected',
              bounceState: 'detected',
              lastOutboundAt: '2026-03-20T09:00:00.000Z',
            }),
          }),
        ],
      }),
    );
  });

  it('listMessages returns thread tracking state on each message', async () => {
    const thread = {
      _id: 'thread-2',
      identityId: 'identity-2',
      gmailThreadId: 'gmail-thread-2',
      replyState: 'replied',
      deliveryState: 'sent',
      bounceState: 'none',
      repliedAt: '2026-03-21T12:00:00.000Z',
    };
    threadModel.findOne.mockReturnValue(createQueryChain(thread));
    messageModel.find.mockReturnValue(
      createQueryChain([{ _id: 'message-1', gmailThreadId: 'gmail-thread-2' }]),
    );
    messageModel.countDocuments.mockResolvedValue(1);

    const result = await service.listMessages(
      'org-1',
      'gmail-thread-2',
      'admin-1',
      UserRole.ADMIN,
      { page: 1, limit: 20 },
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        _id: 'message-1',
        gmailThreadId: 'gmail-thread-2',
        replyState: 'replied',
        deliveryState: 'sent',
        bounceState: 'none',
        repliedAt: '2026-03-21T12:00:00.000Z',
        tracking: expect.objectContaining({
          replyState: 'replied',
          deliveryState: 'sent',
          bounceState: 'none',
          repliedAt: '2026-03-21T12:00:00.000Z',
        }),
      }),
    ]);
  });

  it('getUnreadCount returns totals for a non-privileged user across their identities', async () => {
    identityModel.find.mockReturnValue(createQueryChain([{ _id: 'identity-1' }, { _id: 'identity-2' }]));
    threadModel.countDocuments.mockResolvedValue(2);
    threadModel.aggregate.mockResolvedValue([{ _id: 'identity-1', count: 2 }]);

    const result = await service.getUnreadCount('org-1', 'user-1', UserRole.FRONTSELL_AGENT);

    expect(threadModel.countDocuments).toHaveBeenCalledWith({
      organizationId: 'org-1',
      hasUnread: true,
      isArchived: false,
      identityId: { $in: ['identity-1', 'identity-2'] },
    });
    expect(threadModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          organizationId: 'org-1',
          hasUnread: true,
          isArchived: false,
          identityId: { $in: ['identity-1', 'identity-2'] },
        },
      },
      { $group: { _id: '$identityId', count: { $sum: 1 } } },
    ]);
    expect(result).toEqual({
      total: 2,
      byIdentity: { 'identity-1': 2 },
    });
  });

  it('getUnreadCount returns org-wide totals for ADMIN users', async () => {
    threadModel.countDocuments.mockResolvedValue(4);
    threadModel.aggregate.mockResolvedValue([
      { _id: 'identity-1', count: 1 },
      { _id: 'identity-2', count: 3 },
    ]);

    const result = await service.getUnreadCount('org-1', 'admin-1', UserRole.ADMIN);

    expect(identityModel.find).not.toHaveBeenCalled();
    expect(threadModel.countDocuments).toHaveBeenCalledWith({
      organizationId: 'org-1',
      hasUnread: true,
      isArchived: false,
    });
    expect(result).toEqual({
      total: 4,
      byIdentity: { 'identity-1': 1, 'identity-2': 3 },
    });
  });

  it('markThreadRead removes Gmail UNREAD and marks the thread plus messages as read', async () => {
    threadModel.findOne.mockReturnValue(
      createQueryChain({
        _id: 'thread-1',
        identityId: 'identity-1',
        gmailThreadId: 'gmail-thread-1',
      }),
    );
    identityModel.find.mockReturnValue(createQueryChain([{ _id: 'identity-1' }]));
    identityModel.findOne.mockReturnValue(
      createQueryChain({ _id: 'identity-1', organizationId: 'org-1', isActive: true }),
    );
    messageModel.updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 2 });
    threadModel.findByIdAndUpdate.mockResolvedValue({ _id: 'thread-1' });

    await service.markThreadRead(
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
    expect(messageModel.updateMany).toHaveBeenCalledWith(
      { organizationId: 'org-1', gmailThreadId: 'gmail-thread-1' },
      { $set: { isRead: true } },
    );
    expect(threadModel.findByIdAndUpdate).toHaveBeenCalledWith('thread-1', {
      $set: { hasUnread: false },
    });
  });

  it('markThreadUnread adds Gmail UNREAD and marks only the latest message as unread', async () => {
    threadModel.findOne.mockReturnValue(
      createQueryChain({
        _id: 'thread-1',
        identityId: 'identity-1',
        gmailThreadId: 'gmail-thread-1',
      }),
    );
    identityModel.find.mockReturnValue(createQueryChain([{ _id: 'identity-1' }]));
    identityModel.findOne.mockReturnValue(
      createQueryChain({ _id: 'identity-1', organizationId: 'org-1', isActive: true }),
    );
    messageModel.findOne.mockReturnValue(createQueryChain({ _id: 'message-2' }));
    messageModel.findByIdAndUpdate.mockResolvedValue({ _id: 'message-2' });
    threadModel.findByIdAndUpdate.mockResolvedValue({ _id: 'thread-1' });

    await service.markThreadUnread(
      'org-1',
      'gmail-thread-1',
      'user-1',
      UserRole.FRONTSELL_AGENT,
    );

    expect(gmailModify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'gmail-thread-1',
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });
    expect(messageModel.findByIdAndUpdate).toHaveBeenCalledWith('message-2', {
      $set: { isRead: false },
    });
    expect(threadModel.findByIdAndUpdate).toHaveBeenCalledWith('thread-1', {
      $set: { hasUnread: true },
    });
  });

  it('markThreadRead throws NotFoundException when the thread does not exist', async () => {
    threadModel.findOne.mockReturnValue(createQueryChain(null));

    await expect(
      service.markThreadRead('org-1', 'missing-thread', 'user-1', UserRole.FRONTSELL_AGENT),
    ).rejects.toThrow(new NotFoundException('Thread missing-thread not found'));
  });
});
