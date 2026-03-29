'use client';

import { Badge } from '@/components/ui/badge';
import {
  ClientStatus,
  InvoiceStatus,
  LeadStatus,
  SalePaymentStatus,
  SaleStatus,
  TransactionStatus,
} from '@sentra-core/types';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  // Lead
  [LeadStatus.NEW]: { label: 'New', className: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
  [LeadStatus.CONTACTED]: { label: 'Contacted', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  [LeadStatus.PROPOSAL]: { label: 'Proposal', className: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  [LeadStatus.FOLLOW_UP]: { label: 'Follow Up', className: 'bg-orange-500/20 text-orange-400 border-orange-500/20' },
  [LeadStatus.WON]: { label: 'Won', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [LeadStatus.LOST]: { label: 'Lost', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  [LeadStatus.NCE]: { label: 'NCE', className: 'bg-slate-500/20 text-slate-300 border-slate-500/20' },
  [LeadStatus.INVALID]: { label: 'Invalid', className: 'bg-rose-500/20 text-rose-300 border-rose-500/20' },
  // Shared client and sale states
  [ClientStatus.ACTIVE]: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [ClientStatus.COMPLETED]: { label: 'Completed', className: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
  [ClientStatus.INACTIVE]: { label: 'Inactive', className: 'bg-slate-500/20 text-slate-300 border-slate-500/20' },
  [ClientStatus.REFUNDED]: { label: 'Refunded', className: 'bg-amber-500/20 text-amber-300 border-amber-500/20' },
  [ClientStatus.CHARGEBACK]: { label: 'Chargeback', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  [ClientStatus.BLACKLISTED]: { label: 'Blacklisted', className: 'bg-rose-950/70 text-rose-200 border-rose-900/60' },
  // Sale statuses — DRAFT is new; ACTIVE/COMPLETED/REFUNDED share values with ClientStatus above
  [SaleStatus.DRAFT]: { label: 'Draft', className: 'bg-slate-500/20 text-slate-300 border-slate-500/20' },
  [SaleStatus.PENDING]: { label: 'Pending', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  [SaleStatus.ON_HOLD]: { label: 'On Hold', className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/20' },
  [SaleStatus.CANCELLED]: { label: 'Cancelled', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  // Sale payment statuses
  [SalePaymentStatus.PARTIALLY_PAID]: { label: 'Partially Paid', className: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20' },
  // Invoice
  [InvoiceStatus.UNPAID]: { label: 'Unpaid', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  [InvoiceStatus.PAID]: { label: 'Paid', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [InvoiceStatus.OVERDUE]: { label: 'Overdue', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  // Transaction statuses
  [TransactionStatus.SUCCESS]: { label: 'Success', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [TransactionStatus.FAILED]: { label: 'Failed', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  [TransactionStatus.CHARGEBACK_FILED]: { label: 'Chargeback', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  [TransactionStatus.CHARGEBACK_WON]: { label: 'Chargeback Won', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [TransactionStatus.CHARGEBACK_LOST]: { label: 'Chargeback Lost', className: 'bg-rose-500/20 text-rose-300 border-rose-500/20' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: '' };
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-bold uppercase tracking-wider border',
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
