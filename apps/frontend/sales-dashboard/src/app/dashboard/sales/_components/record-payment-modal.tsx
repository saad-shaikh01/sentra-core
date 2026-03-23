'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRecordPayment } from '@/hooks/use-sales';

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  invoices?: Array<{ id: string; invoiceNumber: string; amount: number; status: string }>;
}

export function RecordPaymentModal({ open, onOpenChange, saleId, invoices }: RecordPaymentModalProps) {
  const recordPayment = useRecordPayment();
  const [amount, setAmount] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [note, setNote] = useState('');

  const unpaidInvoices = invoices?.filter((inv) => inv.status !== 'PAID') ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const selectedInvoice = unpaidInvoices.find((inv) => inv.id === selectedInvoiceId);

    recordPayment.mutate(
      {
        id: saleId,
        amount: parsedAmount,
        invoiceId: selectedInvoiceId || undefined,
        invoiceNumber: selectedInvoice?.invoiceNumber,
        externalRef: externalRef.trim() || undefined,
        note: note.trim(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setAmount('');
          setSelectedInvoiceId('');
          setExternalRef('');
          setNote('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Manual Payment</DialogTitle>
          <DialogDescription>
            Record a payment received through an external system (e.g. Billergenie, bank transfer, cheque).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {unpaidInvoices.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="invoice">Apply to Invoice (optional)</Label>
              <select
                id="invoice"
                value={selectedInvoiceId}
                onChange={(e) => {
                  setSelectedInvoiceId(e.target.value);
                  if (e.target.value) {
                    const inv = unpaidInvoices.find((i) => i.id === e.target.value);
                    if (inv) setAmount(String(inv.amount));
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— None —</option>
                {unpaidInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — ${inv.amount}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="externalRef">External Reference (optional)</Label>
            <Input
              id="externalRef"
              placeholder="e.g. Billergenie payment ID, wire ref, cheque #"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Note *</Label>
            <Textarea
              id="note"
              placeholder="Describe the payment source (min 5 chars)…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required
              minLength={5}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={recordPayment.isPending || !amount || !note.trim() || note.trim().length < 5}
            >
              {recordPayment.isPending ? 'Recording…' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
