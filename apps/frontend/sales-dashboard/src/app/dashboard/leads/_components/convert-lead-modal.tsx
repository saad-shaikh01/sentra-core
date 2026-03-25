'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConvertLead } from '@/hooks/use-leads';
import { useMembers } from '@/hooks/use-organization';
import { ILead } from '@sentra-core/types';

interface ConvertLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ILead;
  onSuccess?: () => void;
}

interface FormValues {
  email: string;
  contactName: string;
  phone: string;
  upsellAgentId: string;
  projectManagerId: string;
}

export function ConvertLeadModal({ open, onOpenChange, lead, onSuccess }: ConvertLeadModalProps) {
  const convertLead = useConvertLead();
  const { data: upsellAgents } = useMembers({ permission: 'sales:sales:view_own' });
  const { data: projectManagers } = useMembers({ permission: 'sales:invoices:create' });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const upsellAgentId = watch('upsellAgentId');
  const projectManagerId = watch('projectManagerId');

  useEffect(() => {
    if (open && lead) {
      reset({
        email: lead.email ?? '',
        contactName: lead.name ?? '',
        phone: lead.phone ?? '',
        upsellAgentId: '',
        projectManagerId: '',
      });
    }
  }, [open, lead, reset]);

  const onSubmit = async (values: FormValues) => {
    await convertLead.mutateAsync({
      id: lead.id,
      email: values.email,
      ...(values.contactName && { contactName: values.contactName }),
      ...(values.phone && { phone: values.phone }),
      ...(values.upsellAgentId && { upsellAgentId: values.upsellAgentId }),
      ...(values.projectManagerId && { projectManagerId: values.projectManagerId }),
    });
    reset();
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Convert to Client"
      description="Create a client record from this lead."
      error={convertLead.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-4">
        <div className="space-y-1.5">
          <Label>Email *</Label>
          <Input type="email" placeholder="john@company.com" {...register('email', { required: 'Required' })} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input placeholder="John Doe" {...register('contactName')} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 555 0000" {...register('phone')} />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Assignment</p>
            <p className="text-xs text-muted-foreground mt-1">Optional. You can also assign these later from the client profile.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Upsell Agent</Label>
              <Select
                value={upsellAgentId || 'none'}
                onValueChange={(value) => setValue('upsellAgentId', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select upsell agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {upsellAgents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Project Manager</Label>
              <Select
                value={projectManagerId || 'none'}
                onValueChange={(value) => setValue('projectManagerId', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select project manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {projectManagers?.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={convertLead.isPending}>
            {convertLead.isPending ? 'Converting...' : 'Convert to Client'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
