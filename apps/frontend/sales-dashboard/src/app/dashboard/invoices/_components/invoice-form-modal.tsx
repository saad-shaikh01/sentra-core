'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateInvoice, useUpdateInvoice } from '@/hooks/use-invoices';
import { useSales } from '@/hooks/use-sales';
import { IInvoice } from '@sentra-core/types';

interface InvoiceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: IInvoice | null;
}

interface FormValues {
  saleId: string;
  amount: string;
  dueDate: string;
  notes: string;
}

export function InvoiceFormModal({ open, onOpenChange, invoice }: InvoiceFormModalProps) {
  const isEdit = !!invoice;
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const { data: salesData } = useSales({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const saleId = watch('saleId');

  // Register select field so react-hook-form validates it on submit
  register('saleId', { required: 'Sale is required' });

  useEffect(() => {
    if (open) {
      const dueDate = invoice?.dueDate
        ? new Date(invoice.dueDate).toISOString().split('T')[0]
        : '';
      reset({
        saleId: invoice?.saleId ?? '',
        amount: invoice?.amount?.toString() ?? '',
        dueDate,
        notes: invoice?.notes ?? '',
      });
    }
  }, [open, invoice, reset]);

  const mutation = isEdit ? updateInvoice : createInvoice;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      saleId: values.saleId,
      amount: parseFloat(values.amount),
      dueDate: values.dueDate,
      ...(values.notes && { notes: values.notes }),
    };
    if (isEdit && invoice) {
      await updateInvoice.mutateAsync({ id: invoice.id, ...dto });
    } else {
      await createInvoice.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Invoice' : 'New Invoice'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Sale *</Label>
          <Select value={saleId} onValueChange={(v) => setValue('saleId', v, { shouldValidate: true })}>
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue placeholder="Select sale" />
            </SelectTrigger>
            <SelectContent>
              {salesData?.data.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  ${s.totalAmount} {s.currency} · {s.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.saleId && <p className="text-xs text-destructive">{errors.saleId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <Label>Due Date *</Label>
            <Input
              type="date"
              {...register('dueDate', { required: 'Required' })}
            />
            {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input placeholder="Additional notes…" {...register('notes')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
