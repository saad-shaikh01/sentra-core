import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaService } from '@sentra-core/prisma-client';
import { NotificationType, UserRole } from '@prisma/client';
import { SalesNotificationService } from '../sales-notification.service';

describe('SalesNotificationService', () => {
  let service: SalesNotificationService;
  let prismaMock: {
    notification: {
      createMany: jest.Mock<Promise<Prisma.BatchPayload>, [unknown]>;
    };
    user: {
      findMany: jest.Mock<Promise<Array<{ id: string }>>, [unknown]>;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      notification: {
        createMany: jest
          .fn<Promise<Prisma.BatchPayload>, [unknown]>()
          .mockResolvedValue({ count: 2 }),
      },
      user: {
        findMany: jest
          .fn<Promise<Array<{ id: string }>>, [unknown]>()
          .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesNotificationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SalesNotificationService>(SalesNotificationService);
  });

  it('dispatch() creates one notification row per recipient', async () => {
    await service.dispatch({
      type: NotificationType.PAYMENT_FAILED,
      message: 'Payment failed for sale sale-1.',
      saleId: 'sale-1',
      organizationId: 'org-1',
      recipientIds: ['user-1', 'user-2'],
      data: { saleId: 'sale-1' },
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          type: NotificationType.PAYMENT_FAILED,
          message: 'Payment failed for sale sale-1.',
          saleId: 'sale-1',
          organizationId: 'org-1',
          recipientId: 'user-1',
          data: { saleId: 'sale-1' },
        },
        {
          type: NotificationType.PAYMENT_FAILED,
          message: 'Payment failed for sale sale-1.',
          saleId: 'sale-1',
          organizationId: 'org-1',
          recipientId: 'user-2',
          data: { saleId: 'sale-1' },
        },
      ],
    });
  });

  it('dispatch() skips createMany when recipientIds is empty', async () => {
    await expect(
      service.dispatch({
        type: NotificationType.PAYMENT_FAILED,
        message: 'Payment failed for sale sale-1.',
        organizationId: 'org-1',
        recipientIds: [],
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it('resolveRecipientsByRole() filters by organization, roles, and isActive', async () => {
    const roles = [UserRole.OWNER, UserRole.ADMIN];

    const recipients = await service.resolveRecipientsByRole('org-1', roles);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        role: { in: roles },
        isActive: true,
      },
      select: { id: true },
    });
    expect(recipients).toEqual(['user-1', 'user-2']);
  });
});
