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
import { useCreateEngagement, useUpdateEngagement } from '@/hooks/use-pm-data';

interface EngagementFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagement?: any | null;
}

interface FormValues {
  name: string;
  description: string;
  ownerType: 'CLIENT' | 'INTERNAL_BRAND';
  clientId: string;
  ownerBrandId: string;
  primaryBrandId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
}

export function EngagementFormModal({
  open,
  onOpenChange,
  engagement,
}: EngagementFormModalProps) {
  const isEdit = !!engagement;
  const createMutation = useCreateEngagement();
  const updateMutation = useUpdateEngagement();
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: clientsData } = useClients({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const ownerType = watch('ownerType');
  const priority = watch('priority');
  const status = watch('status');
  const clientId = watch('clientId');
  const ownerBrandId = watch('ownerBrandId');
  const primaryBrandId = watch('primaryBrandId');

  useEffect(() => {
    if (open) {
      reset({
        name: engagement?.name ?? '',
        description: engagement?.description ?? '',
        ownerType: engagement?.ownerType ?? 'CLIENT',
        clientId: engagement?.clientId ?? '',
        ownerBrandId: engagement?.ownerBrandId ?? '',
        primaryBrandId: engagement?.primaryBrandId ?? '',
        priority: engagement?.priority ?? 'MEDIUM',
        status: engagement?.status ?? 'DRAFT',
      });
    }
  }, [open, engagement, reset]);

  const mutation = isEdit ? updateMutation : createMutation;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      name: values.name,
      description: values.description || null,
      ownerType: values.ownerType,
      priority: values.priority,
      primaryBrandId: values.primaryBrandId || null,
      clientId: values.ownerType === 'CLIENT' ? values.clientId : null,
      ownerBrandId: values.ownerType === 'INTERNAL_BRAND' ? values.ownerBrandId : null,
    };

    if (isEdit && engagement) {
      await updateMutation.mutateAsync({
        id: engagement.id,
        ...dto,
        status: values.status,
      });
    } else {
      await createMutation.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Engagement' : 'New Engagement'}
      error={mutation.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Engagement Name *</Label>
          <Input {...register('name', { required: 'Required' })} placeholder="Engagement name" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input {...register('description')} placeholder="Optional description" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Owner Type</Label>
            <Select value={ownerType ?? 'CLIENT'} onValueChange={(v) => setValue('ownerType', v as FormValues['ownerType'])}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENT">Client</SelectItem>
                <SelectItem value="INTERNAL_BRAND">Internal Brand</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority ?? 'MEDIUM'} onValueChange={(v) => setValue('priority', v as FormValues['priority'])}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {ownerType === 'CLIENT' && (
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={clientId || 'none'} onValueChange={(v) => setValue('clientId', v === 'none' ? '' : v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select client</SelectItem>
                {clientsData?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.contactName ?? c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {ownerType === 'INTERNAL_BRAND' && (
          <div className="space-y-1.5">
            <Label>Owner Brand *</Label>
            <Select value={ownerBrandId || 'none'} onValueChange={(v) => setValue('ownerBrandId', v === 'none' ? '' : v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select owner brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select owner brand</SelectItem>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Primary Brand</Label>
          <Select
            value={primaryBrandId || 'none'}
            onValueChange={(v) => setValue('primaryBrandId', v === 'none' ? '' : v)}
          >
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue placeholder="Optional primary brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {brandsData?.data.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isEdit && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status ?? 'DRAFT'} onValueChange={(v) => setValue('status', v as FormValues['status'])}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Engagement'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
