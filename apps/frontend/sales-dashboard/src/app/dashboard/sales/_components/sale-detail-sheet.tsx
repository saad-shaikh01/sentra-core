'use client';

import { useState } from 'react';
import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useSale, useCancelSubscription } from '@/hooks/use-sales';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import { useUIStore } from '@/stores/ui-store';
import { ISaleWithRelations, TransactionStatus, GatewayType } from '@sentra-core/types';
import { ChargePaymentModal } from '@/components/payment/charge-payment-modal';
import { SubscribeModal } from './subscribe-modal';
import { CreditCard, RefreshCw, AlertCircle, FileText } from 'lucide-react';

interface SaleDetailSheetProps {
  saleId: string | null;
  onClose: () => void;
}

type SaleTransactionWithGateway = ISaleWithRelations['transactions'][number] & {
  gateway?: GatewayType;
  externalRef?: string;
};

export function SaleDetailSheet({ saleId, onClose }: SaleDetailSheetProps) {
  const { data: sale, isLoading, isError } = useSale(saleId ?? '');
  const { isLoading: isAuthLoading } = useAuth();
  const { data: allAgentsData } = useMembers({ permission: 'sales:sales:view_own' });
  const { hasPermission } = usePermissions();
  const cancelSubscription = useCancelSubscription();

  const agentName = sale?.salesAgentId
    ? ((allAgentsData ?? []).find((a) => a.id === sale.salesAgentId)?.name ?? null)
    : null;
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const [chargeOpen, setChargeOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const canChargeOrSubscribe = !isAuthLoading && hasPermission('sales:sales:charge');
  const hasPaymentProfile = !!(
    (sale?.customerProfileId && sale?.paymentProfileId) ||
    (sale?.gatewayCustomerId && sale?.gatewayPaymentMethodId)
  );

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
        description={sale ? `Lifecycle: ${sale.status} · Payment: ${sale.paymentStatus ?? 'UNPAID'}` : undefined}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoCard label="Lifecycle" value={<StatusBadge status={sale.status} />} />
              <InfoCard label="Payment Status" value={<StatusBadge status={sale.paymentStatus ?? 'UNPAID'} />} />
              <InfoCard label="Currency" value={<span className="text-sm">{sale.currency}</span>} />
              <InfoCard
                label="Financials"
                value={(
                  <div className="space-y-1 text-sm">
                    <div className="font-bold">${sale.totalAmount}</div>
                    <div className="text-muted-foreground">Net ${sale.netAmount ?? sale.discountedTotal ?? sale.totalAmount}</div>
                    <div className="text-muted-foreground">Collected ${sale.collectedAmount ?? 0}</div>
                    <div className="text-muted-foreground">Outstanding ${sale.outstandingAmount ?? 0}</div>
                  </div>
                )}
              />
              <InfoCard label="Client" value={<span className="text-sm">{sale.client.contactName ?? sale.client.email}</span>} />
              <InfoCard label="Agent" value={<span className="text-sm">{agentName ?? 'Unassigned'}</span>} />
              <InfoCard label="Sale Date" value={<span className="text-sm">{new Date(sale.saleDate ?? sale.createdAt).toLocaleDateString()}</span>} />
              <InfoCard label="Created At" value={<span className="text-sm">{new Date(sale.createdAt).toLocaleDateString()}</span>} />
            </div>

            {sale.description && (
              <InfoCard label="Description" value={<span className="text-sm">{sale.description}</span>} />
            )}

            {/* Payment profile / gateway info */}
            {(sale.customerProfileId || sale.paymentProfileId || sale.gatewayCustomerId || sale.gateway === 'MANUAL') && (
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Setup</p>
                  <GatewayBadge gateway={sale.gateway ?? 'AUTHORIZE_NET'} />
                </div>
                {sale.gateway === 'MANUAL' ? (
                  <p className="text-xs text-muted-foreground">External payments recorded manually</p>
                ) : (
                  <>
                    {(sale.customerProfileId || sale.gatewayCustomerId) && (
                      <p className="text-xs text-muted-foreground truncate">
                        Customer: <span className="text-foreground font-mono text-[10px]">{sale.customerProfileId ?? sale.gatewayCustomerId}</span>
                      </p>
                    )}
                    {(sale.paymentProfileId || sale.gatewayPaymentMethodId) && (
                      <p className="text-xs text-muted-foreground truncate">
                        Method: <span className="text-foreground font-mono text-[10px]">{sale.paymentProfileId ?? sale.gatewayPaymentMethodId}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Subscription */}
            {(sale.subscriptionId || sale.gatewaySubscriptionId) ? (
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Active Subscription</p>
                    <p className="text-xs text-muted-foreground">{sale.subscriptionId ?? sale.gatewaySubscriptionId}</p>
                  </div>
                  {canChargeOrSubscribe ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={handleCancelSub}
                      disabled={cancelSubscription.isPending}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!isAuthLoading && canChargeOrSubscribe && !hasPaymentProfile && sale.gateway !== 'MANUAL' ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-300">
                  This sale cannot be charged yet because payment profiles are not configured.
                </p>
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              {canChargeOrSubscribe && hasPaymentProfile && sale.gateway !== 'MANUAL' ? (
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setChargeOpen(true)}>
                  <CreditCard className="h-4 w-4" />
                  Charge Now
                </Button>
              ) : null}
              {canChargeOrSubscribe && hasPaymentProfile && !sale.subscriptionId && !sale.gatewaySubscriptionId && sale.gateway !== 'MANUAL' ? (
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setSubscribeOpen(true)}>
                  <RefreshCw className="h-4 w-4" />
                  Subscribe
                </Button>
              ) : null}
              {canChargeOrSubscribe ? (
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setChargeOpen(true)}>
                  <FileText className="h-4 w-4" />
                  Record Payment
                </Button>
              ) : null}
            </div>

            {/* Transactions */}
            {sale.transactions.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Transactions</h3>
                <div className="space-y-2">
                  {sale.transactions.map((t) => {
                    const transaction = t as SaleTransactionWithGateway;
                    return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">${t.amount}</p>
                          <GatewayBadge gateway={transaction.gateway ?? 'AUTHORIZE_NET'} />
                        </div>
                        <p className="text-xs text-muted-foreground">{t.type} · {new Date(t.createdAt).toLocaleDateString()}</p>
                        {transaction.externalRef && (
                          <p className="text-xs text-muted-foreground/60 truncate">Ref: {transaction.externalRef}</p>
                        )}
                        {t.responseMessage && (
                          <p className="text-xs text-muted-foreground/60 truncate">{t.responseMessage}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold ml-2 shrink-0 ${t.status === TransactionStatus.SUCCESS ? 'text-emerald-400' : t.status === TransactionStatus.FAILED ? 'text-red-400' : 'text-amber-400'}`}>
                        {t.status}
                      </span>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Invoices */}
            {sale.invoices.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Invoices</h3>
                <div className="space-y-2">
                  {sale.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Issued {new Date(inv.invoiceDate).toLocaleDateString()} · Due {new Date(inv.dueDate).toLocaleDateString()}
                        </p>
                        {inv.paidAt ? (
                          <p className="text-xs text-emerald-400/80">Paid {new Date(inv.paidAt).toLocaleDateString()}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">${inv.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DetailSheet>

      {saleId && sale ? (
        <>
          <ChargePaymentModal open={chargeOpen} onOpenChange={setChargeOpen} sale={sale} />
          <SubscribeModal open={subscribeOpen} onOpenChange={setSubscribeOpen} sale={sale} />
        </>
      ) : null}
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

function GatewayBadge({ gateway }: { gateway: string }) {
  const config: Record<string, { label: string; className: string }> = {
    AUTHORIZE_NET: { label: 'AuthNet', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    STRIPE: { label: 'Stripe', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    MANUAL: { label: 'Manual', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  };
  const c = config[gateway] ?? config.AUTHORIZE_NET;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${c.className}`}>
      {c.label}
    </span>
  );
}
