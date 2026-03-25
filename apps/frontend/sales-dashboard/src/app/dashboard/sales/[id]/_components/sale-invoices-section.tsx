'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { IInvoice, InvoiceStatus, ISaleWithRelations } from '@sentra-core/types';
import { ChargePaymentModal } from '@/components/payment/charge-payment-modal';
import { usePermissions } from '@/hooks/use-permissions';

interface SaleInvoicesSectionProps {
  sale: ISaleWithRelations;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function isOverdue(invoice: IInvoice): boolean {
  return (
    invoice.status === InvoiceStatus.OVERDUE ||
    (invoice.status === InvoiceStatus.UNPAID && !!invoice.dueDate && new Date(invoice.dueDate) < new Date())
  );
}

export function SaleInvoicesSection({ sale }: SaleInvoicesSectionProps) {
  const { hasPermission } = usePermissions();
  const canCharge = hasPermission('sales:sales:charge');
  const [payModal, setPayModal] = useState<{ id: string; invoiceNumber: string; amount: number } | null>(null);

  const invoices = sale.invoices ?? [];

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Invoices</h3>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices.</p>
        ) : (
          <>
            {/* Mobile View */}
            <div className="space-y-3 lg:hidden">
              {invoices.map((invoice) => {
                const overdue = isOverdue(invoice);
                return (
                  <div
                    key={invoice.id}
                    className={`rounded-lg border border-white/5 bg-black/20 p-3 space-y-3 ${
                      overdue ? 'border-l-2 border-l-red-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-muted-foreground uppercase">{invoice.invoiceNumber}</p>
                        <p className="font-bold text-sm mt-0.5">{formatCurrency(invoice.amount)}</p>
                      </div>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-white/5">
                      <span className={overdue ? 'text-red-400' : 'text-muted-foreground'}>
                        Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                      </span>
                      <div className="flex items-center gap-2">
                        {invoice.pdfUrl ? (
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10">
                              <FileDown className="h-4 w-4" />
                            </Button>
                          </a>
                        ) : null}
                        {canCharge && invoice.status !== InvoiceStatus.PAID ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() =>
                              setPayModal({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount })
                            }
                          >
                            Pay
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Invoice #</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 text-right font-medium">Due Date</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const overdue = isOverdue(invoice);
                    return (
                      <tr
                        key={invoice.id}
                        className={`border-b border-white/5 ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
                      >
                        <td className="py-2.5 font-mono text-xs">{invoice.invoiceNumber}</td>
                        <td className="py-2.5 text-right">{formatCurrency(invoice.amount)}</td>
                        <td className={`py-2.5 text-right ${overdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {invoice.pdfUrl ? (
                              <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/10">
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                              </a>
                            ) : null}
                            {canCharge && invoice.status !== InvoiceStatus.PAID ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  setPayModal({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount })
                                }
                              >
                                Pay
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {payModal ? (
        <ChargePaymentModal
          open={!!payModal}
          onOpenChange={(v) => { if (!v) setPayModal(null); }}
          sale={sale}
          prefillInvoice={payModal}
        />
      ) : null}
    </>
  );
}
