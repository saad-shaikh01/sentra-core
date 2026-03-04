'use client';

import { Badge } from '@/components/ui/badge';
import { LeadStatus, SaleStatus, InvoiceStatus } from '@sentra-core/types';
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
  [LeadStatus.CLOSED]: { label: 'Closed', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  // Sale
  [SaleStatus.PENDING]: { label: 'Pending', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  [SaleStatus.ACTIVE]: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [SaleStatus.COMPLETED]: { label: 'Completed', className: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
  [SaleStatus.CANCELLED]: { label: 'Cancelled', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  // Invoice
  [InvoiceStatus.UNPAID]: { label: 'Unpaid', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  [InvoiceStatus.PAID]: { label: 'Paid', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  [InvoiceStatus.OVERDUE]: { label: 'Overdue', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  // PM Task statuses (PENDING/ACTIVE/COMPLETED/CANCELLED covered by Sale/Lead above)
  READY: { label: 'Ready', className: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
  SUBMITTED: { label: 'Under Review', className: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  IN_QC: { label: 'Under Review', className: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-orange-500/20 text-orange-400 border-orange-500/20' },
  BLOCKED: { label: 'Blocked', className: 'bg-red-500/20 text-red-400 border-red-500/20' },
  // PM Stage / Project statuses
  IN_REVIEW: { label: 'In Review', className: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  SKIPPED: { label: 'Skipped', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/20' },
  DRAFT: { label: 'Draft', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/20' },
  WAITING_APPROVAL: { label: 'Waiting Approval', className: 'bg-amber-500/20 text-amber-400 border-amber-500/20' },
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
