'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, Users, TrendingUp, Zap,
  AlertTriangle, Clock, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Minus,
  CalendarDays, ChevronDown, BarChart2, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IAnalyticsSummary } from '@sentra-core/types';
import { useAnalyticsSummary, AnalyticsFilters } from '@/hooks/use-analytics';

// ─────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─────────────────────────────────────────────
// Delta Badge
// ─────────────────────────────────────────────

function DeltaBadge({
  current,
  previous,
  isMoney = false,
}: {
  current: number;
  previous: number;
  isMoney?: boolean;
}) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400 font-medium">
        <ArrowUpRight className="h-3 w-3" /> New
      </span>
    );
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}% vs prev
    </span>
  );
}

// ─────────────────────────────────────────────
// Revenue Chart (period-aware, with comparison overlay)
// ─────────────────────────────────────────────

function RevenueChart({
  data,
  granularity,
}: {
  data: { period: string; revenue: number; compRevenue?: number }[];
  granularity: 'weekly' | 'monthly';
}) {
  if (!data.length)
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No data for selected period
      </div>
    );

  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.compRevenue ?? 0]), 1);
  const hasComp = data.some((d) => d.compRevenue != null && d.compRevenue > 0);

  function formatPeriodLabel(period: string) {
    if (granularity === 'weekly') {
      // "2026-W10" → "W10"
      const parts = period.split('-');
      return parts[1] ?? period;
    }
    // "2026-03" → "Mar"
    const [year, month] = period.split('-');
    return new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short' });
  }

  return (
    <div className="space-y-2">
      {hasComp && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/60 inline-block" /> Selected period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-white/20 inline-block" /> Comparison
          </span>
        </div>
      )}
      <div className="flex items-end gap-1.5 h-40 pt-2">
        {data.map((d) => {
          const mainPct = (d.revenue / maxVal) * 100;
          const compPct = d.compRevenue != null ? (d.compRevenue / maxVal) * 100 : null;
          return (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
              <div className="w-full relative flex justify-center gap-0.5" style={{ height: '120px' }}>
                {/* Comparison bar */}
                {compPct != null && (
                  <div
                    className="flex-1 rounded-t bg-white/15 group-hover:bg-white/25 transition-colors self-end"
                    style={{ height: `${Math.max(compPct, 2)}%` }}
                    title={`Comparison: ${fmt(d.compRevenue ?? 0)}`}
                  />
                )}
                {/* Main bar */}
                <div
                  className="flex-1 rounded-t bg-primary/60 group-hover:bg-primary transition-colors self-end"
                  style={{ height: `${Math.max(mainPct, 2)}%` }}
                  title={`${d.period}: ${fmt(d.revenue)}`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground/60 font-medium truncate w-full text-center">
                {formatPeriodLabel(d.period)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Agent Table
// ─────────────────────────────────────────────

function AgentTable({
  data,
}: {
  data: { agentName: string; total: number; converted: number }[];
}) {
  if (!data.length)
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">No agent data for period</div>
    );
  const sorted = [...data].sort((a, b) => {
    const rateA = a.total > 0 ? a.converted / a.total : 0;
    const rateB = b.total > 0 ? b.converted / b.total : 0;
    return rateB - rateA;
  });
  return (
    <div className="space-y-2">
      {sorted.map((a, idx) => {
        const rate = a.total > 0 ? Math.round((a.converted / a.total) * 100) : 0;
        return (
          <div key={a.agentName} className="flex items-center gap-3">
            <div className="w-5 shrink-0 text-xs text-muted-foreground/50 font-bold text-right">
              {idx + 1}
            </div>
            <div className="w-24 shrink-0 text-sm font-medium truncate" title={a.agentName}>
              {a.agentName}
            </div>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${rate}%` }} />
            </div>
            <div className="w-14 shrink-0 text-right text-xs text-muted-foreground">
              {a.converted}/{a.total}
            </div>
            <div className="w-10 shrink-0 text-right text-xs font-semibold text-primary">{rate}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Brand Bars
// ─────────────────────────────────────────────

function BrandBars({
  data,
}: {
  data: { brandName: string; total: number; revenue: number }[];
}) {
  if (!data.length)
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">No brand data for period</div>
    );
  const maxRev = Math.max(...data.map((b) => b.revenue), 1);
  const COLORS = [
    'bg-violet-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-pink-500',
    'bg-cyan-500',
  ];
  return (
    <div className="space-y-3">
      {data.map((b, i) => {
        const pct = (b.revenue / maxRev) * 100;
        return (
          <div key={b.brandName} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{b.brandName}</span>
              <span className="text-muted-foreground">
                {b.total} sales · {fmt(b.revenue)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${COLORS[i % COLORS.length]}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Lead Pipeline
// ─────────────────────────────────────────────

const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500',
  CONTACTED: 'bg-violet-500',
  PROPOSAL: 'bg-amber-500',
  FOLLOW_UP: 'bg-orange-500',
  WON: 'bg-emerald-500',
  LOST: 'bg-red-500',
  NCE: 'bg-slate-500',
  INVALID: 'bg-rose-500',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  PROPOSAL: 'Proposal',
  FOLLOW_UP: 'Follow-up',
  WON: 'Won',
  LOST: 'Lost',
  NCE: 'NCE',
  INVALID: 'Invalid',
};

function LeadPipeline({ data }: { data: { status: string; count: number }[] }) {
  if (!data.length)
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">No lead data for period</div>
    );
  const total = data.reduce((s, d) => s + d.count, 0);
  const STATUS_ORDER = ['NEW', 'CONTACTED', 'PROPOSAL', 'FOLLOW_UP', 'WON', 'LOST', 'NCE', 'INVALID'];
  const sorted = [...data].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  return (
    <div className="space-y-2">
      {sorted.map((d) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const color = LEAD_STATUS_COLORS[d.status] ?? 'bg-gray-500';
        return (
          <div key={d.status} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-xs font-medium truncate">
              {LEAD_STATUS_LABELS[d.status] ?? d.status}
            </div>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            <div className="w-8 shrink-0 text-right text-xs text-muted-foreground">{d.count}</div>
            <div className="w-8 shrink-0 text-right text-xs font-semibold text-muted-foreground/70">
              {pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Dashboard Filter Bar
// ─────────────────────────────────────────────

const PRESETS: { label: string; value: AnalyticsFilters['preset'] }[] = [
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Specific Month', value: 'specific_month' },
  { label: 'Custom Range', value: 'custom' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function DashboardFilterBar({
  filters,
  onChange,
}: {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];

  const activePresetLabel =
    PRESETS.find((p) => p.value === filters.preset)?.label ?? 'Last 30 Days';

  function setPreset(preset: AnalyticsFilters['preset']) {
    const next: AnalyticsFilters = { ...filters, preset };
    // Clear custom range when selecting non-custom presets
    if (preset !== 'custom') {
      delete next.fromDate;
      delete next.toDate;
    }
    if (preset !== 'specific_month') {
      delete next.month;
      delete next.year;
    } else {
      // Default to current month/year
      if (!next.month) next.month = String(new Date().getMonth() + 1);
      if (!next.year) next.year = String(currentYear);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5" />
            {activePresetLabel}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={filters.preset === p.value ? 'bg-accent' : ''}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Specific month picker */}
      {filters.preset === 'specific_month' && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                {MONTHS[(parseInt(filters.month ?? '1', 10) - 1)] ?? 'Month'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {MONTHS.map((m, i) => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => onChange({ ...filters, month: String(i + 1) })}
                  className={filters.month === String(i + 1) ? 'bg-accent' : ''}
                >
                  {m}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                {filters.year ?? currentYear}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-24">
              {years.map((y) => (
                <DropdownMenuItem
                  key={y}
                  onClick={() => onChange({ ...filters, year: String(y) })}
                  className={filters.year === String(y) ? 'bg-accent' : ''}
                >
                  {y}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Custom date range */}
      {filters.preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.fromDate ?? ''}
            onChange={(e) => onChange({ ...filters, fromDate: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filters.toDate ?? ''}
            onChange={(e) => onChange({ ...filters, toDate: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Granularity toggle */}
      <div className="flex items-center rounded-md border border-input overflow-hidden h-8">
        <button
          onClick={() => onChange({ ...filters, granularity: 'monthly' })}
          className={`px-2.5 text-xs h-full transition-colors ${
            (!filters.granularity || filters.granularity === 'monthly')
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => onChange({ ...filters, granularity: 'weekly' })}
          className={`px-2.5 text-xs h-full border-l border-input transition-colors ${
            filters.granularity === 'weekly'
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Weekly
        </button>
      </div>

      {/* Compare mode */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 gap-1.5 text-xs ${filters.compareMode && filters.compareMode !== 'none' ? 'border-primary/50 text-primary' : ''}`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            {filters.compareMode === 'previous_month'
              ? 'vs Prev Month'
              : filters.compareMode === 'previous_period'
              ? 'vs Prev Period'
              : 'Compare'}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem
            onClick={() => onChange({ ...filters, compareMode: 'none' })}
            className={!filters.compareMode || filters.compareMode === 'none' ? 'bg-accent' : ''}
          >
            No comparison
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onChange({ ...filters, compareMode: 'previous_month' })}
            className={filters.compareMode === 'previous_month' ? 'bg-accent' : ''}
          >
            Compare to Prev Month
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onChange({ ...filters, compareMode: 'previous_period' })}
            className={filters.compareMode === 'previous_period' ? 'bg-accent' : ''}
          >
            Compare to Prev Period
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Dashboard Page
// ─────────────────────────────────────────────

export default function DashboardPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    preset: 'last_30_days',
    granularity: 'monthly',
  });

  const { data, isLoading, isError } = useAnalyticsSummary(filters);

  const hasComparison = !!data?.comparison;
  const gran = data?.granularity ?? filters.granularity ?? 'monthly';

  const conversionRate =
    data && data.totalLeads > 0
      ? Math.round((data.convertedLeads / data.totalLeads) * 100)
      : 0;

  const kpis = [
    {
      label: 'Revenue',
      value: fmt(data?.totalRevenue ?? 0),
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      current: data?.thisMonthRevenue ?? 0,
      previous: data?.lastMonthRevenue ?? 0,
      isMoney: true,
      isSnapshot: false,
    },
    {
      label: 'New Leads',
      value: fmtNum(data?.totalLeads ?? 0),
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      current: data?.newLeadsThisMonth ?? 0,
      previous: data?.newLeadsLastMonth ?? 0,
      isMoney: false,
      isSnapshot: false,
    },
    {
      label: 'Lead Conversion',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      current: 0,
      previous: 0,
      isMoney: false,
      isSnapshot: false,
    },
    {
      label: 'Active Sales',
      value: fmtNum(data?.activeSales ?? 0),
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      current: 0,
      previous: 0,
      isMoney: false,
      isSnapshot: true, // snapshot metric, not period-filtered
    },
  ];

  const invoiceCards = [
    {
      label: 'Overdue Invoices',
      count: data?.invoiceSummary?.overdue?.count ?? 0,
      total: data?.invoiceSummary?.overdue?.total ?? 0,
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      isSnapshot: true,
    },
    {
      label: 'Unpaid (Upcoming)',
      count: data?.invoiceSummary?.unpaid?.count ?? 0,
      total: data?.invoiceSummary?.unpaid?.total ?? 0,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      isSnapshot: true,
    },
    {
      label: 'Collected in Period',
      count: data?.invoiceSummary?.paidThisMonth?.count ?? 0,
      total: data?.invoiceSummary?.paidThisMonth?.total ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      isSnapshot: false,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-sm">Failed to load analytics. Please try again.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header + Filter Bar */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Reporting and analytics overview
          </p>
        </div>
        <DashboardFilterBar filters={filters} onChange={setFilters} />

        {/* Active period indicator */}
        {data && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <Activity className="h-3 w-3" />
              <span className="font-medium text-foreground">{data.periodLabel}</span>
              <span>·</span>
              <span className="capitalize">{data.granularity} view</span>
            </span>
            {data.comparison && (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary/80 bg-primary/5 border border-primary/20 rounded-full px-3 py-1">
                <BarChart2 className="h-3 w-3" />
                Comparing to {data.comparison.periodLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="relative">
              {kpi.isSnapshot && (
                <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">
                  snapshot
                </span>
              )}
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">{kpi.value}</div>
                {hasComparison && kpi.current !== 0 && kpi.previous !== 0 && (
                  <DeltaBadge
                    current={kpi.current}
                    previous={kpi.previous}
                    isMoney={kpi.isMoney}
                  />
                )}
                {!hasComparison && kpi.isSnapshot && (
                  <p className="text-xs text-muted-foreground/60">Current state</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Invoice Summary */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Invoice & Payments
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {invoiceCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.08 }}
            >
              <Card className="relative">
                {card.isSnapshot && (
                  <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">
                    snapshot
                  </span>
                )}
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmt(card.total)}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {card.count} invoice{card.count !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue by Period */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Revenue — {gran === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart
              data={data?.revenueByPeriod ?? []}
              granularity={gran}
            />
          </CardContent>
        </Card>

        {/* Sales by Brand */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by Brand</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandBars data={data?.salesByBrand ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead Conversion by Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Performance — Lead Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentTable data={data?.leadsByAgent ?? []} />
          </CardContent>
        </Card>

        {/* Lead Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Pipeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadPipeline data={data?.leadStatusBreakdown ?? []} />
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
