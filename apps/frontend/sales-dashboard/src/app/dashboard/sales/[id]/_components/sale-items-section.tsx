'use client';

import { ISaleItem, DiscountType } from '@sentra-core/types';

interface SaleItemsSectionProps {
  items: ISaleItem[];
  totalAmount: number;
  currency?: string;
  discountType?: DiscountType;
  discountValue?: number;
  discountedTotal?: number;
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function SaleItemsSection({ items, totalAmount, currency = 'USD', discountType, discountValue, discountedTotal }: SaleItemsSectionProps) {
  const subtotal = items.length > 0
    ? items.reduce((sum, item) => sum + (item.customPrice ?? item.unitPrice) * item.quantity, 0)
    : totalAmount;

  const discountLabel = discountType
    ? discountType === DiscountType.PERCENTAGE
      ? `Discount (${discountValue}%)`
      : `Discount`
    : null;

  const discountAmount = discountType && discountedTotal != null
    ? subtotal - discountedTotal
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Items</h3>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items.</p>
      ) : (
        <>
          {/* Mobile View */}
          <div className="space-y-4 lg:hidden">
            {items.map((item) => {
              const lineTotal = (item.customPrice ?? item.unitPrice) * item.quantity;
              return (
                <div key={item.id} className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      {item.packageName && item.packageName !== item.name && (
                        <p className="text-[10px] text-muted-foreground uppercase">{item.packageName}</p>
                      )}
                    </div>
                    <p className="font-bold text-sm ml-2">{formatCurrency(lineTotal, currency)}</p>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground border-t border-white/5 pt-2">
                    <span>{item.quantity} × {formatCurrency(item.customPrice ?? item.unitPrice, currency)}</span>
                    {item.customPrice != null && item.customPrice !== item.unitPrice && (
                      <span className="line-through opacity-50">{formatCurrency(item.unitPrice, currency)}</span>
                    )}
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
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Unit Price</th>
                  <th className="pb-2 text-right font-medium">Custom Price</th>
                  <th className="pb-2 text-right font-medium">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const lineTotal = (item.customPrice ?? item.unitPrice) * item.quantity;
                  return (
                    <tr key={item.id} className="border-b border-white/5">
                      <td className="py-2.5">
                        <p className="font-medium">{item.name}</p>
                        {item.packageName && item.packageName !== item.name ? (
                          <p className="text-xs text-muted-foreground">{item.packageName}</p>
                        ) : null}
                        {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">{item.quantity}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{formatCurrency(item.unitPrice, currency)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {item.customPrice != null ? formatCurrency(item.customPrice, currency) : '—'}
                      </td>
                      <td className="py-2.5 text-right font-medium">{formatCurrency(lineTotal, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 text-sm border-t border-white/10 pt-3">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            {discountLabel && discountAmount != null ? (
              <div className="flex justify-between text-emerald-400">
                <span>{discountLabel}</span>
                <span>− {formatCurrency(discountAmount, currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold text-base border-t border-white/10 pt-2 mt-2">
              <span>Total</span>
              <span>{formatCurrency(discountedTotal ?? subtotal, currency)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
