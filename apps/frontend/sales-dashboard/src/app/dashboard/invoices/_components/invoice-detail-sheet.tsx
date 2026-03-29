'use client';

import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useInvoice, usePayInvoice } from '@/hooks/use-invoices';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { IInvoice, InvoiceStatus, IPaymentTransaction, TransactionStatus, GatewayType } from '@sentra-core/types';
import { Download, AlertCircle } from 'lucide-react';

interface InvoiceDetailSheetProps {
  invoiceId: string | null;
  onClose: () => void;
}

type InvoiceWithRelations = IInvoice & {
  transactions?: Array<
    IPaymentTransaction & {
      gateway?: GatewayType;
      externalRef?: string;
    }
  >;
  sale?: {
    totalAmount: number;
    currency: string;
    gateway?: GatewayType | string;
    customerProfileId?: string;
    paymentProfileId?: string;
    gatewayCustomerId?: string;
    gatewayPaymentMethodId?: string;
  };
  client?: { contactName?: string; email?: string };
};

export function InvoiceDetailSheet({ invoiceId, onClose }: InvoiceDetailSheetProps) {
  const { data: invoice, isLoading, isError } = useInvoice(invoiceId ?? '') as { data: InvoiceWithRelations | undefined; isLoading: boolean; isError: boolean };
  const payInvoice = usePayInvoice();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const handlePay = () => {
    if (!invoiceId) return;
    openConfirmDialog({
      title: 'Pay Invoice?',
      description: `Mark invoice ${invoice?.invoiceNumber} as paid and process the payment.`,
      onConfirm: () => payInvoice.mutate(invoiceId),
    });
  };

  const handleDownloadPdf = async () => {
    if (!invoiceId) return;
    try {
      await api.downloadInvoicePdf(invoiceId);
    } catch {
      // error handled by API client
    }
  };

  return (
    <DetailSheet
      open={!!invoiceId}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice Details'}
      description={invoice ? `$${invoice.amount}` : undefined}
    >
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/10 rounded w-3/4" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load invoice details. Please try again.</p>
        </div>
      ) : invoice ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoCard label="Invoice #" value={<span className="text-sm font-mono">{invoice.invoiceNumber}</span>} />
            <InfoCard label="Status" value={<StatusBadge status={invoice.status} />} />
            <InfoCard label="Amount" value={<span className="text-sm font-bold">${invoice.amount}</span>} />
            <InfoCard label="Invoice Date" value={<span className="text-sm">{new Date(invoice.invoiceDate).toLocaleDateString()}</span>} />
            <InfoCard label="Due Date" value={<span className="text-sm">{new Date(invoice.dueDate).toLocaleDateString()}</span>} />
            <InfoCard label="Paid Date" value={<span className="text-sm">{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : 'Not paid yet'}</span>} />
            {invoice.sale ? (
              <InfoCard label="Sale Total" value={<span className="text-sm font-medium">${invoice.sale.totalAmount}</span>} />
            ) : null}
          </div>

          {invoice.notes && (
            <InfoCard label="Notes" value={<span className="text-sm">{invoice.notes}</span>} />
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            {invoice.status !== InvoiceStatus.PAID && (() => {
              const saleGateway = invoice.sale?.gateway ?? 'MANUAL';
              const isManual = saleGateway === 'MANUAL';
              const hasProfiles =
                !!(invoice.sale?.customerProfileId || invoice.sale?.gatewayCustomerId) &&
                !!(invoice.sale?.paymentProfileId || invoice.sale?.gatewayPaymentMethodId);
              const canPay = isManual || hasProfiles;
              return canPay ? (
                <Button
                  className="flex-1"
                  onClick={handlePay}
                  disabled={payInvoice.isPending}
                >
                  {payInvoice.isPending ? 'Processing…' : 'Pay Invoice'}
                </Button>
              ) : (
                <div className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  Payment profiles not configured on this sale. Use Charge from the sale detail instead.
                </div>
              );
            })()}
          </div>

          {/* Transactions */}
          {invoice.transactions?.length ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Transactions</h3>
              <div className="space-y-2">
                {invoice.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div>
                      <p className="text-sm font-medium">${t.amount}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{t.type} · {new Date(t.createdAt).toLocaleDateString()}</p>
                        <GatewayBadge gateway={t.gateway ?? 'AUTHORIZE_NET'} />
                      </div>
                      {t.externalRef && <p className="text-xs text-muted-foreground/60">Ref: {t.externalRef}</p>}
                      {t.responseMessage && (
                        <p className="text-xs text-muted-foreground/60">{t.responseMessage}</p>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${t.status === TransactionStatus.SUCCESS ? 'text-emerald-400' : t.status === TransactionStatus.FAILED ? 'text-red-400' : 'text-amber-400'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </DetailSheet>
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
