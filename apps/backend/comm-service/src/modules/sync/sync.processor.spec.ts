import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommGateway } from '../gateway/comm.gateway';
import { MetricsService } from '../../common/metrics/metrics.service';
import { GmailApiService } from './gmail-api.service';
import { SyncProcessor } from './sync.processor';
import { SyncService } from './sync.service';

type QueryChain<T> = {
  select: jest.MockedFunction<(arg: string) => QueryChain<T>>;
  lean: jest.MockedFunction<() => QueryChain<T>>;
  exec: jest.MockedFunction<() => Promise<T>>;
};

function createQueryChain<T>(value: T): QueryChain<T> {
  const chain = {
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  } as QueryChain<T>;

  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);

  return chain;
}

describe('SyncProcessor', () => {
  let processor: SyncProcessor;
  let messageModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let threadModel: {
    findOneAndUpdate: jest.Mock;
  };
  let identityModel: {
    findById: jest.Mock;
  };
  let syncService: {
    performInitialSync: jest.Mock;
  };
  let gateway: {
    emitToOrg: jest.Mock;
  };
  let metrics: {
    incrementSyncError: jest.Mock;
    recordSyncDuration: jest.Mock;
    incrementMessagesProcessed: jest.Mock;
    incrementCounter: jest.Mock;
  };
  let gmailMessagesGet: jest.Mock;

  beforeEach(() => {
    identityModel = {
      findById: jest.fn(),
    };
    messageModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    threadModel = {
      findOneAndUpdate: jest.fn(),
    };
    syncService = {
      performInitialSync: jest.fn(),
    };
    gateway = {
      emitToOrg: jest.fn(),
    };
    metrics = {
      incrementSyncError: jest.fn(),
      recordSyncDuration: jest.fn(),
      incrementMessagesProcessed: jest.fn(),
      incrementCounter: jest.fn(),
    };
    gmailMessagesGet = jest.fn();

    processor = new SyncProcessor(
      identityModel as unknown as Model<CommIdentityDocument>,
      messageModel as unknown as Model<CommMessageDocument>,
      threadModel as unknown as Model<CommThreadDocument>,
      syncService as unknown as SyncService,
      {
        getGmailClient: jest.fn().mockResolvedValue({
          users: {
            messages: {
              get: gmailMessagesGet,
            },
          },
        }),
      } as unknown as GmailApiService,
      metrics as unknown as MetricsService,
      gateway as unknown as CommGateway,
    );
  });

  it('emits sync:complete when an initial sync job finishes', async () => {
    const identity = {
      _id: 'identity-1',
      organizationId: 'org-1',
      email: 'agent@example.com',
      isActive: true,
    } as unknown as CommIdentityDocument;
    identityModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(identity),
    });
    syncService.performInitialSync.mockResolvedValue(12);

    await processor.process({
      name: 'initial-sync',
      data: { identityId: 'identity-1', days: 90 },
    } as Job);

    expect(syncService.performInitialSync).toHaveBeenCalledWith(identity, undefined);
    expect(gateway.emitToOrg).toHaveBeenCalledWith('org-1', 'sync:complete', {
      identityId: 'identity-1',
      email: 'agent@example.com',
      count: 12,
    });
  });

  it('rethrows GMAIL_RATE_LIMITED so BullMQ can retry the job with backoff', async () => {
    const identity = {
      _id: 'identity-1',
      organizationId: 'org-1',
      email: 'agent@example.com',
      isActive: true,
    } as unknown as CommIdentityDocument;
    identityModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(identity),
    });
    syncService.performInitialSync.mockRejectedValue(new Error('GMAIL_RATE_LIMITED'));

    await expect(
      processor.process({
        name: 'initial-sync',
        data: { identityId: 'identity-1', days: 90 },
      } as Job),
    ).rejects.toThrow('GMAIL_RATE_LIMITED');

    expect(metrics.incrementCounter).toHaveBeenCalledWith('comm_sync_errors_total', {
      identity_id: 'identity-1',
      type: 'rate_limit',
    });
    expect(metrics.incrementSyncError).toHaveBeenCalledWith('initial-sync');
  });

  it('syncLabelUpdates sets hasUnread to true when any message in the thread still has the UNREAD label', async () => {
    messageModel.find.mockReturnValue(
      createQueryChain([
        {
          _id: 'message-1',
          gmailMessageId: 'gmail-message-1',
          gmailThreadId: 'gmail-thread-1',
          isRead: true,
          gmailLabels: [],
        },
      ]),
    );
    gmailMessagesGet.mockResolvedValue({ data: { labelIds: ['UNREAD'] } });
    messageModel.findByIdAndUpdate.mockResolvedValue({ _id: 'message-1' });
    messageModel.findOne.mockReturnValue(createQueryChain({ _id: 'message-1' }));
    threadModel.findOneAndUpdate.mockResolvedValue({ _id: 'thread-1' });

    const syncLabelUpdates = (
      processor as unknown as {
        syncLabelUpdates: (identity: CommIdentityDocument) => Promise<void>;
      }
    ).syncLabelUpdates.bind(processor);

    await syncLabelUpdates({
      _id: 'identity-1',
      organizationId: 'org-1',
    } as unknown as CommIdentityDocument);

    expect(messageModel.findByIdAndUpdate).toHaveBeenCalledWith('message-1', {
      $set: { isRead: false, gmailLabels: ['UNREAD'] },
    });
    expect(threadModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        gmailThreadId: 'gmail-thread-1',
      },
      { $set: { hasUnread: true } },
    );
  });

  it('syncLabelUpdates sets hasUnread to false when no messages in the thread retain the UNREAD label', async () => {
    messageModel.find.mockReturnValue(
      createQueryChain([
        {
          _id: 'message-1',
          gmailMessageId: 'gmail-message-1',
          gmailThreadId: 'gmail-thread-1',
          isRead: false,
          gmailLabels: ['UNREAD'],
        },
      ]),
    );
    gmailMessagesGet.mockResolvedValue({ data: { labelIds: [] } });
    messageModel.findByIdAndUpdate.mockResolvedValue({ _id: 'message-1' });
    messageModel.findOne.mockReturnValue(createQueryChain(null));
    threadModel.findOneAndUpdate.mockResolvedValue({ _id: 'thread-1' });

    const syncLabelUpdates = (
      processor as unknown as {
        syncLabelUpdates: (identity: CommIdentityDocument) => Promise<void>;
      }
    ).syncLabelUpdates.bind(processor);

    await syncLabelUpdates({
      _id: 'identity-1',
      organizationId: 'org-1',
    } as unknown as CommIdentityDocument);

    expect(messageModel.findByIdAndUpdate).toHaveBeenCalledWith('message-1', {
      $set: { isRead: true, gmailLabels: [] },
    });
    expect(threadModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        organizationId: 'org-1',
        gmailThreadId: 'gmail-thread-1',
      },
      { $set: { hasUnread: false } },
    );
  });
});
