import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATION_QUEUE, NotificationJobPayload } from './notification-queue.constants';
import { PrismaService } from '@sentra-core/prisma-client';
import { NotificationsGateway } from './notifications.gateway';
import { FcmService } from './fcm.service';

@Processor(NOTIFICATION_QUEUE)
export class NotificationQueueProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @Optional() private readonly fcm: FcmService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>) {
    const payload = job.data;

    // 1. Write to DB (batch)
    const notifications = payload.recipientIds.map((recipientId) => ({
      organizationId: payload.organizationId,
      recipientId,
      actorId: payload.actorId ?? null,
      type: payload.type as any,
      module: payload.module as any,
      title: payload.title,
      body: payload.body,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      url: payload.url ?? null,
      isMention: payload.isMention ?? false,
      mentionContext: payload.mentionContext ?? null,
      data: payload.data ?? null,
    }));

    const created = await this.prisma.globalNotification.createMany({
      data: notifications,
    });

    // 2. Emit real-time via Socket.io (per recipient)
    if (this.gateway) {
      for (const recipientId of payload.recipientIds) {
        // Fetch the created notification to emit
        const notification = await this.prisma.globalNotification.findFirst({
          where: {
            organizationId: payload.organizationId,
            recipientId,
            type: payload.type as any,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (notification) {
          this.gateway.emitToUser(recipientId, 'notification:new', notification);
        }
      }
    }

    // 3. FCM push (skip if NOTIF-012 not yet implemented — just wrap in try/catch)
    try {
      if (this.fcm) {
        const tokens = await this.prisma.pushToken.findMany({
          where: { userId: { in: payload.recipientIds } },
          select: { token: true },
        });
        if (tokens.length > 0) {
          await this.fcm.sendMulticast({
            tokens: tokens.map((t) => t.token),
            title: payload.title,
            body: payload.body,
            data: {
              url: payload.url ?? '',
              entityType: payload.entityType ?? '',
              entityId: payload.entityId ?? '',
            },
          });
        }
      }
    } catch (err) {
      // FCM errors should NOT fail the job — just log
      console.error('[NotificationProcessor] FCM error (non-fatal):', err);
    }

    return { processed: created.count };
  }
}
