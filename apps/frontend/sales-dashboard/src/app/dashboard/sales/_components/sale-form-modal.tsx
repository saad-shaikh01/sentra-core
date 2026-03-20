'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { useCreateSale, useUpdateSale } from '@/hooks/use-sales';
import { useMembers } from '@/hooks/use-organization';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { ISale, SaleStatus, SaleType, PaymentPlanType, DiscountType, UserRole } from '@sentra-core/types';
import { Plus, Minus } from 'lucide-react';

interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: ISale | null;
  prefillClientId?: string;
  prefillClientName?: string;
  prefillLeadId?: string;
  prefillLeadLabel?: string;
  prefillBrandId?: string;
  /** Auto-set when creating from a lead (FRONTSELL) or client (UPSELL) */
  prefillSaleType?: SaleType;
  /** Auto-set from the lead's assignedToId or the client's upsellAgentId */
  prefillSalesAgentId?: string;
}

interface ItemRow {
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  customPrice: string;
}

interface FormValues {
  clientId: string;
  brandId: string;
  saleType: SaleType | '';
  salesAgentId: string;
  paymentPlan: PaymentPlanType;
  installmentCount: string;
  totalAmount: string;
  currency: string;
  description: string;
  discountEnabled: boolean;
  discountType: DiscountType | '';
  discountValue: string;
  status: SaleStatus;
  items: ItemRow[];
}

export function SaleFormModal({
  open,
  onOpenChange,
  sale,
  prefillClientId,
  prefillClientName,
  prefillLeadId,
  prefillLeadLabel,
  prefillBrandId,
  prefillSaleType,
  prefillSalesAgentId,
}: SaleFormModalProps) {
  const isEdit = !!sale;
  const isLeadMode = !isEdit && !!prefillLeadId;
  const isClientMode = !isEdit && !isLeadMode && !!prefillClientId;
  const router = useRouter();
  const { user } = useAuth();
  const userRole = user?.role;
  const isAgent = userRole === UserRole.FRONTSELL_AGENT || userRole === UserRole.UPSELL_AGENT;

  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const { data: clientsData } = useClients({ limit: 100 });
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: frontsellAgents } = useMembers(UserRole.FRONTSELL_AGENT);
  const { data: upsellAgents } = useMembers(UserRole.UPSELL_AGENT);

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } =
    useForm<FormValues>({
      defaultValues: {
        paymentPlan: PaymentPlanType.ONE_TIME,
        status: SaleStatus.DRAFT,
        discountEnabled: false,
        discountType: '',
        saleType: '',
        salesAgentId: '',
        items: [],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const [apiError, setApiError] = useState<string | null>(null);

  const watchedItems = watch('items');
  const watchedDiscountEnabled = watch('discountEnabled');
  const watchedDiscountType = watch('discountType');
  const watchedDiscountValue = watch('discountValue');
  const watchedTotalAmount = watch('totalAmount');
  const watchedPaymentPlan = watch('paymentPlan');
  const watchedSaleType = watch('saleType');
  const watchedClientId = watch('clientId');

  // Live total calculation
  const itemsSubtotal = watchedItems.reduce((sum, item) => {
    const price = parseFloat(item.customPrice || item.unitPrice || '0');
    const qty = parseInt(item.quantity || '1', 10);
    return sum + price * qty;
  }, 0);

  const subtotal = watchedItems.length > 0 ? itemsSubtotal : parseFloat(watchedTotalAmount || '0');

  let liveTotal = subtotal;
  if (watchedDiscountEnabled && watchedDiscountValue) {
    const dv = parseFloat(watchedDiscountValue);
    if (watchedDiscountType === DiscountType.PERCENTAGE) {
      liveTotal = subtotal * (1 - Math.min(dv, 100) / 100);
    } else if (watchedDiscountType === DiscountType.FIXED_AMOUNT) {
      liveTotal = Math.max(0, subtotal - dv);
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  useEffect(() => {
    if (open) {
      setApiError(null);
      reset({
        clientId: sale?.clientId ?? prefillClientId ?? '',
        brandId: sale?.brandId ?? prefillBrandId ?? '',
        saleType: (sale?.saleType as SaleType) ?? prefillSaleType ?? '',
        salesAgentId: sale?.salesAgentId ?? prefillSalesAgentId ?? '',
        paymentPlan: (sale?.paymentPlan as PaymentPlanType) ?? PaymentPlanType.ONE_TIME,
        installmentCount: sale?.installmentCount?.toString() ?? '',
        totalAmount: sale?.totalAmount?.toString() ?? '',
        currency: sale?.currency ?? 'USD',
        description: sale?.description ?? '',
        discountEnabled: !!(sale?.discountType),
        discountType: (sale?.discountType as DiscountType) ?? '',
        discountValue: sale?.discountValue?.toString() ?? '',
        status: (sale?.status as SaleStatus) ?? SaleStatus.DRAFT,
        items: (sale?.items ?? []).map((item) => ({
          name: item.name,
          description: item.description ?? '',
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          customPrice: item.customPrice?.toString() ?? '',
        })),
      });
    }
  }, [open, sale, prefillClientId, prefillBrandId, prefillSaleType, prefillSalesAgentId, reset]);

  // Auto-fill salesAgentId when client is selected (non-lead, non-prefill mode)
  useEffect(() => {
    if (!isLeadMode && !prefillSalesAgentId && watchedClientId) {
      const client = clientsData?.data.find((c) => c.id === watchedClientId);
      if (client?.upsellAgentId) {
        setValue('salesAgentId', client.upsellAgentId);
        setValue('saleType', SaleType.UPSELL);
      }
    }
  }, [watchedClientId, clientsData, isLeadMode, prefillSalesAgentId, setValue]);

  const mutation = isEdit ? updateSale : createSale;

  // Agents to show based on selected sale type
  const agentOptions =
    watchedSaleType === SaleType.FRONTSELL
      ? (frontsellAgents ?? [])
      : watchedSaleType === SaleType.UPSELL
        ? (upsellAgents ?? [])
        : [...(frontsellAgents ?? []), ...(upsellAgents ?? [])];

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      const items = values.items.map((item) => ({
        name: item.name,
        description: item.description || undefined,
        quantity: parseInt(item.quantity, 10),
        unitPrice: parseFloat(item.unitPrice),
        customPrice: item.customPrice ? parseFloat(item.customPrice) : undefined,
      }));

      const dto: Record<string, unknown> = {
        brandId: values.brandId,
        paymentPlan: values.paymentPlan,
        currency: values.currency || 'USD',
        ...(values.saleType ? { saleType: values.saleType } : {}),
        ...(values.salesAgentId ? { salesAgentId: values.salesAgentId } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.paymentPlan === PaymentPlanType.INSTALLMENTS && values.installmentCount
          ? { installmentCount: parseInt(values.installmentCount, 10) }
          : {}),
        ...(items.length > 0 ? { items } : { totalAmount: parseFloat(values.totalAmount) }),
        ...(values.discountEnabled && values.discountType
          ? { discountType: values.discountType, discountValue: parseFloat(values.discountValue) }
          : {}),
      };

      if (isEdit && sale) {
        await updateSale.mutateAsync({ id: sale.id, ...dto });
        onOpenChange(false);
      } else {
        const payload = {
          ...dto,
          status: values.status,
          ...(isLeadMode ? { leadId: prefillLeadId } : { clientId: values.clientId || prefillClientId }),
        };

        const result = await createSale.mutateAsync(payload as never) as any;
        onOpenChange(false);

        // Store collision warning if present
        if (result?.collisionWarning) {
          const saleId = result?.id ?? result?.sale?.id;
          if (saleId) {
            sessionStorage.setItem(`collision-warning-${saleId}`, JSON.stringify(result.collisionWarning));
          }
        }

        const newSaleId = result?.id ?? result?.sale?.id;
        if (newSaleId) {
          router.push(`/dashboard/sales/${newSaleId}`);
        }
      }
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : 'Failed to save sale');
    }
  };

  const clientId = watch('clientId');
  const brandId = watch('brandId');
  const clientName =
    prefillClientName
    ?? clientsData?.data.find((c) => c.id === (sale?.clientId ?? prefillClientId))?.companyName
    ?? '';
  const brandName =
    brandsData?.data.find((b) => b.id === (sale?.brandId ?? prefillBrandId))?.name
    ?? '';

  // Sale type is locked in lead mode (always FRONTSELL) or client mode (always UPSELL)
  const saleTypeLocked = isLeadMode || isClientMode || isEdit;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Sale' : 'New Sale'}
      error={apiError}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-2 space-y-4">
        {isLeadMode ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-200">Creating sale from lead</p>
            <p className="mt-1 text-xs leading-5 text-emerald-100/80">
              Linked to {prefillLeadLabel ?? 'the selected lead'}. Sale type is automatically set to <strong>Frontsell</strong>.
            </p>
          </div>
        ) : null}

        {/* Client + Brand */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client {isLeadMode ? '' : '*'}</Label>
            {isEdit || isLeadMode || prefillClientId ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {isLeadMode ? prefillLeadLabel ?? 'Lead-linked sale' : clientName || clientId}
              </div>
            ) : (
              <>
                <Select value={clientId} onValueChange={(v) => setValue('clientId', v, { shouldValidate: true })}>
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsData?.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.clientId ? <p className="text-xs text-destructive">{errors.clientId.message}</p> : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Brand *</Label>
            {isEdit ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {brandName || brandId}
              </div>
            ) : (
              <>
                <Select value={brandId} onValueChange={(v) => setValue('brandId', v, { shouldValidate: true })}>
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandsData?.data.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.brandId ? <p className="text-xs text-destructive">{errors.brandId.message}</p> : null}
              </>
            )}
          </div>
        </div>

        {/* Sale Type + Sales Agent */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Sale Type *</Label>
            {saleTypeLocked ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {watchedSaleType === SaleType.FRONTSELL
                  ? 'Frontsell'
                  : watchedSaleType === SaleType.UPSELL
                    ? 'Upsell'
                    : '—'}
              </div>
            ) : (
              <>
                <Select
                  value={watchedSaleType || 'none'}
                  onValueChange={(v) => {
                    setValue('saleType', v === 'none' ? '' : (v as SaleType), { shouldValidate: true });
                    setValue('salesAgentId', ''); // reset agent when type changes
                  }}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SaleType.FRONTSELL}>Frontsell</SelectItem>
                    <SelectItem value={SaleType.UPSELL}>Upsell</SelectItem>
                  </SelectContent>
                </Select>
                {errors.saleType ? <p className="text-xs text-destructive">{errors.saleType.message}</p> : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Sales Agent *</Label>
            {isLeadMode && prefillSalesAgentId ? (
              <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm text-muted-foreground">
                {agentOptions.find((a) => a.id === prefillSalesAgentId)?.name ?? 'Assigned agent'}
              </div>
            ) : (
              <>
                <Select
                  value={watch('salesAgentId') || 'none'}
                  onValueChange={(v) => setValue('salesAgentId', v === 'none' ? '' : v, { shouldValidate: true })}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {agentOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.salesAgentId ? <p className="text-xs text-destructive">{errors.salesAgentId.message}</p> : null}
              </>
            )}
          </div>
        </div>

        {/* Payment plan + status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Payment Plan *</Label>
            <Select
              value={watch('paymentPlan')}
              onValueChange={(v) => setValue('paymentPlan', v as PaymentPlanType)}
              disabled={isEdit}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PaymentPlanType.ONE_TIME}>One-Time</SelectItem>
                <SelectItem value={PaymentPlanType.INSTALLMENTS}>Installments</SelectItem>
                <SelectItem value={PaymentPlanType.SUBSCRIPTION}>Subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <Select
              value={watch('status')}
              onValueChange={(v) => setValue('status', v as SaleStatus)}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SaleStatus.DRAFT}>Draft</SelectItem>
                <SelectItem value={SaleStatus.PENDING}>Pending</SelectItem>
                {!isAgent ? <SelectItem value={SaleStatus.ACTIVE}>Active</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Installment count */}
        {watchedPaymentPlan === PaymentPlanType.INSTALLMENTS ? (
          <div className="space-y-1.5">
            <Label>Number of Installments *</Label>
            <Input
              type="number"
              min={2}
              max={60}
              placeholder="e.g. 3"
              {...register('installmentCount', { required: 'Required for installment plans', min: { value: 2, message: 'Min 2' }, max: { value: 60, message: 'Max 60' } })}
            />
            {errors.installmentCount ? <p className="text-xs text-destructive">{errors.installmentCount.message}</p> : null}
          </div>
        ) : null}

        {/* Items editor */}
        {!isEdit ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items (optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => append({ name: '', description: '', quantity: '1', unitPrice: '', customPrice: '' })}
              >
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Item name *"
                    {...register(`items.${index}.name`, { required: true })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-300 flex-shrink-0"
                    onClick={() => remove(index)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" min={1} placeholder="Qty" {...register(`items.${index}.quantity`)} />
                  <Input type="number" step="0.01" placeholder="Unit price" {...register(`items.${index}.unitPrice`, { required: true })} />
                  <Input type="number" step="0.01" placeholder="Custom price" {...register(`items.${index}.customPrice`)} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Total amount (manual if no items) */}
        {fields.length === 0 ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Total Amount *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('totalAmount', { required: fields.length === 0 ? 'Required' : false })}
              />
              {errors.totalAmount ? <p className="text-xs text-destructive">{errors.totalAmount.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input placeholder="USD" {...register('currency')} />
            </div>
          </div>
        ) : null}

        {/* Discount section (hidden for agents) */}
        {!isAgent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="discountEnabled"
                {...register('discountEnabled')}
                className="h-3.5 w-3.5"
              />
              <Label htmlFor="discountEnabled" className="cursor-pointer">Apply Discount</Label>
            </div>
            {watchedDiscountEnabled ? (
              <div className="grid grid-cols-2 gap-3 pl-5">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={watchedDiscountType}
                    onValueChange={(v) => setValue('discountType', v as DiscountType)}
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DiscountType.PERCENTAGE}>Percentage (%)</SelectItem>
                      <SelectItem value={DiscountType.FIXED_AMOUNT}>Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Value *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={watchedDiscountType === DiscountType.PERCENTAGE ? 'e.g. 10' : 'e.g. 500'}
                    {...register('discountValue', {
                      required: watchedDiscountEnabled,
                      min: 0.01,
                      max: watchedDiscountType === DiscountType.PERCENTAGE ? 100 : undefined,
                    })}
                  />
                  {errors.discountValue ? <p className="text-xs text-destructive">Invalid discount value</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input placeholder="Brief description..." {...register('description')} />
        </div>

        {/* Live preview */}
        {subtotal > 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
            {fields.length > 0 ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Items ({fields.length})</span>
                <span>{formatCurrency(itemsSubtotal)}</span>
              </div>
            ) : null}
            {watchedDiscountEnabled && watchedDiscountValue && liveTotal !== subtotal ? (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span>− {formatCurrency(subtotal - liveTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold border-t border-white/10 pt-1 mt-1">
              <span>Total</span>
              <span>{formatCurrency(liveTotal)}</span>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Sale'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
