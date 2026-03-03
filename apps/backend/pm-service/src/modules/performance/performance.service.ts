/**
 * PerformanceService
 *
 * Captures auditable performance events and aggregates scores.
 *
 * Scenarios:
 *  - Artist Pass: +10 pts on QC Approval
 *  - Artist Fail: -5 pts on QC Rejection
 *  - Artist Rejection Loop (3+): -20 pts (escalation)
 *  - Lead Delivery: +50 pts on Stage Completion (on track)
 *  - Lead Delay: -10 pts per day past SLA
 *
 * Tenant isolation: every event is scoped to organizationId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';

export interface PerformanceEventInput {
  organizationId: string;
  userId: string;
  projectId: string;
  taskId?: string;
  eventType: string;
  scoreDelta: number;
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a performance event.
   * Fire-and-forget — errors are logged but never throw to the caller.
   */
  async logEvent(input: PerformanceEventInput): Promise<void> {
    try {
      await this.prisma.pmPerformanceEvent.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId ?? null,
          eventType: input.eventType,
          scoreDelta: input.scoreDelta,
        },
      });
      this.logger.debug(
        `Performance Event: user=${input.userId} delta=${input.scoreDelta} type=${input.eventType}`,
      );
    } catch (err: unknown) {
      this.logger.error(`Failed to log performance event: ${input.eventType}`, err);
    }
  }

  /**
   * Summarize score for a user within a period.
   */
  async getUserScore(
    organizationId: string,
    userId: string,
    periodStart?: Date,
  ): Promise<number> {
    const aggregate = await this.prisma.pmPerformanceEvent.aggregate({
      where: {
        organizationId,
        userId,
        ...(periodStart && { createdAt: { gte: periodStart } }),
      },
      _sum: { scoreDelta: true },
    });

    return aggregate._sum.scoreDelta ?? 0;
  }
}
