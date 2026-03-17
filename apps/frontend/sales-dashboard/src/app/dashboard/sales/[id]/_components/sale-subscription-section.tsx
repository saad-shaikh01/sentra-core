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
import { ISaleWithRelations, SaleStatus, UserRole } from '@sentra-core/types';
import { useCancelSubscription } from '@/hooks/use-sales';

interface SaleSubscriptionSectionProps {
  sale: ISaleWithRelations;
  userRole?: UserRole;
}

export function SaleSubscriptionSection({ sale, userRole }: SaleSubscriptionSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelSubscription = useCancelSubscription();

  const isOwnerAdmin = userRole === UserRole.OWNER || userRole === UserRole.ADMIN;
  const isCancelled = [SaleStatus.CANCELLED, SaleStatus.REFUNDED].includes(sale.status as SaleStatus);

  const handleCancel = async () => {
    await cancelSubscription.mutateAsync(sale.id);
    setConfirmOpen(false);
  };

  const statusLabel = isCancelled
    ? 'Cancelled'
    : sale.status === SaleStatus.ACTIVE
    ? 'Active'
    : sale.status === SaleStatus.PENDING
    ? 'Pending Activation'
    : sale.status;

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Subscription</h3>
        <div className="space-y-2 text-sm">
          {sale.subscriptionId ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">ID:</span>
              <span className="font-mono text-xs">{sale.subscriptionId.slice(0, 12)}...</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Subscription not yet activated</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <span>{statusLabel}</span>
          </div>
        </div>
        {isOwnerAdmin && !isCancelled ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => setConfirmOpen(true)}
          >
            Cancel Subscription
          </Button>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to cancel this subscription? The customer will no longer be billed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>No, keep it</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleCancel}
              disabled={cancelSubscription.isPending}
            >
              {cancelSubscription.isPending ? 'Cancelling...' : 'Yes, cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
