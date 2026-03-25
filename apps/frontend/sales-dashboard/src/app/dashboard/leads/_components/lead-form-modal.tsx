'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCreateLead, useUpdateLead } from '@/hooks/use-leads';
import { useBrands } from '@/hooks/use-brands';
import { useMembers } from '@/hooks/use-organization';
import { useTeams } from '@/hooks/use-teams';
import { hasMinimumRole, ILeadDetail, LeadSource, LeadType, UserRole } from '@sentra-core/types';

const LEAD_TYPE_OPTIONS: Array<{ value: LeadType; label: string }> = [
  { value: LeadType.CHAT, label: 'Chat' },
  { value: LeadType.SIGNUP, label: 'Signup' },
  { value: LeadType.SOCIAL, label: 'Social' },
  { value: LeadType.REFERRAL, label: 'Referral' },
  { value: LeadType.INBOUND, label: 'Inbound' },
];

const LEAD_SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: LeadSource.PPC, label: 'PPC' },
  { value: LeadSource.SMM, label: 'SMM' },
  { value: LeadSource.COLD_REFERRAL, label: 'Cold Referral' },
  { value: LeadSource.FACEBOOK_ADS, label: 'Facebook Ads' },
  { value: LeadSource.WEBHOOK, label: 'Webhook' },
];

function toDateInputValue(value?: Date | string): string {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().split('T')[0];
}

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
  leadType: LeadType | '';
  source: LeadSource | '';
  leadDate: string;
  brandId: string;
  assignedToId: string;
  teamId: string;
}

interface LeadFormPayload extends Record<string, unknown> {
  title?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  leadType?: LeadType;
  source?: LeadSource;
  leadDate?: string;
  assignedToId?: string;
  teamId?: string;
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
  leadType: '',
  source: '',
  leadDate: '',
  brandId: '',
  assignedToId: '',
  teamId: '',
};

export function LeadFormModal({ open, onOpenChange, lead }: LeadFormModalProps) {
  const isEdit = !!lead;
  const { user } = useAuth();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: frontSellAgents } = useMembers(UserRole.FRONTSELL_AGENT);
  const { data: teamsData } = useTeams({ limit: 100 });
  const canManageAssignment = user?.role ? hasMinimumRole(user.role, UserRole.SALES_MANAGER) : false;

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
  const leadType = watch('leadType');
  const source = watch('source');
  const assignedToId = watch('assignedToId');
  const teamId = watch('teamId');
  const today = new Date().toISOString().split('T')[0];

  register('brandId', { required: 'Brand is required' });

  useEffect(() => {
    if (lead) {
      reset({
        title: lead.title ?? '',
        name: lead.name ?? '',
        email: lead.email ?? '',
        phone: lead.phone ?? '',
        website: lead.website ?? '',
        leadType: lead.leadType ?? '',
        source: lead.source ?? '',
        leadDate: toDateInputValue(lead.leadDate),
        brandId: lead.brandId ?? '',
        assignedToId: lead.assignedToId ?? '',
        teamId: lead.teamId ?? '',
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
      ...(values.title.trim() && { title: values.title.trim() }),
      ...(values.name && { name: values.name }),
      ...(values.email && { email: values.email }),
      ...(values.phone && { phone: values.phone }),
      ...(values.website && { website: values.website }),
      ...(values.leadType && { leadType: values.leadType }),
      ...(values.source && { source: values.source }),
      ...(values.leadDate && { leadDate: values.leadDate }),
      ...(canManageAssignment && values.assignedToId && { assignedToId: values.assignedToId }),
      ...(canManageAssignment && values.teamId && { teamId: values.teamId }),
    };

    if (isEdit && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...dto });
    } else {
      const createDto: CreateLeadFormPayload = {
        ...dto,
        ...(values.brandId && { brandId: values.brandId }),
      };

      await createLead.mutateAsync(createDto);
      reset(defaultValues);
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
          <Label>Title</Label>
          <Input placeholder="Optional lead title" {...register('title')} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input placeholder="e.g. John Doe" {...register('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="john@example.com" {...register('email')} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1..." {...register('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input placeholder="https://..." {...register('website')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Lead Type</Label>
            <Select
              value={leadType || 'none'}
              onValueChange={(value) => setValue('leadType', value === 'none' ? '' : (value as LeadType))}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {LEAD_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select
              value={source || 'none'}
              onValueChange={(value) => setValue('source', value === 'none' ? '' : (value as LeadSource))}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {LEAD_SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Lead Date</Label>
            <Input type="date" max={today} {...register('leadDate')} />
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${canManageAssignment ? 'sm:grid-cols-2' : ''}`}>
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

          {canManageAssignment && (
            <div className="space-y-1.5">
              <Label>Front Sell Agent</Label>
              <Select value={assignedToId || 'none'} onValueChange={(v) => setValue('assignedToId', v === 'none' ? '' : v)}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {frontSellAgents?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {canManageAssignment && (
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select
              value={teamId || 'none'}
              onValueChange={(v) => setValue('teamId', v === 'none' ? '' : v)}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="No team assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {teamsData?.data.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
