import { Injectable } from '@nestjs/common';
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
    const existing = await this.prisma.pmNotification.findFirst({
      where: {
        organizationId: dto.orgId,
        scopeType: 'SALE',
        scopeId: dto.saleId,
        eventType: 'SALE_CLOSED_WON',
      },
      select: { id: true },
    });
    if (existing) return { idempotent: true, notificationId: existing.id };

    // Create a single org-level notification; the frontend fans it out to relevant PMs
    const notification = await this.prisma.pmNotification.create({
      data: {
        organizationId: dto.orgId,
        userId: 'SYSTEM',
        eventType: 'SALE_CLOSED_WON',
        scopeType: 'SALE',
        scopeId: dto.saleId,
        status: 'UNREAD',
        payload: {
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
    const notifications = await this.prisma.pmNotification.findMany({
      where: {
        organizationId,
        eventType: 'SALE_CLOSED_WON',
        status: 'UNREAD',
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: notifications };
  }
}
