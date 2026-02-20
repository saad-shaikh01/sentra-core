'use client';

import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvertLead } from '@/hooks/use-leads';

interface ConvertLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  onSuccess?: () => void;
}

interface FormValues {
  email: string;
  password: string;
  companyName: string;
  contactName: string;
  phone: string;
}

export function ConvertLeadModal({ open, onOpenChange, leadId, onSuccess }: ConvertLeadModalProps) {
  const convertLead = useConvertLead();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    await convertLead.mutateAsync({
      id: leadId,
      email: values.email,
      password: values.password,
      companyName: values.companyName,
      ...(values.contactName && { contactName: values.contactName }),
      ...(values.phone && { phone: values.phone }),
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
      description="Create a client account from this lead."
      error={convertLead.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" placeholder="john@company.com" {...register('email', { required: 'Required' })} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Password *</Label>
            <Input type="password" placeholder="••••••••" {...register('password', { required: 'Required' })} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Company Name *</Label>
          <Input placeholder="Acme Inc." {...register('companyName', { required: 'Required' })} />
          {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input placeholder="John Doe" {...register('contactName')} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 555 0000" {...register('phone')} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={convertLead.isPending}>
            {convertLead.isPending ? 'Converting…' : 'Convert to Client'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
