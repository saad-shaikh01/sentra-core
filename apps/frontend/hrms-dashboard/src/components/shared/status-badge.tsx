'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  INVITED: { label: 'Invited', className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/20' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-500/20 text-orange-300 border-orange-500/20' },
  DEACTIVATED: { label: 'Deactivated', className: 'bg-slate-500/20 text-slate-300 border-slate-500/20' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: '' };
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-bold uppercase tracking-wider border',
        config.className,
        className,
      )}
    >
      {config.label}
    </Badge>
  );
}
