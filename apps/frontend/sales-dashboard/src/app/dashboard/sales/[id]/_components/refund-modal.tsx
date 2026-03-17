'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { IPaymentTransaction, TransactionType } from '@sentra-core/types';
import { useRefundSale } from '@/hooks/use-sales';

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  transactions: IPaymentTransaction[];
  totalAmount: number;
  discountedTotal?: number;
}

type RefundType = 'FULL' | 'PARTIAL' | 'MANUAL';

export function RefundModal({ isOpen, onClose, saleId, transactions, totalAmount, discountedTotal }: RefundModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [refundType, setRefundType] = useState<RefundType>('FULL');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refundMutation = useRefundSale();

  const chargeTransactions = transactions.filter(
    (tx) => tx.type === TransactionType.ONE_TIME || tx.type === TransactionType.RECURRING
  );

  const effectiveTotal = discountedTotal ?? totalAmount;

  const handleClose = () => {
    setStep(1);
    setRefundType('FULL');
    setAmount('');
    setTransactionId('');
    setNote('');
    setError(null);
    onClose();
  };

  const handleContinue = () => {
    setError(null);
    if (refundType === 'PARTIAL' && (!amount || parseFloat(amount) <= 0)) {
      setError('Amount is required for partial refund');
      return;
    }
    if (refundType === 'MANUAL') {
      if (!amount || parseFloat(amount) <= 0) { setError('Amount is required'); return; }
      if (note.length < 10) { setError('Note must be at least 10 characters'); return; }
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const dto: Record<string, unknown> = { type: refundType };
      if (refundType !== 'FULL') dto.amount = parseFloat(amount);
      if (refundType === 'FULL' || refundType === 'PARTIAL') {
        if (transactionId) dto.transactionId = transactionId;
      }
      if (note) dto.note = note;

      await refundMutation.mutateAsync({ id: saleId, ...dto });
      handleClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Issue Refund' : '⚠️ Confirm Refund'}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Refund Type</Label>
              <Select value={refundType} onValueChange={(v) => setRefundType(v as RefundType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL" disabled={chargeTransactions.length === 0}>Full Refund</SelectItem>
                  <SelectItem value="PARTIAL" disabled={chargeTransactions.length === 0}>Partial Refund</SelectItem>
                  <SelectItem value="MANUAL">Manual Refund</SelectItem>
                </SelectContent>
              </Select>
              {chargeTransactions.length === 0 ? (
                <p className="text-xs text-amber-400">No charged transactions found. Use Manual refund.</p>
              ) : null}
            </div>

            {(refundType === 'PARTIAL' || refundType === 'MANUAL') ? (
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Full refund: {formatCurrency(effectiveTotal)}</p>
            )}

            {(refundType === 'FULL' || refundType === 'PARTIAL') && chargeTransactions.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Transaction</Label>
                <Select value={transactionId} onValueChange={setTransactionId}>
                  <SelectTrigger><SelectValue placeholder="Select transaction" /></SelectTrigger>
                  <SelectContent>
                    {chargeTransactions.map((tx) => (
                      <SelectItem key={tx.id} value={tx.transactionId ?? tx.id}>
                        {tx.transactionId?.slice(0, 12)} — {formatCurrency(tx.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Note {refundType === 'MANUAL' ? '* (min 10 chars)' : '(optional)'}</Label>
              <Textarea placeholder="Reason..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : (
          <div className="py-2 space-y-3">
            <p className="text-sm">
              You are about to issue a{' '}
              <strong>{refundType === 'FULL' ? 'full' : refundType === 'PARTIAL' ? 'partial' : 'manual'} refund</strong>
              {refundType !== 'FULL' && amount ? ` of ${formatCurrency(parseFloat(amount))}` : refundType === 'FULL' ? ` of ${formatCurrency(effectiveTotal)}` : ''}.
            </p>
            {note ? <p className="text-sm text-muted-foreground">Reason: {note}</p> : null}
            <p className="text-xs text-red-400">⚠️ This action cannot be undone.</p>
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
              <Button className="bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={refundMutation.isPending}>
                {refundMutation.isPending ? 'Processing...' : 'Issue Refund'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
