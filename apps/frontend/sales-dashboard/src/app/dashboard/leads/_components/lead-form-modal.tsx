'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateLead, useUpdateLead } from '@/hooks/use-leads';
import { useBrands } from '@/hooks/use-brands';
import { useMembers } from '@/hooks/use-organization';
import { ILead } from '@sentra-core/types';

interface LeadFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: ILead | null;
}

interface FormValues {
  title: string;
  source: string;
  brandId: string;
  assignedToId: string;
}

export function LeadFormModal({ open, onOpenChange, lead }: LeadFormModalProps) {
  const isEdit = !!lead;
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: members } = useMembers();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const brandId = watch('brandId');
  const assignedToId = watch('assignedToId');

  useEffect(() => {
    if (open) {
      reset({
        title: lead?.title ?? '',
        source: lead?.source ?? '',
        brandId: lead?.brandId ?? '',
        assignedToId: lead?.assignedToId ?? '',
      });
    }
  }, [open, lead, reset]);

  const mutation = isEdit ? updateLead : createLead;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      title: values.title,
      ...(values.source && { source: values.source }),
      ...(values.brandId && { brandId: values.brandId }),
      ...(values.assignedToId && { assignedToId: values.assignedToId }),
    };
    if (isEdit && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...dto });
    } else {
      await createLead.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Lead' : 'New Lead'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Title *</Label>
          <Input placeholder="Lead title" {...register('title', { required: 'Required' })} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Source</Label>
          <Input placeholder="e.g. Website, Referral" {...register('source')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={brandId} onValueChange={(v) => setValue('brandId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assign To</Label>
            <Select value={assignedToId} onValueChange={(v) => setValue('assignedToId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {members?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Lead'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
