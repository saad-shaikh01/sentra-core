import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@sentra-core/prisma-client';
import { NotificationsGateway } from './notifications.gateway';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { NOTIFICATION_QUEUE, NotificationJobPayload } from './notification-queue.constants';
import { NotificationHelper } from '@sentra-core/prisma-client';

@Injectable()
export class NotificationsService {
  private readonly notificationHelper: NotificationHelper;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {
    this.notificationHelper = new NotificationHelper(queue);
  }

  async list(userId: string, orgId: string, query: QueryNotificationsDto) {
    const where: any = {
      recipientId: userId,
      organizationId: orgId,
      ...(query.isRead !== undefined && { isRead: query.isRead === 'true' }),
      ...(query.module && { module: query.module as any }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.globalNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      }),
      this.prisma.globalNotification.count({ where }),
      this.prisma.globalNotification.count({
        where: { recipientId: userId, organizationId: orgId, isRead: false },
      }),
    ]);

    return {
      data: notifications,
      total,
      unreadCount,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.globalNotification.findFirst({
      where: { id, recipientId: userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.globalNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    // Emit updated unread count
    const unreadCount = await this.prisma.globalNotification.count({
      where: { recipientId: userId, organizationId: notification.organizationId, isRead: false },
    });
    this.gateway.emitUnreadCount(userId, unreadCount);

    return updated;
  }

  async markAllRead(userId: string, orgId: string) {
    await this.prisma.globalNotification.updateMany({
      where: { recipientId: userId, organizationId: orgId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitUnreadCount(userId, 0);
    return { success: true };
  }

  async registerPushToken(userId: string, orgId: string, dto: RegisterPushTokenDto) {
    // Upsert — same token might re-register after reinstall
    return this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        organizationId: orgId,
        token: dto.token,
        platform: dto.platform as any,
        userAgent: dto.userAgent,
      },
      update: { userId, organizationId: orgId, updatedAt: new Date() },
    });
  }

  async unregisterPushToken(token: string, userId: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { success: true };
  }

  // Called by other services via HTTP (e.g. comm-service)
  // For services that DON'T have BullMQ access
  async createInternal(payload: NotificationJobPayload) {
    await this.notificationHelper.notify(payload);
    return { success: true };
  }
}
