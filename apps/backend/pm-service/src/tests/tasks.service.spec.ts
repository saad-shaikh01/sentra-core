import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmCacheService } from '../common/cache/pm-cache.service';
import { PmEventsService } from '../modules/events/pm-events.service';
import { TasksService } from '../modules/stages-tasks/tasks.service';

describe('TasksService', () => {
  let service: TasksService;

  const mockPrisma = {
    pmTask: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    pmProjectStage: {
      findFirst: jest.fn(),
    },
    pmTaskWorklog: {
      count: jest.fn(),
    },
    pmTaskSubmission: {
      count: jest.fn(),
    },
    pmFileLink: {
      count: jest.fn(),
    },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };

  const mockCache = {
    invalidateOrgResource: jest.fn(),
    del: jest.fn(),
    buildKey: jest.fn(() => 'k'),
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockEvents = {
    emitTaskAssigned: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PmCacheService, useValue: mockCache },
        { provide: PmEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('reorderByStage accepts empty payload (last-card move edge case)', async () => {
    mockPrisma.pmProjectStage.findFirst.mockResolvedValue({ id: 'stage-1' });

    const result = await service.reorderByStage('org-1', 'stage-1', [], 'user-1');

    expect(result).toEqual({ success: true });
    expect(mockCache.invalidateOrgResource).toHaveBeenCalledWith('org-1', 'tasks');
    expect(mockPrisma.pmTask.findMany).not.toHaveBeenCalled();
  });

  it('move throws if target stage does not exist in project', async () => {
    mockPrisma.pmTask.findFirst.mockResolvedValue({
      id: 'task-1',
      projectId: 'proj-1',
      projectStageId: 'stage-a',
      status: 'READY',
      assigneeId: null,
      isBlocked: false,
      startedAt: null,
      requiresQc: false,
    });
    mockPrisma.pmProjectStage.findFirst.mockResolvedValue(null);

    await expect(
      service.move('org-1', 'task-1', 'stage-missing', 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('remove blocks hard-delete for non PENDING/READY tasks', async () => {
    mockPrisma.pmTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'IN_PROGRESS',
      assigneeId: null,
      isBlocked: false,
      startedAt: null,
      requiresQc: false,
      projectId: 'proj-1',
      projectStageId: 'stage-a',
    });

    await expect(service.remove('org-1', 'task-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('remove blocks hard-delete when work artifacts exist', async () => {
    mockPrisma.pmTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'READY',
      assigneeId: null,
      isBlocked: false,
      startedAt: null,
      requiresQc: false,
      projectId: 'proj-1',
      projectStageId: 'stage-a',
    });
    mockPrisma.pmTaskWorklog.count.mockResolvedValue(1);
    mockPrisma.pmTaskSubmission.count.mockResolvedValue(0);
    mockPrisma.pmFileLink.count.mockResolvedValue(0);

    await expect(service.remove('org-1', 'task-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('remove hard-deletes when rules allow', async () => {
    mockPrisma.pmTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'PENDING',
      assigneeId: null,
      isBlocked: false,
      startedAt: null,
      requiresQc: false,
      projectId: 'proj-1',
      projectStageId: 'stage-a',
    });
    mockPrisma.pmTaskWorklog.count.mockResolvedValue(0);
    mockPrisma.pmTaskSubmission.count.mockResolvedValue(0);
    mockPrisma.pmFileLink.count.mockResolvedValue(0);
    mockPrisma.pmTask.delete.mockResolvedValue({ id: 'task-1' });

    await service.remove('org-1', 'task-1', 'user-1');

    expect(mockPrisma.pmTask.delete).toHaveBeenCalledWith({
      where: { id: 'task-1' },
    });
    expect(mockCache.invalidateOrgResource).toHaveBeenCalledWith('org-1', 'tasks');
  });
});
