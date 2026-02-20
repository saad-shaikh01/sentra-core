'use client';

import { useState } from 'react';
import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useSale, useCancelSubscription } from '@/hooks/use-sales';
import { useUIStore } from '@/stores/ui-store';
import { ISale, IPaymentTransaction, IInvoice, TransactionStatus } from '@sentra-core/types';
import { ChargeSaleModal } from './charge-sale-modal';
import { SubscribeModal } from './subscribe-modal';
import { CreditCard, RefreshCw, AlertCircle } from 'lucide-react';

interface SaleDetailSheetProps {
  saleId: string | null;
  onClose: () => void;
}

type SaleWithRelations = ISale & {
  transactions?: IPaymentTransaction[];
  invoices?: IInvoice[];
  client?: { companyName: string };
};

export function SaleDetailSheet({ saleId, onClose }: SaleDetailSheetProps) {
  const { data: sale, isLoading, isError } = useSale(saleId ?? '') as { data: SaleWithRelations | undefined; isLoading: boolean; isError: boolean };
  const cancelSubscription = useCancelSubscription();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const [chargeOpen, setChargeOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const handleCancelSub = () => {
    if (!saleId) return;
    openConfirmDialog({
      title: 'Cancel Subscription?',
      description: 'This will stop all future recurring charges.',
      onConfirm: () => cancelSubscription.mutate(saleId),
    });
  };

  return (
    <>
      <DetailSheet
        open={!!saleId}
        onClose={onClose}
        title={`Sale — $${sale?.totalAmount ?? ''} ${sale?.currency ?? ''}`}
        description={sale ? `Status: ${sale.status}` : undefined}
      >
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/10 rounded w-3/4" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-3" />
            <p className="text-sm text-muted-foreground">Failed to load sale details. Please try again.</p>
          </div>
        ) : sale ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Status" value={<StatusBadge status={sale.status} />} />
              <InfoCard label="Currency" value={<span className="text-sm">{sale.currency}</span>} />
              <InfoCard label="Amount" value={<span className="text-sm font-bold">${sale.totalAmount}</span>} />
              <InfoCard label="Client" value={<span className="text-sm">{sale.client?.companyName ?? sale.clientId}</span>} />
            </div>

            {sale.description && (
              <InfoCard label="Description" value={<span className="text-sm">{sale.description}</span>} />
            )}

            {/* Payment profile */}
            {(sale.customerProfileId || sale.paymentProfileId) && (
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Profile</p>
                {sale.customerProfileId && (
                  <p className="text-xs text-muted-foreground">Customer: <span className="text-foreground">{sale.customerProfileId}</span></p>
                )}
                {sale.paymentProfileId && (
                  <p className="text-xs text-muted-foreground">Payment: <span className="text-foreground">{sale.paymentProfileId}</span></p>
                )}
              </div>
            )}

            {/* Subscription */}
            {sale.subscriptionId ? (
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Active Subscription</p>
                    <p className="text-xs text-muted-foreground">{sale.subscriptionId}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={handleCancelSub}
                    disabled={cancelSubscription.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setChargeOpen(true)}
              >
                <CreditCard className="h-4 w-4" />
                Charge Now
              </Button>
              {!sale.subscriptionId && (
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => setSubscribeOpen(true)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Subscribe
                </Button>
              )}
            </div>

            {/* Transactions */}
            {sale.transactions?.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Transactions</h3>
                <div className="space-y-2">
                  {sale.transactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div>
                        <p className="text-sm font-medium">${t.amount}</p>
                        <p className="text-xs text-muted-foreground">{t.type} · {new Date(t.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs font-bold ${t.status === TransactionStatus.SUCCESS ? 'text-emerald-400' : t.status === TransactionStatus.FAILED ? 'text-red-400' : 'text-amber-400'}`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Invoices */}
            {sale.invoices?.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Invoices</h3>
                <div className="space-y-2">
                  {sale.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">Due {new Date(inv.dueDate).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">${inv.amount}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DetailSheet>

      {saleId && (
        <>
          <ChargeSaleModal open={chargeOpen} onOpenChange={setChargeOpen} saleId={saleId} />
          <SubscribeModal open={subscribeOpen} onOpenChange={setSubscribeOpen} saleId={saleId} />
        </>
      )}
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {value}
    </div>
  );
}
