'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DollarSign, Users, TrendingUp, Zap,
  AlertTriangle, Clock, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { IAnalyticsSummary } from '@sentra-core/types';

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function MoMBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400 font-medium">
      <ArrowUpRight className="h-3 w-3" /> New
    </span>
  );
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
      <Minus className="h-3 w-3" /> 0%
    </span>
  );
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}% vs last month
    </span>
  );
}

function RevenueChart({ data }: { data: { month: string; revenue: number }[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No data yet</div>;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="flex items-end gap-1.5 h-40 pt-2">
      {data.map((d) => {
        const pct = (d.revenue / max) * 100;
        const [year, month] = d.month.split('-');
        const label = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'short' });
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="w-full relative flex flex-col justify-end" style={{ height: '120px' }}>
              <div
                className="w-full rounded-t bg-primary/60 group-hover:bg-primary transition-colors"
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${label}: ${fmt(d.revenue)}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground/60 font-medium">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentTable({ data }: { data: { agentName: string; total: number; converted: number }[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground py-6 text-center">No agent data</div>;
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
            <div className="w-5 shrink-0 text-xs text-muted-foreground/50 font-bold text-right">{idx + 1}</div>
            <div className="w-24 shrink-0 text-sm font-medium truncate" title={a.agentName}>{a.agentName}</div>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${rate}%` }}
              />
            </div>
            <div className="w-14 shrink-0 text-right text-xs text-muted-foreground">
              {a.converted}/{a.total}
            </div>
            <div className="w-10 shrink-0 text-right text-xs font-semibold text-primary">
              {rate}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BrandBars({ data }: { data: { brandName: string; total: number; revenue: number }[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground py-6 text-center">No brand data</div>;
  const maxRev = Math.max(...data.map((b) => b.revenue), 1);
  const COLORS = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500'];
  return (
    <div className="space-y-3">
      {data.map((b, i) => {
        const pct = (b.revenue / maxRev) * 100;
        return (
          <div key={b.brandName} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{b.brandName}</span>
              <span className="text-muted-foreground">{b.total} sales · {fmt(b.revenue)}</span>
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

const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW:         'bg-blue-500',
  CONTACTED:   'bg-violet-500',
  PROPOSAL:    'bg-amber-500',
  FOLLOW_UP:   'bg-orange-500',
  WON:         'bg-emerald-500',
  LOST:        'bg-red-500',
  NCE:         'bg-slate-500',
  INVALID:     'bg-rose-500',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW:         'New',
  CONTACTED:   'Contacted',
  PROPOSAL:    'Proposal',
  FOLLOW_UP:   'Follow-up',
  WON:         'Won',
  LOST:        'Lost',
  NCE:         'NCE',
  INVALID:     'Invalid',
};

function LeadPipeline({ data }: { data: { status: string; count: number }[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground py-6 text-center">No lead data</div>;
  const total = data.reduce((s, d) => s + d.count, 0);
  const STATUS_ORDER = ['NEW', 'CONTACTED', 'PROPOSAL', 'FOLLOW_UP', 'WON', 'LOST', 'NCE', 'INVALID'];
  const sorted = [...data].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  return (
    <div className="space-y-2">
      {sorted.map((d) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const color = LEAD_STATUS_COLORS[d.status] ?? 'bg-gray-500';
        return (
          <div key={d.status} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-xs font-medium truncate">{LEAD_STATUS_LABELS[d.status] ?? d.status}</div>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            <div className="w-8 shrink-0 text-right text-xs text-muted-foreground">{d.count}</div>
            <div className="w-8 shrink-0 text-right text-xs font-semibold text-muted-foreground/70">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<IAnalyticsSummary>({
    queryKey: ['analytics-summary'],
    queryFn: () => api.getAnalyticsSummary(),
    staleTime: 60_000,
  });

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

  const conversionRate = data && data.totalLeads > 0
    ? Math.round((data.convertedLeads / data.totalLeads) * 100)
    : 0;

  const kpis = [
    {
      label: 'Total Revenue',
      value: fmt(data?.totalRevenue ?? 0),
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      mom: { current: data?.thisMonthRevenue ?? 0, previous: data?.lastMonthRevenue ?? 0 },
    },
    {
      label: 'Total Leads',
      value: String(data?.totalLeads ?? 0),
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      mom: { current: data?.newLeadsThisMonth ?? 0, previous: data?.newLeadsLastMonth ?? 0 },
    },
    {
      label: 'Lead Conversion',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      mom: null,
    },
    {
      label: 'Active Sales',
      value: String(data?.activeSales ?? 0),
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      mom: null,
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
    },
    {
      label: 'Unpaid (Upcoming)',
      count: data?.invoiceSummary?.unpaid?.count ?? 0,
      total: data?.invoiceSummary?.unpaid?.total ?? 0,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
    {
      label: 'Collected This Month',
      count: data?.invoiceSummary?.paidThisMonth?.count ?? 0,
      total: data?.invoiceSummary?.paidThisMonth?.total ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Analytics overview for the last 12 months</p>
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">{kpi.value}</div>
                {kpi.mom && <MoMBadge current={kpi.mom.current} previous={kpi.mom.previous} />}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Invoice Summary */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invoice & Payments</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {invoiceCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.08 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmt(card.total)}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.count} invoice{card.count !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue by Month */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={data?.revenueByMonth ?? []} />
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
