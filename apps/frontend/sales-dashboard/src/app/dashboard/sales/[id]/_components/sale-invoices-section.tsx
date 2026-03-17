'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { IInvoice, InvoiceStatus, UserRole } from '@sentra-core/types';
import { api } from '@/lib/api';

interface SaleInvoicesSectionProps {
  invoices: IInvoice[];
  saleId: string;
  userRole?: UserRole;
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

export function SaleInvoicesSection({ invoices, saleId, userRole }: SaleInvoicesSectionProps) {
  const canCharge = userRole === UserRole.OWNER || userRole === UserRole.ADMIN;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Invoices</h3>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices.</p>
      ) : (
        <div className="overflow-x-auto">
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
                            onClick={() => {
                              api.payInvoice(invoice.id).catch(() => {});
                            }}
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
      )}
    </div>
  );
}
