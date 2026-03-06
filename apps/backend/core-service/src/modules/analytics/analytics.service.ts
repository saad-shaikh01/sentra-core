import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IAnalyticsSummary } from '@sentra-core/types';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(orgId: string): Promise<IAnalyticsSummary> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [totalLeads, convertedLeads, activeSales, revenueAgg, leads, sales, brands] = await Promise.all([
      this.prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.lead.count({ where: { organizationId: orgId, convertedClientId: { not: null }, deletedAt: null } }),
      this.prisma.sale.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.sale.aggregate({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      }),
      // Leads by agent (last 12 months)
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { organizationId: orgId, deletedAt: null, createdAt: { gte: twelveMonthsAgo } },
        _count: { id: true },
      }),
      // Sales by month
      this.prisma.sale.findMany({
        where: { organizationId: orgId, createdAt: { gte: twelveMonthsAgo } },
        select: { totalAmount: true, createdAt: true, brandId: true, brand: { select: { name: true } } },
      }),
      // Brands for distribution
      this.prisma.brand.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, _count: { select: { sales: true } } },
      }),
    ]);

    // Build revenue by month
    const monthMap = new Map<string, number>();
    for (const sale of sales) {
      const key = `${sale.createdAt.getFullYear()}-${String(sale.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + Number(sale.totalAmount));
    }
    const revenueByMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));

    // Build leads by agent
    const agentIds = leads.map((l) => l.assignedToId).filter((id): id is string => id !== null);
    const agentUsers = await this.prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const convertedByAgent = await this.prisma.lead.groupBy({
      by: ['assignedToId'],
      where: {
        organizationId: orgId,
        deletedAt: null,
        convertedClientId: { not: null },
        createdAt: { gte: twelveMonthsAgo },
      },
      _count: { id: true },
    });
    const convertedMap = new Map(convertedByAgent.map((r) => [r.assignedToId, r._count.id]));
    const agentMap = new Map(agentUsers.map((u) => [u.id, u.name]));
    const leadsByAgent = leads.map((r) => ({
      agentName: agentMap.get(r.assignedToId ?? '') ?? 'Unassigned',
      total: r._count.id,
      converted: convertedMap.get(r.assignedToId) ?? 0,
    }));

    // Sales by brand
    const brandRevMap = new Map<string, number>();
    for (const sale of sales) {
      brandRevMap.set(sale.brandId, (brandRevMap.get(sale.brandId) ?? 0) + Number(sale.totalAmount));
    }
    const salesByBrand = brands.map((b) => ({
      brandName: b.name,
      total: b._count.sales,
      revenue: brandRevMap.get(b.id) ?? 0,
    }));

    return {
      totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
      totalLeads,
      convertedLeads,
      activeSales,
      revenueByMonth,
      leadsByAgent,
      salesByBrand,
    };
  }
}
