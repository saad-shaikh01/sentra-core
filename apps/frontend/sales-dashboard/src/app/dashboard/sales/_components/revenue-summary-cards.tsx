'use client';

import { TrendingUp, Activity, Clock, AlertTriangle } from 'lucide-react';
import { useSalesSummary } from '@/hooks/use-sales';

interface RevenueSummaryCardsProps {
  brandId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface CardProps {
  label: string;
  amount: number;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
  isLoading: boolean;
}

function RevenueCard({ label, amount, count, icon, colorClass, isLoading }: CardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
        <div className="h-4 w-24 bg-white/10 rounded mb-3" />
        <div className="h-7 w-32 bg-white/10 rounded mb-2" />
        <div className="h-3 w-16 bg-white/10 rounded" />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 relative overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`p-1.5 rounded-lg bg-white/5`}>{icon}</div>
      </div>
      <p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(amount)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{count} sale{count !== 1 ? 's' : ''}</p>
    </div>
  );
}

export function RevenueSummaryCards({ brandId, dateFrom, dateTo }: RevenueSummaryCardsProps) {
  const { data, isLoading } = useSalesSummary({ brandId, dateFrom, dateTo });

  const summary = data as any;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <RevenueCard
        label="Total Revenue"
        amount={summary?.totalRevenue ?? 0}
        count={summary?.totalRevenueCount ?? 0}
        icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
        colorClass="bg-emerald-500"
        isLoading={isLoading}
      />
      <RevenueCard
        label="Active Pipeline"
        amount={summary?.activeRevenue ?? 0}
        count={summary?.activeRevenueCount ?? 0}
        icon={<Activity className="h-3.5 w-3.5 text-blue-400" />}
        colorClass="bg-blue-500"
        isLoading={isLoading}
      />
      <RevenueCard
        label="Pending Revenue"
        amount={summary?.pendingRevenue ?? 0}
        count={summary?.pendingRevenueCount ?? 0}
        icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
        colorClass="bg-amber-500"
        isLoading={isLoading}
      />
      <RevenueCard
        label="Cancelled / Refunded"
        amount={(summary?.cancelledRevenue ?? 0) + (summary?.refundedRevenue ?? 0)}
        count={(summary?.cancelledCount ?? 0) + (summary?.refundedCount ?? 0)}
        icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
        colorClass="bg-red-500"
        isLoading={isLoading}
      />
    </div>
  );
}
