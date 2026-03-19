'use client';

import { IPaymentTransaction, TransactionStatus, TransactionType } from '@sentra-core/types';
import { StatusBadge } from '@/components/shared';

interface SaleTransactionsSectionProps {
  transactions: IPaymentTransaction[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  [TransactionType.ONE_TIME]: 'Charge',
  [TransactionType.RECURRING]: 'Recurring',
  [TransactionType.VOID]: 'Void',
  [TransactionType.REFUND]: 'Refund',
  [TransactionType.CHARGEBACK]: 'Chargeback',
};

export function SaleTransactionsSection({ transactions }: SaleTransactionsSectionProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Transactions</h3>

      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions.</p>
      ) : (
        <>
          {/* Mobile View */}
          <div className="space-y-3 lg:hidden">
            {transactions.map((tx) => {
              const isFailed = tx.status === TransactionStatus.FAILED;
              return (
                <div
                  key={tx.id}
                  className={`rounded-lg border border-white/5 bg-black/20 p-3 space-y-2 ${
                    isFailed ? 'border-l-2 border-l-red-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm">{formatCurrency(tx.amount)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                        {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                      </p>
                    </div>
                    <StatusBadge status={tx.status} />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-2 border-t border-white/5">
                    <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
                    <span className="font-mono">Ref: {tx.transactionId ? tx.transactionId.slice(0, 8) : 'Manual'}</span>
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
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Auth.net Ref</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isFailed = tx.status === TransactionStatus.FAILED;
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-white/5 ${isFailed ? 'bg-red-500/5' : ''}`}
                    >
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                      </td>
                      <td className="py-2.5 text-right font-medium">{formatCurrency(tx.amount)}</td>
                      <td className="py-2.5 text-right">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {tx.transactionId ? `${tx.transactionId.slice(0, 12)}...` : 'Manual'}
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
  );
}
