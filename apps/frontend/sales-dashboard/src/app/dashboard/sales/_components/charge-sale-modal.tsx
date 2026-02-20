'use client';

import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChargeSale } from '@/hooks/use-sales';

interface ChargeSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
}

interface FormValues {
  amount: string;
  invoiceNumber: string;
}

export function ChargeSaleModal({ open, onOpenChange, saleId }: ChargeSaleModalProps) {
  const chargeSale = useChargeSale();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    await chargeSale.mutateAsync({
      id: saleId,
      amount: parseFloat(values.amount),
      ...(values.invoiceNumber && { invoiceNumber: values.invoiceNumber }),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Charge Now"
      description="Process a one-time charge for this sale."
      error={chargeSale.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Amount *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register('amount', { required: 'Required' })}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Invoice Number (optional)</Label>
          <Input placeholder="INV-001" {...register('invoiceNumber')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={chargeSale.isPending}>
            {chargeSale.isPending ? 'Processing…' : 'Charge Now'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
