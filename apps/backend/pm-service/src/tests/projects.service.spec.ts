/**
 * ProjectsService Integration-ish Test
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../modules/engagements-projects/projects.service';
import { ProjectGeneratorService } from '../modules/engagements-projects/project-generator.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmCacheService } from '../common/cache/pm-cache.service';
import { PmEventsService } from '../modules/events/pm-events.service';
import { PmProjectPriority, PmProjectType, PmServiceType } from '../common/enums/pm.enums';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;
  let events: PmEventsService;
  let generator: ProjectGeneratorService;

  const mockPrisma = {
    pmEngagement: {
      findFirst: jest.fn(),
    },
    pmProject: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockEvents = {
    emitProjectCreated: jest.fn(),
  };

  const mockCache = {
    invalidateOrgResource: jest.fn(),
    buildKey: jest.fn(),
    hashQuery: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockGenerator = {
    loadTemplate: jest.fn(),
    generateFromTemplate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PmCacheService, useValue: mockCache },
        { provide: ProjectGeneratorService, useValue: mockGenerator },
        { provide: PmEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get<PrismaService>(PrismaService);
    events = module.get<PmEventsService>(PmEventsService);
    generator = module.get<ProjectGeneratorService>(ProjectGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const orgId = 'org-123';
    const userId = 'user-123';
    const dto = {
      engagementId: 'eng-123',
      brandId: 'brand-123',
      name: 'Test Project',
      projectType: PmProjectType.EXTERNAL,
      serviceType: PmServiceType.PUBLISHING,
      priority: PmProjectPriority.MEDIUM,
    };

    it('should throw NotFoundException if engagement not found', async () => {
      mockPrisma.pmEngagement.findFirst.mockResolvedValue(null);
      await expect(service.create(orgId, userId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should create project and emit event', async () => {
      mockPrisma.pmEngagement.findFirst.mockResolvedValue({ id: 'eng-123' });
      mockPrisma.pmProject.create.mockResolvedValue({
        id: 'proj-123',
        ...dto,
      });

      const result = await service.create(orgId, userId, dto);

      expect(result.id).toBe('proj-123');
      expect(mockEvents.emitProjectCreated).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          projectId: 'proj-123',
          createdById: userId,
        }),
        dto.brandId
      );
    });
  });
});
