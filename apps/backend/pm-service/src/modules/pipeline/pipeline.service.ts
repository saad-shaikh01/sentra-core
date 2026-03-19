import { Injectable } from '@nestjs/common';
import { AppModule, GlobalNotificationType } from '@prisma/client';
import { PrismaService } from '@sentra-core/prisma-client';

export interface SaleClosedWonDto {
  saleId: string;
  clientId?: string;
  orgId: string;
  totalAmount?: number;
  description?: string;
}

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async handleSaleClosedWon(dto: SaleClosedWonDto) {
    // Idempotency: check if notification already created for this saleId
    const existing = await this.prisma.globalNotification.findFirst({
      where: {
        organizationId: dto.orgId,
        module: AppModule.PM,
        type: GlobalNotificationType.SYSTEM_ALERT,
        entityType: 'sale',
        entityId: dto.saleId,
        data: {
          path: ['eventName'],
          equals: 'SALE_CLOSED_WON',
        },
      },
      select: { id: true },
    });
    if (existing) return { idempotent: true, notificationId: existing.id };

    // Create a single org-level notification; the frontend fans it out to relevant PMs
    const notification = await this.prisma.globalNotification.create({
      data: {
        organizationId: dto.orgId,
        recipientId: 'SYSTEM',
        type: GlobalNotificationType.SYSTEM_ALERT,
        module: AppModule.PM,
        title: 'Sale Closed Won',
        body: `A sale has been closed and won.`,
        entityType: 'sale',
        entityId: dto.saleId,
        data: {
          eventName: 'SALE_CLOSED_WON',
          saleId: dto.saleId,
          clientId: dto.clientId,
          totalAmount: dto.totalAmount,
          description: dto.description,
        },
      },
    });

    return { success: true, notificationId: notification.id };
  }

  async getPendingSales(organizationId: string) {
    const notifications = await this.prisma.globalNotification.findMany({
      where: {
        organizationId,
        module: AppModule.PM,
        type: GlobalNotificationType.SYSTEM_ALERT,
        isRead: false,
        data: {
          path: ['eventName'],
          equals: 'SALE_CLOSED_WON',
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: notifications };
  }
}
