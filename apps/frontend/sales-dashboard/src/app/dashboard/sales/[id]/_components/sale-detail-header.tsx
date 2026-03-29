'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ArrowLeft, Pencil, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { ISaleWithRelations, SaleStatus, DiscountType, PaymentPlanType } from '@sentra-core/types';
import { usePermissions } from '@/hooks/use-permissions';

interface SaleDetailHeaderProps {
  sale: ISaleWithRelations;
  onEdit?: () => void;
  onRefund?: () => void;
  onChargeback?: () => void;
}

const PAYMENT_PLAN_LABELS: Record<PaymentPlanType, string> = {
  [PaymentPlanType.ONE_TIME]: 'One-Time',
  [PaymentPlanType.INSTALLMENTS]: 'Installments',
  [PaymentPlanType.SUBSCRIPTION]: 'Subscription',
};

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function SaleDetailHeader({ sale, onEdit, onRefund, onChargeback }: SaleDetailHeaderProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const { hasPermission } = usePermissions();

  const canEdit = hasPermission('sales:sales:edit_own');
  const canRefund = hasPermission('sales:sales:charge') && [SaleStatus.ACTIVE, SaleStatus.COMPLETED].includes(sale.status as SaleStatus);
  const canChargeback = hasPermission('sales:sales:charge') && sale.status !== SaleStatus.DRAFT;

  const handleCopyId = () => {
    navigator.clipboard.writeText(sale.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const discountLabel = sale.discountType
    ? sale.discountType === DiscountType.PERCENTAGE
      ? `${sale.discountValue}% discount`
      : `${formatCurrency(sale.discountValue ?? 0, sale.currency)} off`
    : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
      <div className="flex items-start gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mt-0.5 hover:bg-white/10 shrink-0"
          onClick={() => router.push('/dashboard/sales')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyId}
              title={sale.id}
              className="font-mono text-xs sm:text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            >
              {sale.id.slice(0, 8)}...
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
            <StatusBadge status={sale.status} />
            <StatusBadge status={sale.paymentStatus ?? 'UNPAID'} />
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-muted-foreground shrink-0">
              {PAYMENT_PLAN_LABELS[sale.paymentPlan as PaymentPlanType] ?? sale.paymentPlan}
              {sale.paymentPlan === PaymentPlanType.INSTALLMENTS && sale.installmentCount
                ? ` (${sale.installmentCount}x)`
                : ''}
            </span>
          </div>
          <div className="mt-1 flex items-baseline flex-wrap gap-x-2">
            <span className="text-2xl font-bold">{formatCurrency(sale.totalAmount, sale.currency)}</span>
            {sale.discountedTotal != null && sale.discountedTotal !== sale.totalAmount ? (
              <span className="text-sm text-emerald-400 font-medium">
                → {formatCurrency(sale.discountedTotal, sale.currency)}
                {discountLabel ? <span className="text-muted-foreground ml-1 font-normal">({discountLabel})</span> : null}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Collected {formatCurrency(sale.collectedAmount ?? 0, sale.currency)}
            {' · Outstanding '}
            {formatCurrency(sale.outstandingAmount ?? 0, sale.currency)}
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Sale Date {new Date(sale.saleDate ?? sale.createdAt).toLocaleDateString()}
            {' · Updated '}
            {new Date(sale.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-1 sm:flex-none">
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        ) : null}
        {canRefund ? (
          <Button variant="outline" size="sm" className="text-purple-400 border-purple-500/30 hover:bg-purple-500/10 flex-1 sm:flex-none" onClick={onRefund}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Refund
          </Button>
        ) : null}
        {canChargeback ? (
          <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10 flex-1 sm:flex-none" onClick={onChargeback}>
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" /> Chargeback
          </Button>
        ) : null}
      </div>
    </div>
  );
}
