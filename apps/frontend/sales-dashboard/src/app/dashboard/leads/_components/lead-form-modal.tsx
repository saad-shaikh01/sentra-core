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
import { ILeadDetail } from '@sentra-core/types';

interface LeadFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: ILeadDetail | null;
}

interface FormValues {
  title: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  source: string;
  brandId: string;
  assignedToId: string;
}

interface LeadFormPayload extends Record<string, unknown> {
  title: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  assignedToId?: string;
}

interface CreateLeadFormPayload extends LeadFormPayload {
  brandId?: string;
}

const defaultValues: FormValues = {
  title: '',
  name: '',
  email: '',
  phone: '',
  website: '',
  source: '',
  brandId: '',
  assignedToId: '',
};

export function LeadFormModal({ open, onOpenChange, lead }: LeadFormModalProps) {
  const isEdit = !!lead;
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: members } = useMembers();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues,
  });
  const brandId = watch('brandId');
  const assignedToId = watch('assignedToId');

  register('brandId', { required: 'Brand is required' });

  useEffect(() => {
    if (lead) {
      reset({
        title: lead.title,
        name: lead.name ?? '',
        email: lead.email ?? '',
        phone: lead.phone ?? '',
        website: lead.website ?? '',
        source: lead.source ?? '',
        brandId: lead.brandId ?? '',
        assignedToId: lead.assignedToId ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [lead, reset]);

  const mutation = isEdit ? updateLead : createLead;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    if (!isEdit && !values.brandId) {
      setError('brandId', { type: 'required', message: 'Brand is required' });
      return;
    }

    const dto: LeadFormPayload = {
      title: values.title,
      ...(values.name && { name: values.name }),
      ...(values.email && { email: values.email }),
      ...(values.phone && { phone: values.phone }),
      ...(values.website && { website: values.website }),
      ...(values.source && { source: values.source }),
      ...(values.assignedToId && { assignedToId: values.assignedToId }),
    };

    if (isEdit && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...dto });
    } else {
      const createDto: CreateLeadFormPayload = {
        ...dto,
        ...(values.brandId && { brandId: values.brandId }),
      };

      await createLead.mutateAsync(createDto);
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input placeholder="e.g. John Doe" {...register('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="john@example.com" {...register('email')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1..." {...register('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input placeholder="https://..." {...register('website')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Source</Label>
          <Input placeholder="e.g. Website, Referral" {...register('source')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select
              value={brandId}
              onValueChange={(value) => setValue('brandId', value, { shouldValidate: true })}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.brandId && <p className="text-sm text-red-400 mt-1">{errors.brandId.message}</p>}
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
