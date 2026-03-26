import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@sentra-core/prisma-client';
import { NotificationHelper, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
import { AppModule, UserRole } from '@prisma/client';

const TYPE_MAP: Record<string, string> = {
  SALE_CREATED: 'SALE_CREATED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INVOICE_OVERDUE: 'INVOICE_OVERDUE',
  SALE_STATUS_CHANGED: 'SALE_STATUS_CHANGED',
  CHARGEBACK_FILED: 'CHARGEBACK_FILED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
};

const TITLE_MAP: Record<string, string> = {
  SALE_CREATED: 'Sale Created',
  PAYMENT_FAILED: 'Payment Failed',
  INVOICE_OVERDUE: 'Invoice Overdue',
  SALE_STATUS_CHANGED: 'Sale Status Updated',
  CHARGEBACK_FILED: 'Chargeback Filed',
  PAYMENT_RECEIVED: 'Payment Received',
};

interface DispatchNotificationPayload {
  type: string;
  message: string;
  saleId?: string;
  organizationId: string;
  recipientIds: string[];
  data?: Record<string, unknown>;
}

@Injectable()
export class SalesNotificationService {
  private readonly logger = new Logger(SalesNotificationService.name);
  private readonly notificationHelper: NotificationHelper;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notifQueue: Queue,
  ) {
    this.notificationHelper = new NotificationHelper(notifQueue);
  }

  async dispatch(payload: DispatchNotificationPayload): Promise<void> {
    if (payload.recipientIds.length === 0) {
      this.logger.warn(`No notification recipients resolved for ${payload.type}`);
      return;
    }

    const mappedType = TYPE_MAP[payload.type] ?? payload.type;
    const title = TITLE_MAP[payload.type] ?? payload.type;

    await this.notificationHelper.notify({
      organizationId: payload.organizationId,
      recipientIds: payload.recipientIds,
      type: mappedType,
      module: AppModule.SALES,
      title,
      body: payload.message,
      entityType: 'sale',
      entityId: payload.saleId,
      url: payload.saleId ? `/dashboard/sales/${payload.saleId}` : undefined,
      data: payload.data,
    });
  }

  async resolveRecipientsByRole(
    organizationId: string,
    roles: UserRole[],
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: { in: roles },
        isActive: true,
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }
}
