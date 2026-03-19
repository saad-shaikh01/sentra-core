/**
 * ThreadsService — PM-BE-016
 *
 * One reusable conversation thread engine for project, stage, task,
 * and approval discussions.
 *
 * Rules:
 *  - thread scope is validated at creation (scopeType + scopeId must be consistent)
 *  - messages are paginated by thread
 *  - explicit mention records are created for @-mentions
 *  - system activity logs are NOT created here (separate concern)
 *
 * Tenant isolation: every query is scoped to organizationId.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService, NotificationHelper, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
import { PmEventsService } from '../events/pm-events.service';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
} from '../../common/helpers/pagination.helper';
import { PmThreadScopeType } from '../../common/enums/pm.enums';
import { CreateThreadDto } from './dto/create-thread.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);
  private readonly notificationHelper: NotificationHelper;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PmEventsService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
  ) {
    this.notificationHelper = new NotificationHelper(notifQueue);
  }

  // -------------------------------------------------------------------------
  // Create thread
  // -------------------------------------------------------------------------

  async createThread(organizationId: string, userId: string, dto: CreateThreadDto) {
    // Verify project belongs to org
    const project = await this.prisma.pmProject.findFirst({
      where: { id: dto.projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Validate scopeId is consistent with scopeType
    await this.assertScopeValid(organizationId, dto.projectId, dto.scopeType, dto.scopeId);

    // Prevent duplicate threads on the same scope (unique: [projectId, scopeType, scopeId])
    const existing = await this.prisma.pmConversationThread.findFirst({
      where: {
        projectId: dto.projectId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
      },
      select: { id: true },
    });
    if (existing) {
      // Return existing thread instead of erroring — idempotent
      return this.prisma.pmConversationThread.findFirst({
        where: { id: existing.id },
        include: { _count: { select: { messages: true, participants: true } } },
      });
    }

    const thread = await this.prisma.pmConversationThread.create({
      data: {
        organizationId,
        projectId: dto.projectId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        visibility: dto.visibility ?? 'INTERNAL',
        createdById: userId,
      },
    });

    // Add creator as participant
    await this.prisma.pmThreadParticipant.create({
      data: { threadId: thread.id, userId },
    });

    return thread;
  }

  // -------------------------------------------------------------------------
  // Get thread detail
  // -------------------------------------------------------------------------

  async findThread(organizationId: string, threadId: string) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, organizationId },
      include: {
        _count: { select: { messages: true, participants: true } },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  // -------------------------------------------------------------------------
  // Find or get thread by scope (convenience for UI)
  // -------------------------------------------------------------------------

  async findByScopeOrFail(
    organizationId: string,
    scopeType: string,
    scopeId: string,
  ) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { organizationId, scopeType: scopeType as never, scopeId },
      include: { _count: { select: { messages: true } } },
    });
    if (!thread) throw new NotFoundException('Thread not found for this scope');
    return thread;
  }

  // -------------------------------------------------------------------------
  // Create message in thread
  // -------------------------------------------------------------------------

  async createMessage(
    organizationId: string,
    threadId: string,
    authorId: string,
    dto: CreateMessageDto,
  ) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // Validate parent message if reply
    if (dto.parentMessageId) {
      const parent = await this.prisma.pmMessage.findFirst({
        where: { id: dto.parentMessageId, threadId },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Parent message not found in this thread');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.pmMessage.create({
        data: {
          threadId,
          authorId,
          parentMessageId: dto.parentMessageId ?? null,
          messageType: dto.messageType ?? 'COMMENT',
          body: dto.body,
        },
      });

      // Create explicit mention records
      if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
        await tx.pmMessageMention.createMany({
          data: dto.mentionedUserIds.map((mentionedUserId) => ({
            messageId: createdMessage.id,
            mentionedUserId,
          })),
          skipDuplicates: true,
        });
      }

      // Ensure author is a participant
      await tx.pmThreadParticipant.upsert({
        where: { threadId_userId: { threadId, userId: authorId } },
        update: {},
        create: { threadId, userId: authorId },
      });

      // Emit pm.mention_created events for each mention
      const threadRecord = await tx.pmConversationThread.findFirst({
        where: { id: threadId },
        select: { organizationId: true, scopeType: true, scopeId: true },
      });
      if (threadRecord && dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
        for (const mentionedUserId of dto.mentionedUserIds) {
          this.events.emitMentionCreated(threadRecord.organizationId, {
            threadId,
            messageId: createdMessage.id,
            mentionedUserId,
            mentionedById: authorId,
            scopeType: threadRecord.scopeType,
            scopeId: threadRecord.scopeId,
          });
        }
      }

      return createdMessage;
    });

    // Fire mention notifications from rich-text body (non-fatal, runs after transaction)
    if (dto.body) {
      try {
        const threadRecord = await this.prisma.pmConversationThread.findFirst({
          where: { id: threadId },
          select: { organizationId: true, projectId: true },
        });
        if (threadRecord) {
          const actor = await this.prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
          await this.notificationHelper.notifyMentions({
            content: dto.body,
            context: 'in a comment',
            url: `/dashboard/projects/${threadRecord.projectId}`,
            entityType: 'thread',
            entityId: threadId,
            actorId: authorId,
            actorName: actor?.name ?? authorId,
            organizationId: threadRecord.organizationId,
            module: 'PM',
          });
        }
      } catch (err) {
        this.logger.error('notifyMentions failed on message create (non-fatal):', err);
      }
    }

    return message;
  }

  // -------------------------------------------------------------------------
  // List messages in thread (paginated, chronological)
  // -------------------------------------------------------------------------

  async listMessages(
    organizationId: string,
    threadId: string,
    page = 1,
    limit = 30,
  ) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    const { skip, take } = toPrismaPagination(page, limit);

    const [messages, total] = await this.prisma.$transaction([
      this.prisma.pmMessage.findMany({
        where: { threadId },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          threadId: true,
          authorId: true,
          parentMessageId: true,
          messageType: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          mentions: { select: { mentionedUserId: true } },
          _count: { select: { replies: true, attachments: true } },
        },
      }),
      this.prisma.pmMessage.count({ where: { threadId } }),
    ]);

    return buildPmPaginationResponse(messages, total, page, limit);
  }

  // -------------------------------------------------------------------------
  // Head metadata for lightweight polling
  // -------------------------------------------------------------------------

  async getHead(organizationId: string, threadId: string) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    const [count, latest] = await this.prisma.$transaction([
      this.prisma.pmMessage.count({ where: { threadId } }),
      this.prisma.pmMessage.findFirst({
        where: { threadId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      lastMessageAt: latest?.createdAt ?? null,
      count,
    };
  }

  // -------------------------------------------------------------------------
  // Update message body (author-only)
  // -------------------------------------------------------------------------

  async updateMessage(
    organizationId: string,
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ) {
    const message = await this.prisma.pmMessage.findFirst({
      where: { id: messageId },
      include: { thread: { select: { organizationId: true } } },
    });

    if (!message || message.thread.organizationId !== organizationId) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }
    if (message.messageType === 'SYSTEM') {
      throw new BadRequestException('System messages cannot be edited');
    }

    return this.prisma.pmMessage.update({
      where: { id: messageId },
      data: { body: dto.body },
    });
  }

  async deleteMessage(
    organizationId: string,
    messageId: string,
    userId: string,
  ) {
    const message = await this.prisma.pmMessage.findFirst({
      where: { id: messageId },
      include: { thread: { select: { organizationId: true } } },
    });

    if (!message || message.thread.organizationId !== organizationId) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this message');
    }
    if (message.messageType === 'SYSTEM') {
      throw new BadRequestException('System messages cannot be deleted');
    }

    return this.prisma.pmMessage.update({
      where: { id: messageId },
      data: {
        body: '[message deleted]',
        messageType: 'SYSTEM',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Scope validation — ensures scopeId exists and belongs to the project/org
  // -------------------------------------------------------------------------

  private async assertScopeValid(
    organizationId: string,
    projectId: string,
    scopeType: PmThreadScopeType,
    scopeId: string,
  ) {
    switch (scopeType) {
      case PmThreadScopeType.PROJECT:
        // scopeId must equal the projectId itself
        if (scopeId !== projectId) {
          throw new BadRequestException(
            'For PROJECT scope, scopeId must match the projectId',
          );
        }
        break;

      case PmThreadScopeType.STAGE: {
        const stage = await this.prisma.pmProjectStage.findFirst({
          where: { id: scopeId, projectId, organizationId },
          select: { id: true },
        });
        if (!stage) {
          throw new BadRequestException(
            'Scope stage not found in this project',
          );
        }
        break;
      }

      case PmThreadScopeType.TASK: {
        const task = await this.prisma.pmTask.findFirst({
          where: { id: scopeId, projectId, organizationId },
          select: { id: true },
        });
        if (!task) {
          throw new BadRequestException(
            'Scope task not found in this project',
          );
        }
        break;
      }

      case PmThreadScopeType.APPROVAL: {
        const approval = await this.prisma.pmApprovalRequest.findFirst({
          where: { id: scopeId, projectId },
          include: { project: { select: { organizationId: true } } },
        });
        if (!approval || approval.project.organizationId !== organizationId) {
          throw new BadRequestException(
            'Scope approval request not found in this project',
          );
        }
        break;
      }

      default:
        throw new BadRequestException(`Unknown scopeType: ${scopeType}`);
    }
  }

  // -------------------------------------------------------------------------
  // Mark thread as read (update participant lastReadAt)
  // -------------------------------------------------------------------------

  async markRead(organizationId: string, threadId: string, userId: string) {
    const thread = await this.prisma.pmConversationThread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // Get latest message id
    const latest = await this.prisma.pmMessage.findFirst({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    await this.prisma.pmThreadParticipant.upsert({
      where: { threadId_userId: { threadId, userId } },
      update: {
        lastReadMessageId: latest?.id ?? null,
        lastReadAt: new Date(),
      },
      create: {
        threadId,
        userId,
        lastReadMessageId: latest?.id ?? null,
        lastReadAt: new Date(),
      },
    });

    return { success: true };
  }
}
