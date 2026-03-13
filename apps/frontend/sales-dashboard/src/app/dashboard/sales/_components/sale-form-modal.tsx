'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { useCreateSale, useUpdateSale } from '@/hooks/use-sales';
import { ISale } from '@sentra-core/types';

interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: ISale | null;
  prefillClientId?: string;
  prefillClientName?: string;
  prefillLeadId?: string;
  prefillLeadLabel?: string;
  prefillBrandId?: string;
}

interface FormValues {
  clientId: string;
  brandId: string;
  totalAmount: string;
  currency: string;
  description: string;
}

interface UpdateSalePayload {
  totalAmount: number;
  currency?: string;
  description?: string;
}

export function SaleFormModal({
  open,
  onOpenChange,
  sale,
  prefillClientId,
  prefillClientName,
  prefillLeadId,
  prefillLeadLabel,
  prefillBrandId,
}: SaleFormModalProps) {
  const isEdit = !!sale;
  const isLeadMode = !isEdit && !!prefillLeadId;
  const isLockedClient = isEdit || isLeadMode || !!prefillClientId;

  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const { data: clientsData } = useClients({ limit: 100 });
  const { data: brandsData } = useBrands({ limit: 100 });

  const { register, unregister, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<FormValues>();

  const clientId = watch('clientId');
  const brandId = watch('brandId');

  const clientName =
    prefillClientName
    ?? clientsData?.data.find((client) => client.id === (sale?.clientId ?? prefillClientId))?.companyName
    ?? sale?.clientId
    ?? prefillClientId
    ?? '';
  const brandName =
    brandsData?.data.find((brand) => brand.id === (sale?.brandId ?? prefillBrandId))?.name
    ?? sale?.brandId
    ?? prefillBrandId
    ?? '';

  useEffect(() => {
    register('brandId', { required: 'Brand is required' });

    if (isLeadMode) {
      unregister('clientId');
      return;
    }

    register('clientId', { required: 'Client is required' });
  }, [isLeadMode, register, unregister]);

  useEffect(() => {
    if (open) {
      reset({
        clientId: sale?.clientId ?? prefillClientId ?? '',
        brandId: sale?.brandId ?? prefillBrandId ?? '',
        totalAmount: sale?.totalAmount?.toString() ?? '',
        currency: sale?.currency ?? 'USD',
        description: sale?.description ?? '',
      });
    }
  }, [open, prefillBrandId, prefillClientId, reset, sale]);

  const mutation = isEdit ? updateSale : createSale;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    if (isEdit && sale) {
      const dto: UpdateSalePayload & Record<string, unknown> = {
        totalAmount: parseFloat(values.totalAmount),
        ...(values.currency ? { currency: values.currency } : {}),
        ...(values.description ? { description: values.description } : {}),
      };

      await updateSale.mutateAsync({ id: sale.id, ...dto });
    } else {
      const dto: Record<string, unknown> = {
        ...(isLeadMode ? { leadId: prefillLeadId } : { clientId: values.clientId || prefillClientId }),
        brandId: values.brandId,
        totalAmount: parseFloat(values.totalAmount),
        currency: values.currency || 'USD',
        ...(values.description ? { description: values.description } : {}),
      };

      await createSale.mutateAsync(dto as {
        clientId?: string;
        leadId?: string;
        brandId: string;
        totalAmount: number;
        currency?: string;
        description?: string;
      });
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
      <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-4">
        {isLeadMode ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-200">Creating sale from lead</p>
            <p className="mt-1 text-xs leading-5 text-emerald-100/80">
              This sale will be linked to {prefillLeadLabel ?? 'the selected lead'}. A client account
              will be created automatically if this is the first sale for that lead.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client {isLeadMode ? '' : '*'}</Label>
            {isLockedClient ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {isLeadMode ? prefillLeadLabel ?? 'Lead-linked sale' : clientName}
              </div>
            ) : (
              <>
                <Select
                  value={clientId}
                  onValueChange={(value) => setValue('clientId', value, { shouldValidate: true })}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsData?.data.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.clientId ? (
                  <p className="text-xs text-destructive">{errors.clientId.message}</p>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Brand *</Label>
            {isEdit ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {brandName}
              </div>
            ) : (
              <>
                <Select
                  value={brandId}
                  onValueChange={(value) => setValue('brandId', value, { shouldValidate: true })}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandsData?.data.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.brandId ? (
                  <p className="text-xs text-destructive">{errors.brandId.message}</p>
                ) : null}
              </>
            )}
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
            {errors.totalAmount ? (
              <p className="text-xs text-destructive">{errors.totalAmount.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input placeholder="USD" {...register('currency')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input placeholder="Brief description..." {...register('description')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Sale'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
