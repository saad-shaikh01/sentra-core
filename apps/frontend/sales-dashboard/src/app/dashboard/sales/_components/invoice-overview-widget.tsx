'use client';

import { AlertCircle, CheckCircle2, Clock, Calendar } from 'lucide-react';
import { useInvoiceSummary } from '@/hooks/use-invoices';

interface InvoiceOverviewWidgetProps {
  brandId?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function InvoiceOverviewWidget({ brandId }: InvoiceOverviewWidgetProps) {
  const { data, isLoading } = useInvoiceSummary({ brandId });
  const summary = data as any;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6 animate-pulse">
        <div className="h-4 w-32 bg-white/10 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 bg-white/10 rounded" />
              <div className="h-6 w-24 bg-white/10 rounded" />
              <div className="h-3 w-12 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sections = [
    {
      label: 'Unpaid',
      count: summary?.unpaid?.count ?? 0,
      total: summary?.unpaid?.total ?? 0,
      icon: <Clock className="h-4 w-4 text-amber-400" />,
      colorClass: 'text-amber-400',
      borderClass: 'border-amber-500/20',
    },
    {
      label: 'Overdue',
      count: summary?.overdue?.count ?? 0,
      total: summary?.overdue?.total ?? 0,
      icon: <AlertCircle className="h-4 w-4 text-red-400" />,
      colorClass: 'text-red-400',
      borderClass: 'border-red-500/30',
    },
    {
      label: 'Paid This Month',
      count: summary?.paidThisMonth?.count ?? 0,
      total: summary?.paidThisMonth?.total ?? 0,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      colorClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/20',
    },
    {
      label: 'Due in 7 Days',
      count: summary?.upcomingDue?.count ?? 0,
      total: summary?.upcomingDue?.total ?? 0,
      icon: <Calendar className="h-4 w-4 text-orange-400" />,
      colorClass: 'text-orange-400',
      borderClass: 'border-orange-500/20',
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Invoice Overview
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border ${s.borderClass} bg-white/5 p-3`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {s.icon}
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.colorClass}`}>{formatCurrency(s.total)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {s.count} invoice{s.count !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
