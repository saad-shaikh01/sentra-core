'use client';

import { useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSubscription } from '@/hooks/use-sales';
import { GatewayType, ISaleWithRelations } from '@sentra-core/types';
import { StripeCardInput, StripeCardInputHandle } from '@/components/payment/stripe-card-input';
import { AuthNetCardInput, AuthNetCardInputHandle } from '@/components/payment/authnet-card-input';
import { CheckCircle2, CreditCard, Landmark } from 'lucide-react';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ISaleWithRelations;
}

interface FormValues {
  name: string;
  intervalLength: string;
  intervalUnit: 'days' | 'months';
  startDate: string;
  totalOccurrences: string;
  amount: string;
}

type SelectedGateway = GatewayType.STRIPE | GatewayType.AUTHORIZE_NET;

function GatewaySelector({
  onSelect,
  onClose,
}: {
  onSelect: (gw: SelectedGateway) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted-foreground">Select a payment gateway for the subscription:</p>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => onSelect(GatewayType.STRIPE)}
          className="flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3 text-left hover:bg-violet-500/10 transition-colors"
        >
          <CreditCard className="h-5 w-5 text-violet-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-violet-300">Stripe</p>
            <p className="text-xs text-muted-foreground">Recurring billing via Stripe</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect(GatewayType.AUTHORIZE_NET)}
          className="flex items-center gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-3 text-left hover:bg-blue-500/10 transition-colors"
        >
          <Landmark className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-300">Authorize.Net</p>
            <p className="text-xs text-muted-foreground">Recurring billing via Authorize.Net</p>
          </div>
        </button>
      </div>
      <div className="flex justify-end pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function SubscribeForm({
  sale,
  onOpenChange,
  selectedGateway,
}: {
  sale: ISaleWithRelations;
  onOpenChange: (v: boolean) => void;
  selectedGateway: SelectedGateway;
}) {
  const createSubscription = useCreateSubscription();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { intervalUnit: 'months' },
  });
  const intervalUnit = watch('intervalUnit');

  const hasSavedProfile = !!(
    (sale.gatewayCustomerId || (sale as any).customerProfileId) &&
    (sale.gatewayPaymentMethodId || (sale as any).paymentProfileId)
  );
  const needsCardInput = !hasSavedProfile;

  const stripeRef = useRef<StripeCardInputHandle>(null);
  const authNetRef = useRef<AuthNetCardInputHandle>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const gatewayLabel = selectedGateway === GatewayType.STRIPE ? 'Stripe' : 'Authorize.Net';

  const onSubmit = async (values: FormValues) => {
    setCardError(null);
    try {
      const payload: Record<string, unknown> = {
        id: sale.id,
        name: values.name,
        intervalLength: parseInt(values.intervalLength),
        intervalUnit: values.intervalUnit,
        startDate: values.startDate,
        totalOccurrences: parseInt(values.totalOccurrences),
        amount: parseFloat(values.amount),
      };

      if (needsCardInput) {
        if (selectedGateway === GatewayType.STRIPE) {
          const pmId = await stripeRef.current?.tokenize();
          if (!pmId) throw new Error('Card tokenization failed');
          payload.stripePaymentMethodId = pmId;
        } else if (selectedGateway === GatewayType.AUTHORIZE_NET) {
          const opaqueData = await authNetRef.current?.tokenize();
          if (!opaqueData) throw new Error('Card tokenization failed');
          payload.opaqueData = opaqueData;
        }
      }

      await createSubscription.mutateAsync(payload as any);
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      setCardError(err instanceof Error ? err.message : 'Subscription creation failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
      {hasSavedProfile ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300">Saved {gatewayLabel} payment profile will be used</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
          <CreditCard className="h-4 w-4 text-sky-400 shrink-0" />
          <p className="text-xs text-sky-300">Card required to set up subscription via {gatewayLabel}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Subscription Name *</Label>
        <Input placeholder="Monthly Plan" {...register('name', { required: 'Required' })} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Interval Length *</Label>
          <Input type="number" placeholder="1" {...register('intervalLength', { required: 'Required' })} />
        </div>
        <div className="space-y-1.5">
          <Label>Interval Unit</Label>
          <Select value={intervalUnit} onValueChange={(v) => setValue('intervalUnit', v as 'days' | 'months')}>
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="months">Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Start Date *</Label>
          <Input type="date" {...register('startDate', { required: 'Required' })} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Occurrences *</Label>
          <Input type="number" placeholder="12" {...register('totalOccurrences', { required: 'Required' })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Amount per Occurrence *</Label>
        <Input type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Required' })} />
      </div>

      {needsCardInput && selectedGateway === GatewayType.STRIPE ? (
        <div className="space-y-1.5">
          <Label>Card Details</Label>
          <StripeCardInput ref={stripeRef} />
        </div>
      ) : null}

      {needsCardInput && selectedGateway === GatewayType.AUTHORIZE_NET ? (
        <AuthNetCardInput ref={authNetRef} />
      ) : null}

      {(createSubscription.error?.message || cardError) ? (
        <p className="text-xs text-destructive">{cardError ?? createSubscription.error?.message}</p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={createSubscription.isPending}>
          {createSubscription.isPending ? 'Creating…' : 'Create Subscription'}
        </Button>
      </div>
    </form>
  );
}

export function SubscribeModal({ open, onOpenChange, sale }: SubscribeModalProps) {
  const hasSavedProfile = !!(
    (sale.gatewayCustomerId || (sale as any).customerProfileId) &&
    (sale.gatewayPaymentMethodId || (sale as any).paymentProfileId)
  );

  // If saved profile exists, derive gateway from sale; otherwise user selects
  const savedGateway = hasSavedProfile ? (sale.gateway as GatewayType | null) : null;
  const [selectedGateway, setSelectedGateway] = useState<SelectedGateway | null>(
    savedGateway === GatewayType.STRIPE || savedGateway === GatewayType.AUTHORIZE_NET
      ? savedGateway
      : null,
  );

  const handleClose = () => {
    if (!hasSavedProfile) setSelectedGateway(null);
    onOpenChange(false);
  };

  const showSelector = !hasSavedProfile && !selectedGateway;

  const renderContent = () => {
    if (showSelector) {
      return <GatewaySelector onSelect={setSelectedGateway} onClose={handleClose} />;
    }

    const gw = selectedGateway ?? GatewayType.AUTHORIZE_NET;
    const form = <SubscribeForm sale={sale} onOpenChange={onOpenChange} selectedGateway={gw} />;

    if (gw === GatewayType.STRIPE && stripePromise) {
      return <Elements stripe={stripePromise}>{form}</Elements>;
    }
    return form;
  };

  return (
    <FormModal
      open={open}
      onOpenChange={handleClose}
      title={showSelector ? 'Set Up Subscription' : selectedGateway === GatewayType.STRIPE ? 'Subscribe via Stripe' : 'Subscribe via Authorize.Net'}
      description={showSelector ? 'Choose a payment gateway for the recurring billing.' : 'Configure the subscription schedule and card details.'}
      error={null}
    >
      {renderContent()}
    </FormModal>
  );
}
