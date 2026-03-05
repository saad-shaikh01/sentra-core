import { Injectable, NotFoundException } from '@nestjs/common';
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
      userId,
      ...(status !== undefined && { status }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pmNotification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pmNotification.count({ where }),
    ]);

    return buildPmPaginationResponse(rows, total, page, limit);
  }

  async markRead(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.pmNotification.findFirst({
      where: { id, organizationId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');

    return this.prisma.pmNotification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    const result = await this.prisma.pmNotification.updateMany({
      where: {
        organizationId,
        userId,
        status: 'UNREAD',
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }
}

