import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { NotificationsService } from '../modules/notifications/notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrisma = {
    pmNotification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('lists notifications with pagination', async () => {
    const rows = [{ id: 'n1', status: 'UNREAD' }];
    mockPrisma.pmNotification.findMany.mockResolvedValue(rows);
    mockPrisma.pmNotification.count.mockResolvedValue(1);

    const result = await service.list('org-1', 'user-1', { page: 1, limit: 20 });

    expect(result.data).toEqual(rows);
    expect(result.meta.total).toBe(1);
    expect(mockPrisma.pmNotification.findMany).toHaveBeenCalled();
    expect(mockPrisma.pmNotification.count).toHaveBeenCalled();
  });

  it('marks one notification as read', async () => {
    mockPrisma.pmNotification.findFirst.mockResolvedValue({ id: 'n1' });
    mockPrisma.pmNotification.update.mockResolvedValue({ id: 'n1', status: 'READ' });

    const result = await service.markRead('org-1', 'user-1', 'n1');

    expect(result).toEqual({ id: 'n1', status: 'READ' });
    expect(mockPrisma.pmNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({ status: 'READ' }),
      }),
    );
  });

  it('throws when marking a non-owned notification', async () => {
    mockPrisma.pmNotification.findFirst.mockResolvedValue(null);

    await expect(service.markRead('org-1', 'user-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks all unread notifications', async () => {
    mockPrisma.pmNotification.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.markAllRead('org-1', 'user-1');

    expect(result).toEqual({ success: true, updatedCount: 3 });
    expect(mockPrisma.pmNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          status: 'UNREAD',
        }),
      }),
    );
  });
});
