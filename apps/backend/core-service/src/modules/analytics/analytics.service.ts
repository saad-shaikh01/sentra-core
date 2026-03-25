import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IAnalyticsSummary, UserRole } from '@sentra-core/types';
import { ScopeService } from '../scope/scope.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly scopeService: ScopeService) {}

  async getSummary(orgId: string, userId: string, role: UserRole): Promise<IAnalyticsSummary> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const leadWhere = scope.toLeadFilter();
    const saleWhere = scope.toSaleFilter();

    const invoiceSaleWhere = { organizationId: orgId, deletedAt: null };

    const [
      totalLeads, convertedLeads, activeSales, revenueAgg,
      leads, sales, brands,
      thisMonthRevenueAgg, lastMonthRevenueAgg,
      newLeadsThisMonth, newLeadsLastMonth,
      leadStatusGroups,
      overdueInvoiceAgg, unpaidInvoiceAgg, paidThisMonthInvoiceAgg,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadWhere, deletedAt: null } }),
      this.prisma.lead.count({ where: { ...leadWhere, convertedClientId: { not: null }, deletedAt: null } }),
      this.prisma.sale.count({ where: { ...saleWhere, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.sale.aggregate({
        where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null },
        _sum: { totalAmount: true },
      }),
      // Leads by agent (last 12 months)
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { ...leadWhere, deletedAt: null, createdAt: { gte: twelveMonthsAgo } },
        _count: { id: true },
      }),
      // Sales by month
      this.prisma.sale.findMany({
        where: { ...saleWhere, deletedAt: null, createdAt: { gte: twelveMonthsAgo } },
        select: { totalAmount: true, createdAt: true, brandId: true, brand: { select: { name: true } } },
      }),
      // Brands for distribution
      this.prisma.brand.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, _count: { select: { sales: true } } },
      }),
      // This month revenue
      this.prisma.sale.aggregate({
        where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null, createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      // Last month revenue
      this.prisma.sale.aggregate({
        where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { totalAmount: true },
      }),
      // New leads this month
      this.prisma.lead.count({ where: { ...leadWhere, deletedAt: null, createdAt: { gte: startOfMonth } } }),
      // New leads last month
      this.prisma.lead.count({ where: { ...leadWhere, deletedAt: null, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      // Lead status breakdown
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { ...leadWhere, deletedAt: null },
        _count: { id: true },
      }),
      // Overdue invoices
      this.prisma.invoice.aggregate({
        where: {
          OR: [{ status: 'OVERDUE' }, { status: 'UNPAID', dueDate: { lt: now } }],
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Unpaid invoices (not yet due)
      this.prisma.invoice.aggregate({
        where: { status: 'UNPAID', dueDate: { gte: now }, sale: { is: invoiceSaleWhere } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Paid this month
      this.prisma.invoice.aggregate({
        where: {
          status: 'PAID',
          updatedAt: { gte: startOfMonth },
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
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
        ...leadWhere,
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
      thisMonthRevenue: Number(thisMonthRevenueAgg._sum.totalAmount ?? 0),
      lastMonthRevenue: Number(lastMonthRevenueAgg._sum.totalAmount ?? 0),
      newLeadsThisMonth,
      newLeadsLastMonth,
      invoiceSummary: {
        overdue:       { count: overdueInvoiceAgg._count.id,      total: Number(overdueInvoiceAgg._sum.amount ?? 0) },
        unpaid:        { count: unpaidInvoiceAgg._count.id,       total: Number(unpaidInvoiceAgg._sum.amount ?? 0) },
        paidThisMonth: { count: paidThisMonthInvoiceAgg._count.id, total: Number(paidThisMonthInvoiceAgg._sum.amount ?? 0) },
      },
      leadStatusBreakdown: leadStatusGroups.map((g) => ({ status: g.status, count: g._count.id })),
    };
  }
}
