'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSale } from '@/hooks/use-sales';
import { useAuth } from '@/hooks/use-auth';
import { PaymentPlanType, UserRole } from '@sentra-core/types';
import { SaleDetailHeader } from './_components/sale-detail-header';
import { SaleClientSection } from './_components/sale-client-section';
import { SaleStatusControls } from './_components/sale-status-controls';
import { SaleItemsSection } from './_components/sale-items-section';
import { SaleInvoicesSection } from './_components/sale-invoices-section';
import { SaleTransactionsSection } from './_components/sale-transactions-section';
import { SaleSubscriptionSection } from './_components/sale-subscription-section';
import { SaleActivityTimeline } from './_components/sale-activity-timeline';
import { SalePackageSection } from './_components/sale-package-section';
import { SaleContractSection } from './_components/sale-contract-section';
import { SaleFormModal } from '../_components/sale-form-modal';
import { SubscribeModal } from '../_components/subscribe-modal';
import { RefundModal } from './_components/refund-modal';
import { ChargebackModal } from './_components/chargeback-modal';
import { ChargePaymentModal } from '@/components/payment/charge-payment-modal';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: sale, isLoading, isError } = useSale(id);
  const { user } = useAuth();
  const userRole = user?.role;

  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [chargebackOpen, setChargebackOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [collisionWarning, setCollisionWarning] = useState<{ matched: boolean; matchedClientId: string; matchedClientName: string } | null>(null);

  useEffect(() => {
    if (id) {
      const stored = sessionStorage.getItem(`collision-warning-${id}`);
      if (stored) {
        try { setCollisionWarning(JSON.parse(stored)); } catch { /* ignore */ }
      }
    }
  }, [id]);

  const handleDismissCollision = () => {
    sessionStorage.removeItem(`collision-warning-${id}`);
    setCollisionWarning(null);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-24 bg-white/5 rounded-xl" />
        <div className="h-48 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Sale not found or you don&apos;t have permission to view it.</p>
        <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
      </div>
    );
  }

  const canCharge = userRole === UserRole.OWNER || userRole === UserRole.ADMIN || userRole === UserRole.SALES_MANAGER;
  const isSubscription = sale.paymentPlan === PaymentPlanType.SUBSCRIPTION;
  const hasSubscription = !!(sale as any).subscriptionId || !!(sale as any).gatewaySubscriptionId;

  return (
    <div className="max-w-4xl">
      <SaleDetailHeader
        sale={sale}
        userRole={userRole}
        onEdit={() => setEditOpen(true)}
        onRefund={() => setRefundOpen(true)}
        onChargeback={() => setChargebackOpen(true)}
      />

      {/* Payment action buttons */}
      {canCharge ? (
        <div className="flex flex-wrap gap-2 mb-6">
          {!isSubscription ? (
            <Button
              variant="outline"
              size="sm"
              className="border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
              onClick={() => setChargeOpen(true)}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Charge / Record Payment
            </Button>
          ) : null}
          {isSubscription && !hasSubscription ? (
            <Button
              variant="outline"
              size="sm"
              className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
              onClick={() => setSubscribeOpen(true)}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Set Up Subscription
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <SaleClientSection sale={sale} collisionWarning={collisionWarning} />
          {sale.salePackage && <SalePackageSection salePackage={sale.salePackage} currency={sale.currency} />}
          <SaleStatusControls sale={sale} userRole={userRole} />
          <SaleContractSection saleId={sale.id} contractUrl={sale.contractUrl} />
          {isSubscription ? (
            <SaleSubscriptionSection sale={sale} userRole={userRole} />
          ) : null}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <SaleItemsSection
            items={sale.items ?? []}
            totalAmount={sale.totalAmount}
            currency={sale.currency}
            discountType={sale.discountType}
            discountValue={sale.discountValue}
            discountedTotal={sale.discountedTotal}
          />
          <SaleInvoicesSection
            sale={sale}
            userRole={userRole}
          />
          <SaleTransactionsSection transactions={sale.transactions ?? []} />
          <SaleActivityTimeline
            activities={sale.activities ?? []}
            saleId={sale.id}
            userRole={userRole}
          />
        </div>
      </div>

      <SaleFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        sale={sale}
      />

      <RefundModal
        isOpen={refundOpen}
        onClose={() => setRefundOpen(false)}
        saleId={sale.id}
        transactions={sale.transactions ?? []}
        totalAmount={sale.totalAmount}
        discountedTotal={sale.discountedTotal}
      />

      <ChargebackModal
        isOpen={chargebackOpen}
        onClose={() => setChargebackOpen(false)}
        saleId={sale.id}
      />

      {chargeOpen ? (
        <ChargePaymentModal
          open={chargeOpen}
          onOpenChange={setChargeOpen}
          sale={sale}
        />
      ) : null}

      {subscribeOpen ? (
        <SubscribeModal
          open={subscribeOpen}
          onOpenChange={setSubscribeOpen}
          sale={sale}
        />
      ) : null}
    </div>
  );
}
