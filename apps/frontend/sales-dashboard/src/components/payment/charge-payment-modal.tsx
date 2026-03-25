'use client';

import { useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChargeSale, useRecordPayment } from '@/hooks/use-sales';
import { GatewayType, ISaleWithRelations, InvoiceStatus } from '@sentra-core/types';
import { StripeCardInput, StripeCardInputHandle } from './stripe-card-input';
import { AuthNetCardInput, AuthNetCardInputHandle } from './authnet-card-input';
import { CreditCard, CheckCircle2, Landmark, FileText } from 'lucide-react';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface ChargePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ISaleWithRelations;
  /** Pre-select a specific invoice when opened from the invoices table */
  prefillInvoice?: { id: string; invoiceNumber: string; amount: number };
}

type SelectedGateway = GatewayType.STRIPE | GatewayType.AUTHORIZE_NET | 'MANUAL';

function ChargeForm({
  sale,
  prefillInvoice,
  onClose,
  selectedGateway,
}: {
  sale: ISaleWithRelations;
  prefillInvoice?: { id: string; invoiceNumber: string; amount: number };
  onClose: () => void;
  selectedGateway: SelectedGateway;
}) {
  const isManual = selectedGateway === 'MANUAL';
  const unpaidInvoices = (sale.invoices ?? []).filter((inv) => inv.status !== InvoiceStatus.PAID);

  const [amount, setAmount] = useState(() =>
    prefillInvoice ? String(prefillInvoice.amount) : '',
  );
  const [invoiceId, setInvoiceId] = useState(() => prefillInvoice?.id ?? '');
  const [externalRef, setExternalRef] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const stripeRef = useRef<StripeCardInputHandle>(null);
  const authNetRef = useRef<AuthNetCardInputHandle>(null);

  const chargeSale = useChargeSale();
  const recordPayment = useRecordPayment();

  const selectedInvoice = unpaidInvoices.find((inv) => inv.id === invoiceId);
  const gatewayLabel = selectedGateway === GatewayType.STRIPE ? 'Stripe' : selectedGateway === GatewayType.AUTHORIZE_NET ? 'Authorize.Net' : 'Manual';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    setIsPending(true);
    try {
      if (isManual) {
        if (!note.trim() || note.trim().length < 5) {
          setError('Note is required (min 5 characters)');
          setIsPending(false);
          return;
        }
        await recordPayment.mutateAsync({
          id: sale.id,
          amount: parsedAmount,
          invoiceId: invoiceId || undefined,
          invoiceNumber: selectedInvoice?.invoiceNumber,
          externalRef: externalRef.trim() || undefined,
          note: note.trim(),
        });
        onClose();
        return;
      }

      const payload: Record<string, unknown> = {
        id: sale.id,
        amount: parsedAmount,
        invoiceId: invoiceId || undefined,
        invoiceNumber: selectedInvoice?.invoiceNumber,
      };

      if (selectedGateway === GatewayType.STRIPE) {
        const pmId = await stripeRef.current?.tokenize();
        if (!pmId) throw new Error('Card tokenization failed');
        payload.stripePaymentMethodId = pmId;
      } else if (selectedGateway === GatewayType.AUTHORIZE_NET) {
        const opaqueData = await authNetRef.current?.tokenize();
        if (!opaqueData) throw new Error('Card tokenization failed');
        payload.opaqueData = opaqueData;
      }

      await chargeSale.mutateAsync(payload as any);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-1">
      <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
        <CreditCard className="h-4 w-4 text-sky-400 shrink-0" />
        <p className="text-xs text-sky-300">
          {isManual ? 'Recording a payment made outside the system.' : `Card will be charged via ${gatewayLabel}`}
        </p>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label>Amount *</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      {/* Invoice selector */}
      {unpaidInvoices.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Apply to Invoice (optional)</Label>
          <Select
            value={invoiceId}
            onValueChange={(v) => {
              setInvoiceId(v);
              if (v) {
                const inv = unpaidInvoices.find((i) => i.id === v);
                if (inv) setAmount(String(inv.amount));
              }
            }}
          >
            <SelectTrigger className="border-white/10 bg-white/5">
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {unpaidInvoices.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — ${inv.amount}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Card input */}
      {selectedGateway === GatewayType.STRIPE ? (
        <div className="space-y-1.5">
          <Label>Card Details</Label>
          <StripeCardInput ref={stripeRef} />
        </div>
      ) : null}

      {selectedGateway === GatewayType.AUTHORIZE_NET ? (
        <AuthNetCardInput ref={authNetRef} />
      ) : null}

      {/* Manual-only fields */}
      {isManual ? (
        <>
          <div className="space-y-1.5">
            <Label>External Reference (optional)</Label>
            <Input
              placeholder="Bank ref, cheque #, Billergenie ID…"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note *</Label>
            <Input
              placeholder="Payment source description (min 5 chars)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              minLength={5}
            />
          </div>
        </>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Processing…' : isManual ? 'Record Payment' : 'Charge Now'}
        </Button>
      </div>
    </form>
  );
}

function SavedProfileForm({
  sale,
  prefillInvoice,
  onClose,
}: {
  sale: ISaleWithRelations;
  prefillInvoice?: { id: string; invoiceNumber: string; amount: number };
  onClose: () => void;
}) {
  const unpaidInvoices = (sale.invoices ?? []).filter((inv) => inv.status !== InvoiceStatus.PAID);
  const gateway = sale.gateway as GatewayType;
  const gatewayLabel = gateway === GatewayType.STRIPE ? 'Stripe' : 'Authorize.Net';

  const [amount, setAmount] = useState(() =>
    prefillInvoice ? String(prefillInvoice.amount) : '',
  );
  const [invoiceId, setInvoiceId] = useState(() => prefillInvoice?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const chargeSale = useChargeSale();
  const selectedInvoice = unpaidInvoices.find((inv) => inv.id === invoiceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setIsPending(true);
    try {
      await chargeSale.mutateAsync({
        id: sale.id,
        amount: parsedAmount,
        invoiceId: invoiceId || undefined,
        invoiceNumber: selectedInvoice?.invoiceNumber,
      } as any);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Charge failed');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-1">
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-300">Saved {gatewayLabel} payment profile will be charged</p>
      </div>

      <div className="space-y-1.5">
        <Label>Amount *</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      {unpaidInvoices.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Apply to Invoice (optional)</Label>
          <Select
            value={invoiceId}
            onValueChange={(v) => {
              setInvoiceId(v);
              if (v) {
                const inv = unpaidInvoices.find((i) => i.id === v);
                if (inv) setAmount(String(inv.amount));
              }
            }}
          >
            <SelectTrigger className="border-white/10 bg-white/5">
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {unpaidInvoices.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — ${inv.amount}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Processing…' : 'Charge Now'}
        </Button>
      </div>
    </form>
  );
}

function GatewaySelector({
  onSelect,
  onClose,
}: {
  onSelect: (gw: SelectedGateway) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted-foreground">Select how you want to process this payment:</p>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => onSelect(GatewayType.STRIPE)}
          className="flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3 text-left hover:bg-violet-500/10 transition-colors"
        >
          <CreditCard className="h-5 w-5 text-violet-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-violet-300">Stripe</p>
            <p className="text-xs text-muted-foreground">Credit/debit card via Stripe</p>
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
            <p className="text-xs text-muted-foreground">Credit/debit card via Authorize.Net</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('MANUAL')}
          className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-left hover:bg-amber-500/10 transition-colors"
        >
          <FileText className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">Manual / External</p>
            <p className="text-xs text-muted-foreground">Record a payment made outside the system</p>
          </div>
        </button>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

export function ChargePaymentModal({ open, onOpenChange, sale, prefillInvoice }: ChargePaymentModalProps) {
  const hasSavedProfile = !!(
    (sale.gatewayCustomerId || (sale as any).customerProfileId) &&
    (sale.gatewayPaymentMethodId || (sale as any).paymentProfileId)
  );

  const [selectedGateway, setSelectedGateway] = useState<SelectedGateway | null>(null);

  const handleClose = () => {
    setSelectedGateway(null);
    onOpenChange(false);
  };

  const getTitle = () => {
    if (hasSavedProfile) return 'Charge Saved Card';
    if (!selectedGateway) return 'Process Payment';
    if (selectedGateway === 'MANUAL') return 'Record Manual Payment';
    if (selectedGateway === GatewayType.STRIPE) return 'Charge via Stripe';
    return 'Charge via Authorize.Net';
  };

  const getDescription = () => {
    if (hasSavedProfile) return 'Process a charge using the saved payment method on file.';
    if (!selectedGateway) return 'Choose a payment method to continue.';
    if (selectedGateway === 'MANUAL') return 'Record a payment received outside the system.';
    return 'Enter card details to process the payment.';
  };

  const renderContent = () => {
    if (hasSavedProfile) {
      return <SavedProfileForm sale={sale} prefillInvoice={prefillInvoice} onClose={handleClose} />;
    }

    if (!selectedGateway) {
      return <GatewaySelector onSelect={setSelectedGateway} onClose={handleClose} />;
    }

    const form = (
      <ChargeForm
        sale={sale}
        prefillInvoice={prefillInvoice}
        onClose={handleClose}
        selectedGateway={selectedGateway}
      />
    );

    if (selectedGateway === GatewayType.STRIPE && stripePromise) {
      return <Elements stripe={stripePromise}>{form}</Elements>;
    }

    return form;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
