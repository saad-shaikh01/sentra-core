import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IAnalyticsSummary, IAnalyticsFilter, UserRole } from '@sentra-core/types';
import { ScopeService } from '../scope/scope.service';

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoWeekKey(date: Date): string {
  const d = startOfWeek(date);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ResolvedFilters {
  fromDate: Date;
  toDate: Date;
  periodLabel: string;
  granularity: 'weekly' | 'monthly';
  compareMode: 'previous_period' | 'previous_month' | null;
  compFromDate: Date | null;
  compToDate: Date | null;
  compPeriodLabel: string | null;
}

function resolveFilters(filters: IAnalyticsFilter): ResolvedFilters {
  const now = new Date();
  const gran: 'weekly' | 'monthly' = filters.granularity === 'weekly' ? 'weekly' : 'monthly';
  const compare: 'previous_period' | 'previous_month' | null =
    !filters.compareMode || filters.compareMode === 'none' ? null : filters.compareMode;

  let from: Date;
  let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let label: string;

  if (filters.preset === 'this_week') {
    from = startOfWeek(now);
    label = 'This Week';
  } else if (filters.preset === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (filters.preset === 'specific_month' && filters.month && filters.year) {
    const m = parseInt(filters.month, 10) - 1;
    const y = parseInt(filters.year, 10);
    from = new Date(y, m, 1, 0, 0, 0, 0);
    to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    label = new Date(y, m).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (filters.fromDate && filters.toDate) {
    from = new Date(filters.fromDate);
    from.setHours(0, 0, 0, 0);
    to = new Date(filters.toDate);
    to.setHours(23, 59, 59, 999);
    label = `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
  } else {
    // Default: Last 30 days
    from = new Date(now);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
    label = 'Last 30 Days';
  }

  let compFrom: Date | null = null;
  let compTo: Date | null = null;
  let compLabel: string | null = null;

  if (compare === 'previous_month') {
    // Previous calendar month relative to the start of the selected range
    const refMonth = from.getMonth();
    const refYear = from.getFullYear();
    compFrom = new Date(refYear, refMonth - 1, 1, 0, 0, 0, 0);
    compTo = new Date(refYear, refMonth, 0, 23, 59, 59, 999);
    compLabel = compFrom.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (compare === 'previous_period') {
    const rangeMs = to.getTime() - from.getTime();
    compTo = new Date(from.getTime() - 1);
    compFrom = new Date(compTo.getTime() - rangeMs);
    compLabel = `${formatDateLabel(compFrom)} – ${formatDateLabel(compTo)}`;
  }

  return { fromDate: from, toDate: to, periodLabel: label, granularity: gran, compareMode: compare, compFromDate: compFrom, compToDate: compTo, compPeriodLabel: compLabel };
}

function buildPeriodBuckets(
  sales: { createdAt: Date; totalAmount: any }[],
  granularity: 'weekly' | 'monthly',
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sales) {
    const key = granularity === 'weekly' ? isoWeekKey(s.createdAt) : monthKey(s.createdAt);
    map.set(key, (map.get(key) ?? 0) + Number(s.totalAmount));
  }
  return map;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) {}

  async getSummary(
    orgId: string,
    userId: string,
    role: UserRole,
    filters: IAnalyticsFilter = {},
  ): Promise<IAnalyticsSummary> {
    const resolved = resolveFilters(filters);
    const { fromDate, toDate, periodLabel, granularity, compareMode, compFromDate, compToDate, compPeriodLabel } = resolved;

    const now = new Date();
    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const leadWhere = scope.toLeadFilter();
    const saleWhere = scope.toSaleFilter();
    const invoiceSaleWhere = { organizationId: orgId, deletedAt: null };

    // ── Main period queries ──────────────────────────────────────────────
    const [
      totalLeads, convertedLeads, activeSales, revenueAgg,
      periodLeads, periodSales, brands,
      periodRevAgg, leadStatusGroups,
      overdueInvoiceAgg, unpaidInvoiceAgg, paidPeriodInvoiceAgg,
    ] = await Promise.all([
      // Total leads in period
      this.prisma.lead.count({
        where: { ...leadWhere, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
      }),
      // Converted leads in period
      this.prisma.lead.count({
        where: { ...leadWhere, convertedClientId: { not: null }, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
      }),
      // Snapshot: currently active sales (unfiltered by period)
      this.prisma.sale.count({ where: { ...saleWhere, status: 'ACTIVE', deletedAt: null } }),
      // Total revenue in period
      this.prisma.sale.aggregate({
        where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
        _sum: { totalAmount: true },
      }),
      // Leads by agent in period
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { ...leadWhere, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
        _count: { id: true },
      }),
      // Sales in period (for chart + brand breakdown)
      this.prisma.sale.findMany({
        where: { ...saleWhere, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
        select: { totalAmount: true, createdAt: true, brandId: true, brand: { select: { name: true } } },
      }),
      // All brands for org
      this.prisma.brand.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true },
      }),
      // Revenue in period (same as revenueAgg — kept for thisMonthRevenue field)
      this.prisma.sale.aggregate({
        where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
        _sum: { totalAmount: true },
      }),
      // Lead status breakdown in period
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { ...leadWhere, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
        _count: { id: true },
      }),
      // Snapshot: overdue invoices
      this.prisma.invoice.aggregate({
        where: {
          OR: [{ status: 'OVERDUE' }, { status: 'UNPAID', dueDate: { lt: now } }],
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Snapshot: unpaid invoices not yet due
      this.prisma.invoice.aggregate({
        where: { status: 'UNPAID', dueDate: { gte: now }, sale: { is: invoiceSaleWhere } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Period: invoices paid within selected range
      this.prisma.invoice.aggregate({
        where: { status: 'PAID', updatedAt: { gte: fromDate, lte: toDate }, sale: { is: invoiceSaleWhere } },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // ── Comparison period queries ─────────────────────────────────────────
    let compRevenue = 0;
    let compLeads = 0;
    let compConverted = 0;

    if (compareMode && compFromDate && compToDate) {
      const [compRevAgg, compLeadCount, compConvertedCount] = await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...saleWhere, status: { in: ['ACTIVE', 'COMPLETED'] }, deletedAt: null, createdAt: { gte: compFromDate, lte: compToDate } },
          _sum: { totalAmount: true },
        }),
        this.prisma.lead.count({
          where: { ...leadWhere, deletedAt: null, createdAt: { gte: compFromDate, lte: compToDate } },
        }),
        this.prisma.lead.count({
          where: { ...leadWhere, convertedClientId: { not: null }, deletedAt: null, createdAt: { gte: compFromDate, lte: compToDate } },
        }),
      ]);
      compRevenue = Number(compRevAgg._sum.totalAmount ?? 0);
      compLeads = compLeadCount;
      compConverted = compConvertedCount;
    }

    // ── Build period-bucketed chart data ─────────────────────────────────
    const mainBuckets = buildPeriodBuckets(periodSales, granularity);

    let compSales: { createdAt: Date; totalAmount: any }[] = [];
    if (compareMode && compFromDate && compToDate) {
      compSales = await this.prisma.sale.findMany({
        where: { ...saleWhere, deletedAt: null, createdAt: { gte: compFromDate, lte: compToDate } },
        select: { totalAmount: true, createdAt: true },
      });
    }
    const compBuckets = buildPeriodBuckets(compSales, granularity);

    const allPeriodKeys = new Set([...mainBuckets.keys(), ...compBuckets.keys()]);
    const revenueByPeriod = Array.from(allPeriodKeys)
      .sort()
      .map((period) => ({
        period,
        revenue: mainBuckets.get(period) ?? 0,
        ...(compareMode ? { compRevenue: compBuckets.get(period) ?? 0 } : {}),
      }));

    // revenueByMonth (legacy compat): monthly buckets only
    const revenueByMonth = granularity === 'monthly'
      ? revenueByPeriod.map((r) => ({ month: r.period, revenue: r.revenue }))
      : Array.from(buildPeriodBuckets(periodSales, 'monthly').entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, revenue]) => ({ month, revenue }));

    // ── Leads by agent ────────────────────────────────────────────────────
    const agentIds = periodLeads.map((l) => l.assignedToId).filter((id): id is string => id !== null);
    const [agentUsers, convertedByAgent] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { ...leadWhere, deletedAt: null, convertedClientId: { not: null }, createdAt: { gte: fromDate, lte: toDate } },
        _count: { id: true },
      }),
    ]);
    const convertedMap = new Map(convertedByAgent.map((r) => [r.assignedToId, r._count.id]));
    const agentMap = new Map(agentUsers.map((u) => [u.id, u.name]));
    const leadsByAgent = periodLeads.map((r) => ({
      agentName: agentMap.get(r.assignedToId ?? '') ?? 'Unassigned',
      total: r._count.id,
      converted: convertedMap.get(r.assignedToId) ?? 0,
    }));

    // ── Sales by brand ────────────────────────────────────────────────────
    const brandRevMap = new Map<string, { revenue: number; count: number }>();
    for (const s of periodSales) {
      const prev = brandRevMap.get(s.brandId) ?? { revenue: 0, count: 0 };
      brandRevMap.set(s.brandId, { revenue: prev.revenue + Number(s.totalAmount), count: prev.count + 1 });
    }
    const salesByBrand = brands.map((b) => ({
      brandName: b.name,
      total: brandRevMap.get(b.id)?.count ?? 0,
      revenue: brandRevMap.get(b.id)?.revenue ?? 0,
    })).filter((b) => b.total > 0);

    const totalRevenue = Number(revenueAgg._sum.totalAmount ?? 0);
    const periodRevenue = Number(periodRevAgg._sum.totalAmount ?? 0);

    return {
      periodLabel,
      granularity,
      compareMode,
      totalRevenue,
      totalLeads,
      convertedLeads,
      activeSales,
      comparison: compareMode
        ? { revenue: compRevenue, leads: compLeads, convertedLeads: compConverted, periodLabel: compPeriodLabel! }
        : null,
      revenueByMonth,
      revenueByPeriod,
      leadsByAgent,
      salesByBrand,
      leadStatusBreakdown: leadStatusGroups.map((g) => ({ status: g.status, count: g._count.id })),
      thisMonthRevenue: periodRevenue,
      lastMonthRevenue: compRevenue,
      newLeadsThisMonth: totalLeads,
      newLeadsLastMonth: compLeads,
      invoiceSummary: {
        overdue: { count: overdueInvoiceAgg._count.id, total: Number(overdueInvoiceAgg._sum.amount ?? 0) },
        unpaid: { count: unpaidInvoiceAgg._count.id, total: Number(unpaidInvoiceAgg._sum.amount ?? 0) },
        paidThisMonth: { count: paidPeriodInvoiceAgg._count.id, total: Number(paidPeriodInvoiceAgg._sum.amount ?? 0) },
      },
    };
  }
}
