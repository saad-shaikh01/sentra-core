/**
 * QcReviewsService Integration-ish Test
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QcReviewsService } from '../modules/qc-approvals/qc-reviews.service';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmEventsService } from '../modules/events/pm-events.service';
import { PerformanceService } from '../modules/performance/performance.service';

describe('QcReviewsService', () => {
  let service: QcReviewsService;
  let performance: PerformanceService;

  const mockPrisma = {
    pmTaskSubmission: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    pmQcReview: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    pmTask: {
      update: jest.fn(),
    },
    pmEscalationEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockEvents = {
    emitQcReviewCompleted: jest.fn(),
  };

  const mockPerformance = {
    logEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PmEventsService, useValue: mockEvents },
        { provide: PerformanceService, useValue: mockPerformance },
      ],
    }).compile();

    service = module.get<QcReviewsService>(QcReviewsService);
    performance = module.get<PerformanceService>(PerformanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReview', () => {
    const orgId = 'org-123';
    const subId = 'sub-123';
    const reviewerId = 'rev-123';
    const dto = {
      decision: 'APPROVED' as any,
      feedback: 'Good work',
    };

    const submission = {
      id: subId,
      status: 'SUBMITTED',
      task: {
        id: 'task-123',
        organizationId: orgId,
        projectId: 'proj-123',
        projectStageId: 'stage-123',
        status: 'IN_QC',
        assigneeId: 'artist-123',
      },
    };

    it('should award points on approval', async () => {
      mockPrisma.pmTaskSubmission.findFirst.mockResolvedValue(submission);
      mockPrisma.pmQcReview.findFirst.mockResolvedValue(null);
      mockPrisma.pmQcReview.create.mockResolvedValue({ id: 'review-1' });

      await service.createReview(orgId, subId, reviewerId, dto);

      expect(mockPerformance.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'artist-123',
          eventType: 'QC_PASS',
          scoreDelta: 10,
        })
      );
    });

    it('should deduct points on rejection', async () => {
      mockPrisma.pmTaskSubmission.findFirst.mockResolvedValue(submission);
      mockPrisma.pmQcReview.findFirst.mockResolvedValue(null);
      mockPrisma.pmQcReview.create.mockResolvedValue({ id: 'review-2' });
      mockPrisma.pmQcReview.count.mockResolvedValue(1);

      await service.createReview(orgId, subId, reviewerId, { decision: 'REJECTED' as any, feedback: 'Redo it' });

      expect(mockPerformance.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'artist-123',
          eventType: 'QC_REJECT',
          scoreDelta: -5,
        })
      );
    });
  });
});
