import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client';
import { UserRole } from '@prisma/client';
import { SalesNotificationService } from '../sales-notification.service';

describe('SalesNotificationService', () => {
  let service: SalesNotificationService;
  let queueMock: { add: jest.Mock };
  let prismaMock: {
    user: {
      findMany: jest.Mock<Promise<Array<{ id: string }>>, [unknown]>;
    };
  };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    prismaMock = {
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
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: queueMock },
      ],
    }).compile();

    service = module.get<SalesNotificationService>(SalesNotificationService);
  });

  it('dispatch() enqueues a notification job per call', async () => {
    await service.dispatch({
      type: 'PAYMENT_FAILED',
      message: 'Payment failed for sale sale-1.',
      saleId: 'sale-1',
      organizationId: 'org-1',
      recipientIds: ['user-1', 'user-2'],
      data: { saleId: 'sale-1' },
    });

    expect(queueMock.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = queueMock.add.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe('dispatch');
    expect(jobData).toMatchObject({
      organizationId: 'org-1',
      recipientIds: ['user-1', 'user-2'],
      type: 'PAYMENT_FAILED',
      module: 'SALES',
      title: 'Payment Failed',
      body: 'Payment failed for sale sale-1.',
      entityType: 'sale',
      entityId: 'sale-1',
      url: '/dashboard/sales/sale-1',
    });
  });

  it('dispatch() skips enqueue when recipientIds is empty', async () => {
    await expect(
      service.dispatch({
        type: 'PAYMENT_FAILED',
        message: 'Payment failed for sale sale-1.',
        organizationId: 'org-1',
        recipientIds: [],
      }),
    ).resolves.toBeUndefined();

    expect(queueMock.add).not.toHaveBeenCalled();
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
