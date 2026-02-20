'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateClient, useUpdateClient } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { IClient } from '@sentra-core/types';

interface ClientFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: IClient | null;
}

interface FormValues {
  companyName: string;
  contactName: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  notes: string;
  brandId: string;
}

export function ClientFormModal({ open, onOpenChange, client }: ClientFormModalProps) {
  const isEdit = !!client;
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const { data: brandsData } = useBrands({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const brandId = watch('brandId');

  useEffect(() => {
    if (open) {
      reset({
        companyName: client?.companyName ?? '',
        contactName: client?.contactName ?? '',
        email: client?.email ?? '',
        password: '',
        phone: client?.phone ?? '',
        address: client?.address ?? '',
        notes: client?.notes ?? '',
        brandId: client?.brandId ?? '',
      });
    }
  }, [open, client, reset]);

  const mutation = isEdit ? updateClient : createClient;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      companyName: values.companyName,
      ...(values.contactName && { contactName: values.contactName }),
      ...(values.email && { email: values.email }),
      ...(!isEdit && values.password && { password: values.password }),
      ...(values.phone && { phone: values.phone }),
      ...(values.address && { address: values.address }),
      ...(values.notes && { notes: values.notes }),
      ...(values.brandId && { brandId: values.brandId }),
    };
    if (isEdit && client) {
      await updateClient.mutateAsync({ id: client.id, ...dto });
    } else {
      await createClient.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Client' : 'New Client'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input placeholder="Acme Inc." {...register('companyName', { required: 'Required' })} />
            {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input placeholder="John Doe" {...register('contactName')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="john@acme.com" {...register('email')} />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" {...register('password')} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 555 0000" {...register('phone')} />
          </div>
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
        </div>

        <div className="space-y-1.5">
          <Label>Address</Label>
          <Input placeholder="123 Main St" {...register('address')} />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input placeholder="Any notes…" {...register('notes')} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
