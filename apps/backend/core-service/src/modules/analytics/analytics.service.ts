import { Injectable } from '@nestjs/common';
import { Prisma } from '@sentra-core/prisma-client';
import {
  AnalyticsGranularity,
  IAnalyticsFilter,
  IAnalyticsSummary,
  InvoiceStatus,
  SaleStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
} from '@sentra-core/types';
import {
  BOOKED_SALE_STATUSES,
  toNumber,
} from '../../common/helpers/sales-domain.helper';
import { PrismaService } from '@sentra-core/prisma-client';
import { ScopeService } from '../scope/scope.service';

interface ResolvedFilters {
  fromDate: Date;
  toDate: Date;
  periodLabel: string;
  granularity: AnalyticsGranularity;
  compareMode: 'previous_period' | 'previous_month' | null;
  compFromDate: Date | null;
  compToDate: Date | null;
  compPeriodLabel: string | null;
}

type SaleMetricRow = {
  saleDate: Date;
  totalAmount: unknown;
  discountedTotal: unknown;
  brandId: string;
  brand: { name: string } | null;
};

type TransactionMetricRow = {
  amount: unknown;
  type: string;
  createdAt: Date;
};

function startOfWeek(date: Date): Date {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + diff);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function isoWeekKey(date: Date): string {
  const weekStart = startOfWeek(date);
  const year = weekStart.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(
    ((weekStart.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7,
  );
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveFilters(filters: IAnalyticsFilter): ResolvedFilters {
  const now = new Date();
  const granularity: AnalyticsGranularity = filters.granularity === 'weekly' ? 'weekly' : 'monthly';
  const compareMode =
    !filters.compareMode || filters.compareMode === 'none' ? null : filters.compareMode;

  let fromDate: Date;
  let toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let periodLabel: string;

  if (filters.preset === 'this_week') {
    fromDate = startOfWeek(now);
    periodLabel = 'This Week';
  } else if (filters.preset === 'this_month') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    periodLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (filters.preset === 'specific_month' && filters.month && filters.year) {
    const month = parseInt(filters.month, 10) - 1;
    const year = parseInt(filters.year, 10);
    fromDate = new Date(year, month, 1, 0, 0, 0, 0);
    toDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    periodLabel = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (filters.fromDate && filters.toDate) {
    fromDate = new Date(filters.fromDate);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(filters.toDate);
    toDate.setHours(23, 59, 59, 999);
    periodLabel = `${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`;
  } else {
    fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 30);
    fromDate.setHours(0, 0, 0, 0);
    periodLabel = 'Last 30 Days';
  }

  let compFromDate: Date | null = null;
  let compToDate: Date | null = null;
  let compPeriodLabel: string | null = null;

  if (compareMode === 'previous_month') {
    const referenceMonth = fromDate.getMonth();
    const referenceYear = fromDate.getFullYear();
    compFromDate = new Date(referenceYear, referenceMonth - 1, 1, 0, 0, 0, 0);
    compToDate = new Date(referenceYear, referenceMonth, 0, 23, 59, 59, 999);
    compPeriodLabel = compFromDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else if (compareMode === 'previous_period') {
    const rangeMs = toDate.getTime() - fromDate.getTime();
    compToDate = new Date(fromDate.getTime() - 1);
    compFromDate = new Date(compToDate.getTime() - rangeMs);
    compPeriodLabel = `${formatDateLabel(compFromDate)} - ${formatDateLabel(compToDate)}`;
  }

  return {
    fromDate,
    toDate,
    periodLabel,
    granularity,
    compareMode,
    compFromDate,
    compToDate,
    compPeriodLabel,
  };
}

function withClauses(
  base: Prisma.SaleWhereInput | Prisma.LeadWhereInput,
  clauses: Array<Prisma.SaleWhereInput | Prisma.LeadWhereInput>,
) {
  return clauses.length === 0 ? base : { AND: [base, ...clauses] };
}

function getBookedAmount(sale: Pick<SaleMetricRow, 'discountedTotal' | 'totalAmount'>): number {
  return toNumber(sale.discountedTotal ?? sale.totalAmount);
}

function sumBookedSales(sales: SaleMetricRow[]): number {
  return Math.round(sales.reduce((sum, sale) => sum + getBookedAmount(sale), 0) * 100) / 100;
}

function sumCollectedTransactions(transactions: TransactionMetricRow[]): number {
  const total = transactions.reduce((sum, transaction) => {
    const amount = toNumber(transaction.amount);
    if (transaction.type === TransactionType.REFUND) {
      return sum - amount;
    }

    if (
      transaction.type === TransactionType.ONE_TIME ||
      transaction.type === TransactionType.RECURRING
    ) {
      return sum + amount;
    }

    return sum;
  }, 0);

  return Math.round(total * 100) / 100;
}

function buildRevenueBuckets(
  sales: SaleMetricRow[],
  granularity: AnalyticsGranularity,
): Map<string, number> {
  const buckets = new Map<string, number>();

  for (const sale of sales) {
    const key = granularity === 'weekly' ? isoWeekKey(sale.saleDate) : monthKey(sale.saleDate);
    buckets.set(key, (buckets.get(key) ?? 0) + getBookedAmount(sale));
  }

  return buckets;
}

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
    const {
      fromDate,
      toDate,
      periodLabel,
      granularity,
      compareMode,
      compFromDate,
      compToDate,
      compPeriodLabel,
    } = resolveFilters(filters);

    const now = new Date();
    const scope = await this.scopeService.getUserScope(userId, orgId, role);
    const leadScope = scope.toLeadFilter();
    const saleScope = scope.toSaleFilter();
    const invoiceSaleWhere: Prisma.SaleWhereInput = { ...saleScope, deletedAt: null };

    const periodLeadWhere = withClauses(leadScope, [
      { deletedAt: null },
      { leadDate: { gte: fromDate, lte: toDate } },
    ]) as Prisma.LeadWhereInput;
    const periodConversionWhere = withClauses(leadScope, [
      { deletedAt: null },
      { convertedClientId: { not: null } },
      { convertedAt: { gte: fromDate, lte: toDate } },
    ]) as Prisma.LeadWhereInput;
    const periodSaleWhere = withClauses(saleScope, [
      { deletedAt: null },
      { status: { in: BOOKED_SALE_STATUSES } },
      { saleDate: { gte: fromDate, lte: toDate } },
    ]) as Prisma.SaleWhereInput;
    const activeSalesWhere = withClauses(saleScope, [
      { deletedAt: null },
      { status: SaleStatus.ACTIVE },
    ]) as Prisma.SaleWhereInput;

    const [
      leadCount,
      convertedLeadCount,
      activeSales,
      periodSales,
      createdLeadsByAgent,
      convertedLeadsByAgent,
      leadStatusBreakdown,
      outstandingAgg,
      overdueAgg,
      unpaidUpcomingAgg,
      collectedTransactions,
    ] = await Promise.all([
      this.prisma.lead.count({ where: periodLeadWhere }),
      this.prisma.lead.count({ where: periodConversionWhere }),
      this.prisma.sale.count({ where: activeSalesWhere }),
      this.prisma.sale.findMany({
        where: periodSaleWhere,
        select: {
          saleDate: true,
          totalAmount: true,
          discountedTotal: true,
          brandId: true,
          brand: { select: { name: true } },
        },
      }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: periodLeadWhere,
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: periodConversionWhere,
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: periodLeadWhere,
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          OR: [
            { status: InvoiceStatus.OVERDUE },
            { status: InvoiceStatus.UNPAID, dueDate: { lt: now } },
          ],
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.UNPAID,
          dueDate: { gte: now },
          sale: { is: invoiceSaleWhere },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.paymentTransaction.findMany({
        where: {
          status: TransactionStatus.SUCCESS,
          type: { in: [TransactionType.ONE_TIME, TransactionType.RECURRING, TransactionType.REFUND] },
          createdAt: { gte: fromDate, lte: toDate },
          sale: { is: invoiceSaleWhere },
        },
        select: {
          amount: true,
          type: true,
          createdAt: true,
        },
      }),
    ]);

    let comparison: IAnalyticsSummary['comparison'] = null;
    let comparisonSales: SaleMetricRow[] = [];

    if (compareMode && compFromDate && compToDate) {
      const compLeadWhere = withClauses(leadScope, [
        { deletedAt: null },
        { leadDate: { gte: compFromDate, lte: compToDate } },
      ]) as Prisma.LeadWhereInput;
      const compConversionWhere = withClauses(leadScope, [
        { deletedAt: null },
        { convertedClientId: { not: null } },
        { convertedAt: { gte: compFromDate, lte: compToDate } },
      ]) as Prisma.LeadWhereInput;
      const compSaleWhere = withClauses(saleScope, [
        { deletedAt: null },
        { status: { in: BOOKED_SALE_STATUSES } },
        { saleDate: { gte: compFromDate, lte: compToDate } },
      ]) as Prisma.SaleWhereInput;

      const [
        compLeads,
        compConverted,
        compCollectedTransactions,
        compSalesRows,
      ] = await Promise.all([
        this.prisma.lead.count({ where: compLeadWhere }),
        this.prisma.lead.count({ where: compConversionWhere }),
        this.prisma.paymentTransaction.findMany({
          where: {
            status: TransactionStatus.SUCCESS,
            type: { in: [TransactionType.ONE_TIME, TransactionType.RECURRING, TransactionType.REFUND] },
            createdAt: { gte: compFromDate, lte: compToDate },
            sale: { is: invoiceSaleWhere },
          },
          select: {
            amount: true,
            type: true,
            createdAt: true,
          },
        }),
        this.prisma.sale.findMany({
          where: compSaleWhere,
          select: {
            saleDate: true,
            totalAmount: true,
            discountedTotal: true,
            brandId: true,
            brand: { select: { name: true } },
          },
        }),
      ]);

      comparisonSales = compSalesRows;
      comparison = {
        bookedRevenue: sumBookedSales(compSalesRows),
        collectedCash: sumCollectedTransactions(compCollectedTransactions),
        leadCount: compLeads,
        convertedLeadCount: compConverted,
        salesCount: compSalesRows.length,
        periodLabel: compPeriodLabel ?? 'Comparison Period',
      };
    }

    const mainBuckets = buildRevenueBuckets(periodSales, granularity);
    const comparisonBuckets = buildRevenueBuckets(comparisonSales, granularity);
    const allPeriodKeys = new Set([...mainBuckets.keys(), ...comparisonBuckets.keys()]);

    const revenueByPeriod = Array.from(allPeriodKeys)
      .sort()
      .map((period) => ({
        period,
        bookedRevenue: Math.round((mainBuckets.get(period) ?? 0) * 100) / 100,
        ...(compareMode ? { compBookedRevenue: Math.round((comparisonBuckets.get(period) ?? 0) * 100) / 100 } : {}),
      }));

    const brandMap = new Map<string, { brandName: string; total: number; bookedRevenue: number }>();
    for (const sale of periodSales) {
      const brandName = sale.brand?.name ?? sale.brandId;
      const previous = brandMap.get(brandName) ?? { brandName, total: 0, bookedRevenue: 0 };
      previous.total += 1;
      previous.bookedRevenue += getBookedAmount(sale);
      brandMap.set(brandName, previous);
    }

    const agentIds = Array.from(
      new Set(
        [...createdLeadsByAgent, ...convertedLeadsByAgent]
          .map((group) => group.assignedToId)
          .filter((id): id is string => id !== null),
      ),
    );

    const users = agentIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user.name]));
    const convertedMap = new Map(convertedLeadsByAgent.map((group) => [group.assignedToId, group._count.id]));

    const leadsByAgent = createdLeadsByAgent.map((group) => ({
      agentName: userMap.get(group.assignedToId ?? '') ?? 'Unassigned',
      total: group._count.id,
      converted: convertedMap.get(group.assignedToId) ?? 0,
    }));

    return {
      periodLabel,
      granularity,
      compareMode,
      bookedRevenue: sumBookedSales(periodSales),
      collectedCash: sumCollectedTransactions(collectedTransactions),
      leadCount,
      convertedLeadCount,
      salesCount: periodSales.length,
      activeSales,
      outstandingReceivables: toNumber(outstandingAgg._sum.amount),
      comparison,
      revenueByPeriod,
      leadsByAgent,
      salesByBrand: Array.from(brandMap.values()).map((brand) => ({
        ...brand,
        bookedRevenue: Math.round(brand.bookedRevenue * 100) / 100,
      })),
      leadStatusBreakdown: leadStatusBreakdown.map((group) => ({
        status: group.status,
        count: group._count.id,
      })),
      receivablesSummary: {
        outstanding: {
          count: outstandingAgg._count.id,
          total: toNumber(outstandingAgg._sum.amount),
        },
        overdue: {
          count: overdueAgg._count.id,
          total: toNumber(overdueAgg._sum.amount),
        },
        unpaidUpcoming: {
          count: unpaidUpcomingAgg._count.id,
          total: toNumber(unpaidUpcomingAgg._sum.amount),
        },
      },
    };
  }
}
