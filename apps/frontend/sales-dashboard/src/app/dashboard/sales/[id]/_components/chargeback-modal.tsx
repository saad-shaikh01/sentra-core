'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useChargebackSale } from '@/hooks/use-sales';

interface ChargebackModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
}

export function ChargebackModal({ isOpen, onClose, saleId }: ChargebackModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [chargebackDate, setChargebackDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const chargebackMutation = useChargebackSale();

  const handleClose = () => {
    setStep(1);
    setAmount('');
    setNotes('');
    setEvidenceUrl('');
    setChargebackDate(today);
    setError(null);
    onClose();
  };

  const handleContinue = () => {
    setError(null);
    if (!amount || parseFloat(amount) <= 0) { setError('Amount is required'); return; }
    if (notes.length < 10) { setError('Notes must be at least 10 characters'); return; }
    if (evidenceUrl && !evidenceUrl.startsWith('http')) { setError('Evidence URL must be a valid URL'); return; }
    setStep(2);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const dto: Record<string, unknown> = {
        amount: parseFloat(amount),
        notes,
        chargebackDate: chargebackDate || today,
      };
      if (evidenceUrl) dto.evidenceUrl = evidenceUrl;
      await chargebackMutation.mutateAsync({ id: saleId, ...dto });
      handleClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Chargeback failed');
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Record Chargeback' : '⚠️ Confirm Chargeback'}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes * (min 10 chars)</Label>
              <Textarea placeholder="Describe the chargeback reason..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Evidence URL (optional)</Label>
              <Input placeholder="https://..." value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Chargeback Date</Label>
              <Input type="date" value={chargebackDate} onChange={(e) => setChargebackDate(e.target.value)} />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : (
          <div className="py-2 space-y-3">
            <p className="text-sm">
              You are about to record a chargeback of <strong>{formatCurrency(parseFloat(amount || '0'))}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">Notes: {notes}</p>
            <p className="text-xs text-amber-400">
              Note: Recording this chargeback does NOT automatically respond to the dispute with Authorize.net.
              Manual action in the merchant portal is required.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleContinue}>Continue</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setStep(1); setError(null); }}>Back</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={chargebackMutation.isPending}>
                {chargebackMutation.isPending ? 'Processing...' : 'Record Chargeback'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
