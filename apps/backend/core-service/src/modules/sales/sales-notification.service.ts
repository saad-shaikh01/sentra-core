import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@sentra-core/prisma-client';
import { NotificationType, UserRole } from '@prisma/client';

interface DispatchNotificationPayload {
  type: NotificationType;
  message: string;
  saleId?: string;
  organizationId: string;
  recipientIds: string[];
  data?: Record<string, unknown>;
}

@Injectable()
export class SalesNotificationService {
  private readonly logger = new Logger(SalesNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async dispatch(payload: DispatchNotificationPayload): Promise<void> {
    if (payload.recipientIds.length === 0) {
      this.logger.warn(`No notification recipients resolved for ${payload.type}`);
      return;
    }

    await this.prisma.notification.createMany({
      data: payload.recipientIds.map((recipientId) => ({
        type: payload.type,
            message: payload.message,
            saleId: payload.saleId,
            organizationId: payload.organizationId,
            recipientId,
            data: payload.data as Prisma.InputJsonValue | undefined,
          })),
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
