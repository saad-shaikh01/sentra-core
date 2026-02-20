'use client';

import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useInvoice, usePayInvoice } from '@/hooks/use-invoices';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { IInvoice, InvoiceStatus, IPaymentTransaction, TransactionStatus } from '@sentra-core/types';
import { Download, AlertCircle } from 'lucide-react';

interface InvoiceDetailSheetProps {
  invoiceId: string | null;
  onClose: () => void;
}

type InvoiceWithRelations = IInvoice & {
  transactions?: IPaymentTransaction[];
  sale?: { totalAmount: number; currency: string };
  client?: { companyName: string };
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
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Invoice #" value={<span className="text-sm font-mono">{invoice.invoiceNumber}</span>} />
            <InfoCard label="Status" value={<StatusBadge status={invoice.status} />} />
            <InfoCard label="Amount" value={<span className="text-sm font-bold">${invoice.amount}</span>} />
            <InfoCard label="Due Date" value={<span className="text-sm">{new Date(invoice.dueDate).toLocaleDateString()}</span>} />
          </div>

          {invoice.notes && (
            <InfoCard label="Notes" value={<span className="text-sm">{invoice.notes}</span>} />
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            {invoice.status !== InvoiceStatus.PAID && (
              <Button
                className="flex-1"
                onClick={handlePay}
                disabled={payInvoice.isPending}
              >
                {payInvoice.isPending ? 'Processing…' : 'Pay Invoice'}
              </Button>
            )}
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
                      <p className="text-xs text-muted-foreground">{t.type} · {new Date(t.createdAt).toLocaleDateString()}</p>
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
