'use client';

import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSubscription } from '@/hooks/use-sales';

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
}

interface FormValues {
  name: string;
  intervalLength: string;
  intervalUnit: 'days' | 'months';
  startDate: string;
  totalOccurrences: string;
  amount: string;
}

export function SubscribeModal({ open, onOpenChange, saleId }: SubscribeModalProps) {
  const createSubscription = useCreateSubscription();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { intervalUnit: 'months' },
  });
  const intervalUnit = watch('intervalUnit');

  const onSubmit = async (values: FormValues) => {
    await createSubscription.mutateAsync({
      id: saleId,
      name: values.name,
      intervalLength: parseInt(values.intervalLength),
      intervalUnit: values.intervalUnit,
      startDate: values.startDate,
      totalOccurrences: parseInt(values.totalOccurrences),
      amount: parseFloat(values.amount),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create Subscription"
      description="Set up a recurring payment schedule."
      error={createSubscription.error?.message ?? null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Subscription Name *</Label>
          <Input placeholder="Monthly Plan" {...register('name', { required: 'Required' })} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Interval Length *</Label>
            <Input type="number" placeholder="1" {...register('intervalLength', { required: 'Required' })} />
          </div>
          <div className="space-y-1.5">
            <Label>Interval Unit</Label>
            <Select value={intervalUnit} onValueChange={(v) => setValue('intervalUnit', v as 'days' | 'months')}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">Days</SelectItem>
                <SelectItem value="months">Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Start Date *</Label>
            <Input type="date" {...register('startDate', { required: 'Required' })} />
          </div>
          <div className="space-y-1.5">
            <Label>Total Occurrences *</Label>
            <Input type="number" placeholder="12" {...register('totalOccurrences', { required: 'Required' })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Amount per Occurrence *</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Required' })} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={createSubscription.isPending}>
            {createSubscription.isPending ? 'Creating…' : 'Create Subscription'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
