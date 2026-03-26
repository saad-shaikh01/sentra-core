import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { UserRole } from '@sentra-core/types';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { CommMessage, CommMessageDocument } from '../../schemas/comm-message.schema';
import { CommIdentity, CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';
import { ListThreadsQueryDto, ListMessagesQueryDto } from './dto/threads.dto';
import { GmailApiService } from '../sync/gmail-api.service';
import { CommGateway } from '../gateway/comm.gateway';

@Injectable()
export class ThreadsService {
  constructor(
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    @InjectModel(CommMessage.name)
    private readonly messageModel: Model<CommMessageDocument>,
    @InjectModel(CommIdentity.name)
    private readonly identityModel: Model<CommIdentityDocument>,
    private readonly gmailApi: GmailApiService,
    @Optional() private readonly gateway?: CommGateway,
  ) {}

  async listThreads(
    organizationId: string,
    userId: string,
    role: UserRole,
    query: ListThreadsQueryDto,
  ) {
    const { page = 1, limit = 20, entityType, entityId, search, filter, identityId, scope } = query;
    const mongoFilter: Record<string, unknown> = { organizationId };
    // Admin with scope=all sees every thread in the org (explicit opt-in).
    // Admin without scope=all sees only their own threads — same scoping as a regular user.
    const isAdminViewAll = this.isPrivileged(role) && scope === 'all';
    const userIdentityIds = isAdminViewAll
      ? []
      : await this.resolveUserIdentityIds(organizationId, userId);

    // Entity-linked queries (lead/client Email tab) bypass identity scoping.
    // The entity link itself is the access control — any org member can see
    // all threads linked to an entity they have access to (e.g. after reassignment).
    const isEntityLinkedQuery = !!(entityType && entityId);

    if (isEntityLinkedQuery) {
      mongoFilter['entityLinks.entityType'] = entityType;
      mongoFilter['entityLinks.entityId'] = entityId;
    }

    if (identityId) {
      // Privileged users can filter by any identity; regular users can only see their own
      mongoFilter.identityId = this.isPrivileged(role)
        ? identityId
        : { $in: userIdentityIds.filter((candidateId) => candidateId === identityId) };
    } else if (!isAdminViewAll && !isEntityLinkedQuery) {
      // Non-admin and admin-without-scope=all: scope to own identities only.
      // Skip if querying by entity link — entity link is the access control.
      mongoFilter.identityId = { $in: userIdentityIds };
      // isAdminViewAll + no identityId: no identity filter → sees all threads in org
    }

    if (search) {
      mongoFilter['$or'] = [
        { subject: { $regex: search, $options: 'i' } },
        { snippet: { $regex: search, $options: 'i' } },
        { 'participants.email': { $regex: search, $options: 'i' } },
      ];
    }

    // Apply filter tab
    if (filter === 'unread') {
      mongoFilter.hasUnread = true;
      mongoFilter.isArchived = { $ne: true };
    } else if (filter === 'sent') {
      mongoFilter.hasSent = true;
      mongoFilter.isArchived = { $ne: true };
    } else if (filter === 'archived') {
      mongoFilter.isArchived = true;
    } else {
      // 'all', 'sent', or undefined — exclude archived by default
      mongoFilter.isArchived = { $ne: true };
    }

    const { skip } = toMongoosePagination(page, limit);
    const [data, total] = await Promise.all([
      this.threadModel
        .find(mongoFilter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.threadModel.countDocuments(mongoFilter),
    ]);

    return buildCommPaginationResponse(data, total, page, limit);
  }

  async getThread(
    organizationId: string,
    threadId: string,
    userId: string,
    role: UserRole,
  ) {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const isEntityLinked = (thread.entityLinks?.length ?? 0) > 0;
    await this.assertThreadAccess(organizationId, thread.identityId, userId, role, threadId, isEntityLinked);

    // Fetch messages embedded in the response
    const messages = await this.messageModel
      .find({ organizationId, gmailThreadId: thread.gmailThreadId })
      .sort({ sentAt: 1 })
      .exec();

    return { ...thread.toObject(), messages };
  }

  async listMessages(
    organizationId: string,
    threadId: string,
    userId: string,
    role: UserRole,
    query: ListMessagesQueryDto,
  ) {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const isEntityLinked = (thread.entityLinks?.length ?? 0) > 0;
    await this.assertThreadAccess(organizationId, thread.identityId, userId, role, threadId, isEntityLinked);

    const { page = 1, limit = 20 } = query;
    const { skip } = toMongoosePagination(page, limit);

    const [data, total] = await Promise.all([
      this.messageModel
        .find({ organizationId, gmailThreadId: thread.gmailThreadId })
        .sort({ sentAt: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.messageModel.countDocuments({
        organizationId,
        gmailThreadId: thread.gmailThreadId,
      }),
    ]);

    return buildCommPaginationResponse(data, total, page, limit);
  }

  async getUnreadCount(
    organizationId: string,
    userId: string,
    role: UserRole,
  ): Promise<{ total: number; byIdentity: Record<string, number> }> {
    const filter: Record<string, unknown> = {
      organizationId,
      hasUnread: true,
      isArchived: false,
    };

    if (!this.isPrivileged(role)) {
      filter.identityId = { $in: await this.resolveUserIdentityIds(organizationId, userId) };
    }

    const [total, grouped] = await Promise.all([
      this.threadModel.countDocuments(filter),
      this.threadModel.aggregate<{ _id: string; count: number }>([
        { $match: filter },
        { $group: { _id: '$identityId', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      byIdentity: Object.fromEntries(
        grouped.map((item) => [item._id, item.count]),
      ),
    };
  }

  async archiveThread(organizationId: string, threadId: string): Promise<void> {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const identity = await this.getThreadIdentity(organizationId, thread.identityId);
    const gmail = await this.gmailApi.getGmailClient(identity);

    await gmail.users.threads.modify({
      userId: 'me',
      id: thread.gmailThreadId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });

    await this.threadModel.findByIdAndUpdate(thread._id, { $set: { isArchived: true } });
    this.gateway?.emitToOrg(organizationId, 'thread:updated', { threadId: String(thread._id) });
  }

  async markThreadRead(
    organizationId: string,
    threadId: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    await this.assertThreadAccess(organizationId, thread.identityId, userId, role, threadId);

    const identity = await this.getThreadIdentity(organizationId, thread.identityId);
    const gmail = await this.gmailApi.getGmailClient(identity);

    await gmail.users.threads.modify({
      userId: 'me',
      id: thread.gmailThreadId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });

    await Promise.all([
      this.messageModel.updateMany(
        { organizationId, gmailThreadId: thread.gmailThreadId },
        { $set: { isRead: true } },
      ),
      this.threadModel.findByIdAndUpdate(thread._id, {
        $set: { hasUnread: false },
      }),
    ]);
    this.gateway?.emitToOrg(organizationId, 'thread:updated', { threadId: String(thread._id) });
  }

  async markThreadUnread(
    organizationId: string,
    threadId: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    await this.assertThreadAccess(organizationId, thread.identityId, userId, role, threadId);

    const identity = await this.getThreadIdentity(organizationId, thread.identityId);
    const gmail = await this.gmailApi.getGmailClient(identity);

    await gmail.users.threads.modify({
      userId: 'me',
      id: thread.gmailThreadId,
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });

    const latestMessage = await this.messageModel
      .findOne({ organizationId, gmailThreadId: thread.gmailThreadId })
      .sort({ sentAt: -1, _id: -1 })
      .exec();

    await Promise.all([
      latestMessage
        ? this.messageModel.findByIdAndUpdate(latestMessage._id, {
            $set: { isRead: false },
          })
        : Promise.resolve(),
      this.threadModel.findByIdAndUpdate(thread._id, {
        $set: { hasUnread: true },
      }),
    ]);

    this.gateway?.emitToOrg(organizationId, 'thread:updated', { threadId: String(thread._id) });
  }

  private async getThreadIdentity(
    organizationId: string,
    identityId: string,
  ): Promise<CommIdentityDocument> {
    const identity = await this.identityModel
      .findOne({ _id: identityId, organizationId, isActive: true })
      .exec();

    if (!identity) {
      throw new NotFoundException(`Identity ${identityId} not found for thread`);
    }

    return identity;
  }

  private async findThreadByIdOrGmailThreadId(
    organizationId: string,
    threadId: string,
  ): Promise<CommThreadDocument | null> {
    const query = Types.ObjectId.isValid(threadId)
      ? {
          organizationId,
          $or: [{ _id: new Types.ObjectId(threadId) }, { gmailThreadId: threadId }],
        }
      : { organizationId, gmailThreadId: threadId };

    return this.threadModel.findOne(query).exec();
  }

  private async resolveUserIdentityIds(organizationId: string, userId: string): Promise<string[]> {
    const identities = await this.identityModel
      .find({ organizationId, userId, isActive: true })
      .select('_id')
      .lean()
      .exec();

    return identities.map((identity) => String(identity._id));
  }

  private isPrivileged(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.ADMIN;
  }

  private async assertThreadAccess(
    organizationId: string,
    identityId: string,
    userId: string,
    role: UserRole,
    threadId: string,
    isEntityLinked?: boolean,
  ): Promise<void> {
    if (this.isPrivileged(role)) {
      return;
    }

    // Entity-linked threads are accessible to all org members regardless of
    // which identity synced the email. This preserves history visibility after
    // lead/client reassignment between agents.
    if (isEntityLinked) {
      return;
    }

    const userIdentityIds = await this.resolveUserIdentityIds(organizationId, userId);
    if (!userIdentityIds.includes(identityId)) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }
  }
}
