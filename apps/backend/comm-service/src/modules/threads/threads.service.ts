import { Injectable, NotFoundException, Optional } from '@nestjs/common';
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

  async listThreads(organizationId: string, query: ListThreadsQueryDto) {
    const { page = 1, limit = 20, entityType, entityId, search, filter, identityId } = query;
    const mongoFilter: Record<string, any> = { organizationId };

    if (entityType && entityId) {
      mongoFilter['entityLinks.entityType'] = entityType;
      mongoFilter['entityLinks.entityId'] = entityId;
    }

    if (identityId) {
      mongoFilter.identityId = identityId;
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

  async getThread(organizationId: string, threadId: string) {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    // Fetch messages embedded in the response
    const messages = await this.messageModel
      .find({ organizationId, gmailThreadId: thread.gmailThreadId })
      .sort({ sentAt: 1 })
      .exec();

    return { ...thread.toObject(), messages };
  }

  async listMessages(organizationId: string, threadId: string, query: ListMessagesQueryDto) {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

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

  async markThreadRead(organizationId: string, threadId: string): Promise<void> {
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
}
