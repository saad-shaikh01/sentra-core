/**
 * SlaMonitorService
 *
 * Background worker that periodically checks for SLA breaches and
 * emits escalation events.
 *
 * Rules:
 *  - Runs every hour (default)
 *  - Checks for ACTIVE stages/tasks past their 'dueAt' date
 *  - Emits 'SLA_BREACH' escalation event if not already recorded
 *  - Penalizes the owner lead for stage delays via PerformanceService
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@sentra-core/prisma-client';
import { PerformanceService } from '../performance/performance.service';

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkSlaBreaches() {
    this.logger.log('SLA Monitor: checking for breaches…');
    const now = new Date();

    // 1. Check for Overdue Stages
    const overdueStages = await this.prisma.pmProjectStage.findMany({
      where: {
        status: { in: ['ACTIVE', 'IN_REVIEW', 'BLOCKED', 'READY'] },
        dueAt: { lt: now },
        escalationEvents: { none: { eventType: 'SLA_BREACH' } },
      },
    });

    for (const stage of overdueStages) {
      await this.prisma.pmEscalationEvent.create({
        data: {
          organizationId: stage.organizationId,
          projectId: stage.projectId,
          projectStageId: stage.id,
          eventType: 'SLA_BREACH',
          severity: 'HIGH',
          status: 'OPEN',
          payloadJson: { dueAt: stage.dueAt, currentStatus: stage.status },
        },
      });

      // Daily penalty logic is handled during completion, 
      // but an initial 'SLA_BREACH' penalty can be recorded here too.
      if (stage.ownerLeadId) {
        await this.performance.logEvent({
          organizationId: stage.organizationId,
          userId: stage.ownerLeadId,
          projectId: stage.projectId,
          eventType: 'SLA_BREACH_INITIAL',
          scoreDelta: -25,
        });
      }
    }

    // 2. Check for Overdue Tasks
    const overdueTasks = await this.prisma.pmTask.findMany({
      where: {
        status: { in: ['READY', 'IN_PROGRESS', 'IN_QC', 'REVISION_REQUIRED', 'BLOCKED'] },
        dueAt: { lt: now },
        escalationEvents: { none: { eventType: 'TASK_SLA_BREACH' } },
      },
    });

    for (const task of overdueTasks) {
      await this.prisma.pmEscalationEvent.create({
        data: {
          organizationId: task.organizationId,
          projectId: task.projectId,
          taskId: task.id,
          projectStageId: task.projectStageId,
          eventType: 'TASK_SLA_BREACH',
          severity: 'MEDIUM',
          status: 'OPEN',
          payloadJson: { dueAt: task.dueAt, currentStatus: task.status },
        },
      });

      // Penalize assignee for task delay
      if (task.assigneeId) {
        await this.performance.logEvent({
          organizationId: task.organizationId,
          userId: task.assigneeId,
          projectId: task.projectId,
          taskId: task.id,
          eventType: 'TASK_SLA_BREACH_INITIAL',
          scoreDelta: -15,
        });
      }
    }

    if (overdueStages.length > 0 || overdueTasks.length > 0) {
      this.logger.warn(
        `SLA Monitor: Recorded ${overdueStages.length} stage breaches and ${overdueTasks.length} task breaches.`,
      );
    }
  }
}
