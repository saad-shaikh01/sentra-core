import { Injectable, NotFoundException, ConflictException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommEntityLink, CommEntityLinkDocument } from '../../schemas/comm-entity-link.schema';
import { CommThread, CommThreadDocument } from '../../schemas/comm-thread.schema';
import { InternalContactsClient } from '../../common/http/internal-contacts.client';
import { CreateEntityLinkDto } from './dto/entity-links.dto';
import { CommGateway } from '../gateway/comm.gateway';

@Injectable()
export class EntityLinksService {
  constructor(
    @InjectModel(CommEntityLink.name)
    private readonly entityLinkModel: Model<CommEntityLinkDocument>,
    @InjectModel(CommThread.name)
    private readonly threadModel: Model<CommThreadDocument>,
    private readonly contactsClient: InternalContactsClient,
    @Optional() private readonly gateway?: CommGateway,
  ) {}

  async createLink(
    organizationId: string,
    userId: string,
    dto: CreateEntityLinkDto,
  ): Promise<CommEntityLinkDocument> {
    const gmailThreadId = await this.resolveGmailThreadId(organizationId, dto);
    const existing = await this.entityLinkModel.findOne({
      organizationId,
      gmailThreadId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    if (existing) {
      throw new ConflictException('Entity link already exists');
    }

    const link = await this.entityLinkModel.create({
      organizationId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      gmailThreadId,
      linkedBy: 'MANUAL',
      linkedByUserId: userId,
    });

    // Sync to thread's entityLinks array
    const thread = await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId },
      {
        $addToSet: {
          entityLinks: {
            entityType: dto.entityType,
            entityId: dto.entityId,
            linkedBy: 'MANUAL',
            linkedAt: new Date(),
          },
        },
      },
      { new: true },
    );

    // Emit realtime events
    if (thread) {
      this.gateway?.emitToOrg(organizationId, 'link:created', {
        entityType: dto.entityType,
        entityId: dto.entityId,
        threadId: String(thread._id),
        gmailThreadId,
      });
      this.gateway?.emitToEntity(dto.entityType, dto.entityId, 'link:created', {
        entityType: dto.entityType,
        entityId: dto.entityId,
        threadId: String(thread._id),
        gmailThreadId,
      });
    }

    return link;
  }

  async deleteLink(organizationId: string, linkId: string): Promise<void> {
    const link = await this.entityLinkModel.findOneAndDelete({
      _id: linkId,
      organizationId,
    });

    if (!link) {
      throw new NotFoundException(`Entity link ${linkId} not found`);
    }

    // Remove from thread's entityLinks array
    const thread = await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId: link.gmailThreadId },
      {
        $pull: {
          entityLinks: {
            entityType: link.entityType,
            entityId: link.entityId,
          },
        },
      },
      { new: false },
    );

    // Emit realtime events
    if (thread) {
      this.gateway?.emitToOrg(organizationId, 'link:removed', {
        entityType: link.entityType,
        entityId: link.entityId,
        threadId: String(thread._id),
        gmailThreadId: link.gmailThreadId,
      });
      this.gateway?.emitToEntity(link.entityType, link.entityId, 'link:removed', {
        entityType: link.entityType,
        entityId: link.entityId,
        threadId: String(thread._id),
        gmailThreadId: link.gmailThreadId,
      });
    }
  }

  async deleteLinkByEntity(
    organizationId: string,
    threadId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, threadId);
    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const link = await this.entityLinkModel.findOneAndDelete({
      organizationId,
      gmailThreadId: thread.gmailThreadId,
      entityType,
      entityId,
    });

    if (!link) {
      throw new NotFoundException(`Entity link not found`);
    }

    await this.threadModel.findOneAndUpdate(
      { organizationId, gmailThreadId: thread.gmailThreadId },
      { $pull: { entityLinks: { entityType, entityId } } },
    );

    this.gateway?.emitToOrg(organizationId, 'link:removed', {
      entityType,
      entityId,
      threadId: String(thread._id),
      gmailThreadId: thread.gmailThreadId,
    });
    this.gateway?.emitToEntity(entityType, entityId, 'link:removed', {
      entityType,
      entityId,
      threadId: String(thread._id),
      gmailThreadId: thread.gmailThreadId,
    });
  }

  async listLinks(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<CommEntityLinkDocument[]> {
    return this.entityLinkModel
      .find({ organizationId, entityType, entityId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Auto-link threads to clients/leads based on participant emails.
   * Called after a sync batch processes messages for an org.
   */
  async autoLinkThreads(organizationId: string, gmailThreadIds: string[]): Promise<void> {
    if (gmailThreadIds.length === 0) return;

    const threads = await this.threadModel
      .find({ organizationId, gmailThreadId: { $in: gmailThreadIds } })
      .exec();

    // Collect all participant emails
    const emailSet = new Set<string>();
    const threadsByEmail = new Map<string, string[]>(); // email -> threadIds

    for (const thread of threads) {
      for (const p of thread.participants ?? []) {
        if (p.email) {
          emailSet.add(p.email);
          const list = threadsByEmail.get(p.email) ?? [];
          list.push(thread.gmailThreadId);
          threadsByEmail.set(p.email, list);
        }
      }
    }

    if (emailSet.size === 0) return;

    // Lookup contacts in core-service
    const contacts = await this.contactsClient.lookupByEmails(
      organizationId,
      Array.from(emailSet),
    );

    // Create entity links
    for (const contact of contacts) {
      const relatedThreadIds = threadsByEmail.get(contact.email) ?? [];
      for (const threadId of relatedThreadIds) {
        await this.entityLinkModel.findOneAndUpdate(
          {
            organizationId,
            gmailThreadId: threadId,
            entityType: contact.entityType,
            entityId: contact.id,
          },
          {
            $setOnInsert: {
              organizationId,
              entityType: contact.entityType,
              entityId: contact.id,
              gmailThreadId: threadId,
              linkedBy: 'AUTO',
              linkedByUserId: 'system',
            },
          },
          { upsert: true },
        );

        // Sync to thread document
        await this.threadModel.findOneAndUpdate(
          { organizationId, gmailThreadId: threadId },
          {
            $addToSet: {
              entityLinks: {
                entityType: contact.entityType,
                entityId: contact.id,
                linkedBy: 'AUTO',
                linkedAt: new Date(),
              },
            },
          },
        );
      }
    }
  }

  /**
   * Retroactively link all existing threads that have the given emails
   * as participants to the specified entity.
   * Called when a new lead/client is created after sync has already run.
   */
  async backfillByEmail(
    organizationId: string,
    entityType: string,
    entityId: string,
    emails: string[],
  ): Promise<void> {
    if (emails.length === 0) return;

    const normalizedEmails = emails.map((e) => e.toLowerCase().trim()).filter(Boolean);
    if (normalizedEmails.length === 0) return;

    try {
      // Find all threads where any participant email matches
      const threads = await this.threadModel
        .find({
          organizationId,
          'participants.email': { $in: normalizedEmails },
        })
        .select('_id gmailThreadId')
        .lean()
        .exec();

      if (threads.length === 0) return;

      // Create entity links for all matched threads using the same upsert pattern as autoLinkThreads
      for (const thread of threads) {
        await this.entityLinkModel.findOneAndUpdate(
          {
            organizationId,
            gmailThreadId: thread.gmailThreadId,
            entityType,
            entityId,
          },
          {
            $setOnInsert: {
              organizationId,
              entityType,
              entityId,
              gmailThreadId: thread.gmailThreadId,
              linkedBy: 'AUTO',
              linkedByUserId: 'system',
            },
          },
          { upsert: true },
        );

        // Sync to thread document
        await this.threadModel.findOneAndUpdate(
          { organizationId, gmailThreadId: thread.gmailThreadId },
          {
            $addToSet: {
              entityLinks: {
                entityType,
                entityId,
                linkedBy: 'AUTO',
                linkedAt: new Date(),
              },
            },
          },
        );
      }
    } catch (err) {
      // Non-blocking — log but do not propagate
      console.error('[EntityLinksService] backfillByEmail failed', err);
    }
  }

  private async resolveGmailThreadId(
    organizationId: string,
    dto: CreateEntityLinkDto,
  ): Promise<string> {
    if (dto.gmailThreadId) {
      return dto.gmailThreadId;
    }

    if (!dto.threadId) {
      throw new NotFoundException('threadId or gmailThreadId is required');
    }

    const thread = await this.findThreadByIdOrGmailThreadId(organizationId, dto.threadId);

    if (!thread) {
      throw new NotFoundException(`Thread ${dto.threadId} not found`);
    }

    return thread.gmailThreadId;
  }

  private async findThreadByIdOrGmailThreadId(
    organizationId: string,
    threadId: string,
  ): Promise<Pick<CommThreadDocument, '_id' | 'gmailThreadId'> | null> {
    const query = Types.ObjectId.isValid(threadId)
      ? {
          organizationId,
          $or: [{ _id: new Types.ObjectId(threadId) }, { gmailThreadId: threadId }],
        }
      : { organizationId, gmailThreadId: threadId };

    return this.threadModel.findOne(query).select('_id gmailThreadId').exec();
  }
}
