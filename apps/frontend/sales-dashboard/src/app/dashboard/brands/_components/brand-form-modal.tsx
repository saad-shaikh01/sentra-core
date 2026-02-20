'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBrand, useUpdateBrand } from '@/hooks/use-brands';
import { IBrand } from '@sentra-core/types';

interface BrandFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: IBrand | null;
}

interface FormValues {
  name: string;
  domain: string;
  logoUrl: string;
}

export function BrandFormModal({ open, onOpenChange, brand }: BrandFormModalProps) {
  const isEdit = !!brand;
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  useEffect(() => {
    if (open) {
      reset({
        name: brand?.name ?? '',
        domain: brand?.domain ?? '',
        logoUrl: brand?.logoUrl ?? '',
      });
    }
  }, [open, brand, reset]);

  const mutation = isEdit ? updateBrand : createBrand;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '')
    );
    if (isEdit && brand) {
      await updateBrand.mutateAsync({ id: brand.id, ...dto });
    } else {
      await createBrand.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Brand' : 'New Brand'}
      description={isEdit ? 'Update brand details.' : 'Create a new brand for your organization.'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="Acme Corp"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            placeholder="acme.com"
            {...register('domain')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input
            id="logoUrl"
            placeholder="https://..."
            {...register('logoUrl')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Brand'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
