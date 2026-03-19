import { Injectable, NotFoundException } from '@nestjs/common';
import { AppModule } from '@prisma/client';
import { PrismaService } from '@sentra-core/prisma-client';
import {
  buildPmPaginationResponse,
  toPrismaPagination,
} from '../../common/helpers/pagination.helper';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    userId: string,
    query: QueryNotificationsDto,
  ) {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = toPrismaPagination(page, limit);

    const where = {
      organizationId,
      recipientId: userId,
      module: AppModule.PM,
      ...(status !== undefined && { isRead: status === 'READ' }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.globalNotification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.globalNotification.count({ where }),
    ]);

    return buildPmPaginationResponse(rows, total, page, limit);
  }

  async markRead(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.globalNotification.findFirst({
      where: { id, organizationId, recipientId: userId, module: AppModule.PM },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');

    return this.prisma.globalNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    const result = await this.prisma.globalNotification.updateMany({
      where: {
        organizationId,
        recipientId: userId,
        module: AppModule.PM,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }
}
