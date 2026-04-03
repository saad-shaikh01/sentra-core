'use client';

import { useRef, useState } from 'react';
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
import { CyberSourceCardInput, CyberSourceCardInputHandle } from './cybersource-card-input';
import { CreditCard, FileText, Building2 } from 'lucide-react';

interface ChargePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ISaleWithRelations;
  /** Pre-select a specific invoice when opened from the invoices table */
  prefillInvoice?: { id: string; invoiceNumber: string; amount: number };
}

type SelectedGateway = GatewayType.CYBERSOURCE | 'MANUAL';

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

  const cyberSourceRef = useRef<CyberSourceCardInputHandle>(null);

  const chargeSale = useChargeSale();
  const recordPayment = useRecordPayment();

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

      // CyberSource
      const opaqueData = await cyberSourceRef.current?.tokenize();
      if (!opaqueData) throw new Error('Card tokenization failed');

      await chargeSale.mutateAsync({
        id: sale.id,
        amount: parsedAmount,
        invoiceId: invoiceId || undefined,
        invoiceNumber: selectedInvoice?.invoiceNumber,
        gateway: GatewayType.CYBERSOURCE,
        opaqueData,
      } as any);
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
          {isManual ? 'Recording a payment made outside the system.' : 'Card will be charged via CyberSource'}
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
              const id = v === 'none' ? '' : v;
              setInvoiceId(id);
              if (id) {
                const inv = unpaidInvoices.find((i) => i.id === id);
                if (inv) setAmount(String(inv.amount));
              }
            }}
          >
            <SelectTrigger className="border-white/10 bg-white/5">
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {unpaidInvoices.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — ${inv.amount}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* CyberSource card input */}
      {!isManual ? <CyberSourceCardInput ref={cyberSourceRef} /> : null}

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
          onClick={() => onSelect(GatewayType.CYBERSOURCE)}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-left hover:bg-emerald-500/10 transition-colors"
        >
          <Building2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">CyberSource</p>
            <p className="text-xs text-muted-foreground">Credit/debit card via CyberSource (Bank of America)</p>
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
  const [selectedGateway, setSelectedGateway] = useState<SelectedGateway | null>(null);

  const handleClose = () => {
    setSelectedGateway(null);
    onOpenChange(false);
  };

  const getTitle = () => {
    if (!selectedGateway) return 'Process Payment';
    if (selectedGateway === 'MANUAL') return 'Record Manual Payment';
    return 'Charge via CyberSource';
  };

  const getDescription = () => {
    if (!selectedGateway) return 'Choose a payment method to continue.';
    if (selectedGateway === 'MANUAL') return 'Record a payment received outside the system.';
    return 'Enter card details to process the payment.';
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {!selectedGateway ? (
          <GatewaySelector onSelect={setSelectedGateway} onClose={handleClose} />
        ) : (
          <ChargeForm
            sale={sale}
            prefillInvoice={prefillInvoice}
            onClose={handleClose}
            selectedGateway={selectedGateway}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
