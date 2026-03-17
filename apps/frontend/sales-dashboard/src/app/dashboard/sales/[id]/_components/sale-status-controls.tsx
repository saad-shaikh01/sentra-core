'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ISaleWithRelations, SaleStatus, UserRole } from '@sentra-core/types';

// Backend-aligned transitions (overrides shared types which has DRAFT: [])
const ALLOWED_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.DRAFT]: [SaleStatus.PENDING, SaleStatus.CANCELLED],
  [SaleStatus.PENDING]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.ACTIVE]: [SaleStatus.COMPLETED, SaleStatus.ON_HOLD, SaleStatus.CANCELLED, SaleStatus.REFUNDED],
  [SaleStatus.ON_HOLD]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.COMPLETED]: [SaleStatus.REFUNDED],
  [SaleStatus.CANCELLED]: [],
  [SaleStatus.REFUNDED]: [],
};
import { useUpdateSale, salesKeys } from '@/hooks/use-sales';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

// Role restrictions for transitions
const ROLE_REQUIRED: Partial<Record<string, UserRole[]>> = {
  [`${SaleStatus.ACTIVE}→${SaleStatus.REFUNDED}`]: [UserRole.OWNER, UserRole.ADMIN],
  [`${SaleStatus.COMPLETED}→${SaleStatus.REFUNDED}`]: [UserRole.OWNER, UserRole.ADMIN],
};

const TRANSITION_LABELS: Record<string, string> = {
  [`→${SaleStatus.PENDING}`]: 'Submit for Processing',
  [`→${SaleStatus.ACTIVE}`]: 'Mark as Active',
  [`→${SaleStatus.COMPLETED}`]: 'Mark as Completed',
  [`→${SaleStatus.ON_HOLD}`]: 'Put On Hold',
  [`→${SaleStatus.CANCELLED}`]: 'Cancel Sale',
  [`→${SaleStatus.REFUNDED}`]: 'Issue Refund',
};

const DANGER_TRANSITIONS = [SaleStatus.CANCELLED, SaleStatus.REFUNDED];

interface SaleStatusControlsProps {
  sale: ISaleWithRelations;
  userRole?: UserRole;
}

export function SaleStatusControls({ sale, userRole }: SaleStatusControlsProps) {
  const [pendingStatus, setPendingStatus] = useState<SaleStatus | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const updateSale = useUpdateSale();

  const currentStatus = sale.status as SaleStatus;
  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  const filteredTransitions = allowedTransitions.filter((to) => {
    const key = `${currentStatus}→${to}`;
    const requiredRoles = ROLE_REQUIRED[key];
    if (!requiredRoles) return true;
    return userRole ? requiredRoles.includes(userRole) : false;
  });

  const handleConfirm = async () => {
    if (!pendingStatus) return;
    setError(null);
    try {
      await updateSale.mutateAsync({ id: sale.id, status: pendingStatus });
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(sale.id) });
      queryClient.invalidateQueries({ queryKey: [...['sales'], 'summary'] });
      setPendingStatus(null);
      setReason('');
      toast.success(`Sale status updated to ${pendingStatus}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  if (filteredTransitions.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status</h3>
        <p className="text-sm text-muted-foreground">No further status changes available.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {filteredTransitions.map((to) => {
            const label = TRANSITION_LABELS[`→${to}`] ?? to;
            const isDanger = DANGER_TRANSITIONS.includes(to);
            return (
              <Button
                key={to}
                variant="outline"
                size="sm"
                disabled={updateSale.isPending}
                className={isDanger ? 'text-red-400 border-red-500/30 hover:bg-red-500/10' : ''}
                onClick={() => setPendingStatus(to)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!pendingStatus} onOpenChange={(open) => { if (!open) { setPendingStatus(null); setReason(''); setError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Change sale status from <strong className="text-foreground">{currentStatus}</strong> to{' '}
              <strong className="text-foreground">{pendingStatus}</strong>?
            </p>
            {DANGER_TRANSITIONS.includes(pendingStatus as SaleStatus) ? (
              <p className="text-xs text-red-400 flex items-center gap-1">
                ⚠️ This action cannot be easily undone.
              </p>
            ) : null}
            {pendingStatus === SaleStatus.CANCELLED ? (
              <Textarea
                placeholder="Cancellation reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingStatus(null); setError(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={updateSale.isPending}
              className={DANGER_TRANSITIONS.includes(pendingStatus as SaleStatus) ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {updateSale.isPending ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
