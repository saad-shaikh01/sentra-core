'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, TrendingUp, Zap } from 'lucide-react';

interface AnalyticsSummary {
  totalRevenue: number;
  totalLeads: number;
  convertedLeads: number;
  activeSales: number;
  revenueByMonth: { month: string; revenue: number }[];
  leadsByAgent: { agentName: string; total: number; converted: number }[];
  salesByBrand: { brandName: string; total: number; revenue: number }[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
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
  return (
    <div className="space-y-2">
      {data.map((a) => {
        const rate = a.total > 0 ? Math.round((a.converted / a.total) * 100) : 0;
        return (
          <div key={a.agentName} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-sm font-medium truncate" title={a.agentName}>{a.agentName}</div>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${rate}%` }}
              />
            </div>
            <div className="w-12 shrink-0 text-right text-xs text-muted-foreground">
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

export default function DashboardPage() {
  const { data, isLoading } = useQuery<AnalyticsSummary>({
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
    },
    {
      label: 'Total Leads',
      value: String(data?.totalLeads ?? 0),
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Lead Conversion',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
    },
    {
      label: 'Active Sales',
      value: String(data?.activeSales ?? 0),
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
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

      {/* Lead Conversion by Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Conversion by Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTable data={data?.leadsByAgent ?? []} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
