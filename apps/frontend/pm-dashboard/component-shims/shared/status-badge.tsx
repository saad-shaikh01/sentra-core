import {
  StatusBadge as SharedStatusBadge,
  type StatusTone,
} from '@sentra-core/frontend-data-display';
import { LeadStatus, SaleStatus, InvoiceStatus } from '@sentra-core/types';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; tone: StatusTone }> = {
  [LeadStatus.NEW]: { label: 'New', tone: 'info' },
  [LeadStatus.CONTACTED]: { label: 'Contacted', tone: 'warning' },
  [LeadStatus.PROPOSAL]: { label: 'Proposal', tone: 'accent' },
  [LeadStatus.CLOSED]: { label: 'Closed', tone: 'success' },
  [SaleStatus.PENDING]: { label: 'Pending', tone: 'warning' },
  [SaleStatus.ACTIVE]: { label: 'Active', tone: 'success' },
  [SaleStatus.COMPLETED]: { label: 'Completed', tone: 'info' },
  [SaleStatus.CANCELLED]: { label: 'Cancelled', tone: 'danger' },
  [InvoiceStatus.UNPAID]: { label: 'Unpaid', tone: 'warning' },
  [InvoiceStatus.PAID]: { label: 'Paid', tone: 'success' },
  [InvoiceStatus.OVERDUE]: { label: 'Overdue', tone: 'danger' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, tone: 'neutral' as const };

  return (
    <SharedStatusBadge
      label={config.label}
      tone={config.tone}
      className={className}
    />
  );
}
