'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pmKeys } from '@/hooks/use-pm-data';
import { toast } from '@/hooks/use-toast';
import { useBrands } from '@/hooks/use-brands';

interface TemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any | null;
}

interface FormValues {
  name: string;
  description: string;
  serviceType: string;
  brandId: string;
  isDefault: boolean;
}

export function TemplateFormModal({ open, onOpenChange, template }: TemplateFormModalProps) {
  const isEdit = !!template;
  const queryClient = useQueryClient();
  const { data: brandsData } = useBrands({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const serviceType = watch('serviceType');
  const brandId = watch('brandId');
  const isDefault = watch('isDefault');

  useEffect(() => {
    if (open) {
      reset({
        name: template?.name ?? '',
        description: template?.description ?? '',
        serviceType: template?.serviceType ?? 'GENERAL',
        brandId: template?.brandId ?? '',
        isDefault: template?.isDefault ?? false,
      });
    }
  }, [open, template, reset]);

  const createMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.fetch('/pm/templates', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.templates });
      toast.success('Template created');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error('Creation failed', e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.fetch(`/pm/templates/${template.id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.templates });
      toast.success('Template updated');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  });

  const mutation = isEdit ? updateMutation : createMutation;

  const onSubmit = (values: FormValues) => {
    const dto: Record<string, unknown> = {
      name: values.name,
      description: values.description || null,
      serviceType: values.serviceType,
      brandId: values.brandId || null,
      isDefault: values.isDefault,
    };
    mutation.mutate(dto);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Template' : 'New Template'}
      error={mutation.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Template Name *</Label>
          <Input placeholder="e.g. Standard Website Setup" {...register('name', { required: 'Required' })} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input placeholder="Brief overview of this workflow" {...register('description')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={(v) => setValue('serviceType', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLISHING">Publishing</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="WEB_DEVELOPMENT">Web Dev</SelectItem>
                <SelectItem value="DESIGN">Design</SelectItem>
                <SelectItem value="GENERAL">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Brand (Optional)</Label>
            <Select value={brandId} onValueChange={(v) => setValue('brandId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Brands</SelectItem>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            className="rounded border-white/10 bg-white/5 text-primary"
            checked={isDefault}
            onChange={(e) => setValue('isDefault', e.target.checked)}
          />
          <span className="text-sm font-medium">Set as default for this Service Type</span>
        </label>

        <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
