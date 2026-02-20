'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSale, useUpdateSale } from '@/hooks/use-sales';
import { useClients } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { ISale } from '@sentra-core/types';

interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: ISale | null;
}

interface FormValues {
  clientId: string;
  brandId: string;
  totalAmount: string;
  currency: string;
  description: string;
}

export function SaleFormModal({ open, onOpenChange, sale }: SaleFormModalProps) {
  const isEdit = !!sale;
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const { data: clientsData } = useClients({ limit: 100 });
  const { data: brandsData } = useBrands({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const clientId = watch('clientId');
  const brandId = watch('brandId');

  // Register select fields so react-hook-form validates them on submit
  register('clientId', { required: 'Client is required' });
  register('brandId', { required: 'Brand is required' });

  useEffect(() => {
    if (open) {
      reset({
        clientId: sale?.clientId ?? '',
        brandId: sale?.brandId ?? '',
        totalAmount: sale?.totalAmount?.toString() ?? '',
        currency: sale?.currency ?? 'USD',
        description: sale?.description ?? '',
      });
    }
  }, [open, sale, reset]);

  const mutation = isEdit ? updateSale : createSale;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      clientId: values.clientId,
      brandId: values.brandId,
      totalAmount: parseFloat(values.totalAmount),
      currency: values.currency || 'USD',
      ...(values.description && { description: values.description }),
    };
    if (isEdit && sale) {
      await updateSale.mutateAsync({ id: sale.id, ...dto });
    } else {
      await createSale.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Sale' : 'New Sale'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={(v) => setValue('clientId', v, { shouldValidate: true })}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clientsData?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Brand *</Label>
            <Select value={brandId} onValueChange={(v) => setValue('brandId', v, { shouldValidate: true })}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.brandId && <p className="text-xs text-destructive">{errors.brandId.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Total Amount *</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('totalAmount', { required: 'Required' })}
            />
            {errors.totalAmount && <p className="text-xs text-destructive">{errors.totalAmount.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input placeholder="USD" {...register('currency')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input placeholder="Brief description…" {...register('description')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Sale'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
