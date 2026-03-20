'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatePackage, useUpdatePackage } from '@/hooks/use-packages';
import { IProductPackage, PackageCategory } from '@sentra-core/types';

interface PackageFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg?: IProductPackage | null;
}

interface ServiceField {
  name: string;
}

interface FormValues {
  name: string;
  category: PackageCategory | '';
  price: string;
  currency: string;
  description: string;
  services: ServiceField[];
}

const CURRENCIES = ['USD', 'GBP', 'EUR', 'AED'] as const;

const CATEGORY_LABELS: Record<PackageCategory, string> = {
  [PackageCategory.PUBLISHING]: 'Publishing',
  [PackageCategory.WRITING]:    'Writing',
  [PackageCategory.DESIGN]:     'Design',
  [PackageCategory.EDITING]:    'Editing',
};

export function PackageFormModal({ open, onOpenChange, pkg }: PackageFormModalProps) {
  const isEdit = !!pkg;
  const createPackage = useCreatePackage();
  const updatePackage = useUpdatePackage();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name:        '',
      category:    '',
      price:       '',
      currency:    'USD',
      description: '',
      services:    [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'services' });

  const category = watch('category');
  const currency = watch('currency');

  useEffect(() => {
    if (open) {
      reset({
        name:        pkg?.name ?? '',
        category:    pkg?.category ?? '',
        price:       pkg?.price != null ? String(pkg.price) : '',
        currency:    pkg?.currency ?? 'USD',
        description: pkg?.description ?? '',
        services:    pkg?.items?.map((item) => ({ name: item.name })) ?? [],
      });
    }
  }, [open, pkg, reset]);

  const mutation = isEdit ? updatePackage : createPackage;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      name:     values.name,
      currency: values.currency,
      price:    values.price ? parseFloat(values.price) : undefined,
      ...(values.category     && { category:    values.category }),
      ...(values.description  && { description: values.description }),
      items: values.services.map((s, i) => ({
        name:      s.name,
        order:     i,
        unitPrice: 0,
      })),
    };

    if (isEdit && pkg) {
      await updatePackage.mutateAsync({ id: pkg.id, ...dto });
    } else {
      await createPackage.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Package' : 'New Package'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input
            placeholder="e.g. Local Publication Bundle"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Category + Currency */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setValue('category', v as PackageCategory)}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.values(PackageCategory) as PackageCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={(v) => setValue('currency', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Price */}
        <div className="space-y-1.5">
          <Label>Price *</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            {...register('price', { required: 'Price is required' })}
          />
          {errors.price && (
            <p className="text-xs text-destructive">{errors.price.message}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          <textarea
            {...register('description')}
            placeholder="Brief description of this package…"
            rows={2}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 resize-none"
          />
        </div>

        {/* Services (items) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Services Included</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 hover:bg-white/10"
              onClick={() => append({ name: '' })}
            >
              <Plus className="h-3 w-3" />
              Add Service
            </Button>
          </div>

          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-1">
              No services added yet.
            </p>
          )}

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  placeholder={`Service ${index + 1} name`}
                  {...register(`services.${index}.name`, { required: true })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 hover:bg-red-500/10 hover:text-red-400"
                  onClick={() => remove(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Package'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
