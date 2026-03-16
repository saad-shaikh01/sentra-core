import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { PmCacheService } from '../../common/cache/pm-cache.service';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PmCacheService,
  ) {}

  async getProjectHealth(organizationId: string) {
    const cacheKey = this.cache.buildKey(organizationId, 'reports', 'project-health');
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [total, active, blocked, atRisk, offTrack, slaBreaches] =
      await this.prisma.$transaction([
        this.prisma.pmProject.count({ where: { organizationId } }),
        this.prisma.pmProject.count({ where: { organizationId, status: 'ACTIVE' } }),
        this.prisma.pmProject.count({ where: { organizationId, status: 'BLOCKED' } }),
        this.prisma.pmProject.count({ where: { organizationId, healthStatus: 'AT_RISK' } }),
        this.prisma.pmProject.count({ where: { organizationId, healthStatus: 'OFF_TRACK' } }),
        this.prisma.pmEscalationEvent.count({
          where: { organizationId, eventType: 'SLA_BREACH', status: 'OPEN' },
        }),
      ]);

    const atRiskProjects = await this.prisma.pmProject.findMany({
      where: {
        organizationId,
        healthStatus: { in: ['AT_RISK', 'OFF_TRACK', 'BLOCKED'] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        healthStatus: true,
        deliveryDueAt: true,
      },
      orderBy: { deliveryDueAt: 'asc' },
      take: 10,
    });

    const result = {
      summary: { total, active, blocked, atRisk, offTrack, slaBreaches },
      atRiskProjects,
    };
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getSlaBreaches(organizationId: string, page = 1, limit = 20) {
    const cacheKey = this.cache.buildKey(
      organizationId,
      'reports',
      'sla-breaches',
      String(page),
      String(limit),
    );
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pmEscalationEvent.findMany({
        where: { organizationId, eventType: 'SLA_BREACH', status: 'OPEN' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
          task: { select: { id: true, name: true } },
        },
      }),
      this.prisma.pmEscalationEvent.count({
        where: { organizationId, eventType: 'SLA_BREACH', status: 'OPEN' },
      }),
    ]);

    const result = {
      data: rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getTeamPerformance(organizationId: string) {
    const cacheKey = this.cache.buildKey(organizationId, 'reports', 'team-performance');
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const snapshots = await this.prisma.pmScoreSnapshot.findMany({
      where: { organizationId },
      orderBy: { periodStart: 'desc' },
    });

    // Group by userId — take most recent snapshot per user
    const byUser: Record<
      string,
      {
        userId: string;
        latestScore: number;
        periodStart: Date;
        periodEnd: Date;
      }
    > = {};
    for (const s of snapshots) {
      if (!byUser[s.userId]) {
        byUser[s.userId] = {
          userId: s.userId,
          latestScore: s.scoreValue,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
        };
      }
    }

    // Count tasks completed per user
    const completedTasks = await this.prisma.pmTask.groupBy({
      by: ['assigneeId'],
      where: { organizationId, status: 'COMPLETED', assigneeId: { not: null } },
      _count: { id: true },
    });

    const taskCountByUser: Record<string, number> = {};
    for (const t of completedTasks) {
      if (t.assigneeId) taskCountByUser[t.assigneeId] = t._count.id;
    }

    const performance = Object.values(byUser).map((u) => ({
      userId: u.userId,
      tasksCompleted: taskCountByUser[u.userId] ?? 0,
      performanceScore: u.latestScore,
      periodStart: u.periodStart,
      periodEnd: u.periodEnd,
    }));

    performance.sort((a, b) => b.performanceScore - a.performanceScore);

    const result = { data: performance };
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getEngagementFinancials(organizationId: string) {
    const cacheKey = this.cache.buildKey(organizationId, 'reports', 'financials');
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const engagements = await this.prisma.pmEngagement.findMany({
      where: { organizationId },
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = {
      data: engagements.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        saleId: (e as any).saleId ?? null,
        projectCount: e._count.projects,
        createdAt: e.createdAt,
      })),
    };
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async resolveEscalation(organizationId: string, escalationId: string) {
    return this.prisma.pmEscalationEvent.updateMany({
      where: { id: escalationId, organizationId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }
}
