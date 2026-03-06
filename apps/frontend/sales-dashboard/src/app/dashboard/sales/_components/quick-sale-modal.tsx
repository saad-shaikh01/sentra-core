'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, Upload, FileText, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSale, useUploadContract } from '@/hooks/use-sales';
import { useClients } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { PaymentPlanType } from '@sentra-core/types';

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  customPrice?: number;
}

interface QuickSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = ['Package', 'Payment Plan', 'Review'] as const;

const PRESET_PACKAGES = [
  { name: 'Basic Web Design', unitPrice: 1500, description: 'Landing page design and development' },
  { name: 'SEO Package', unitPrice: 800, description: 'On-page SEO optimization, 3 months' },
  { name: 'Social Media Management', unitPrice: 500, description: 'Monthly social media management' },
  { name: 'E-commerce Store', unitPrice: 4500, description: 'Full e-commerce development' },
];

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors
            ${i < step ? 'bg-primary text-white' : i === step ? 'bg-primary/20 border border-primary text-primary' : 'bg-white/5 border border-white/10 text-muted-foreground'}`}>
            {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`text-xs font-medium ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>
            {label}
          </span>
          {i < total - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
      ))}
    </div>
  );
}

export function QuickSaleModal({ open, onOpenChange }: QuickSaleModalProps) {
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<LineItem[]>([{ name: '', description: '', quantity: 1, unitPrice: 0 }]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanType>(PaymentPlanType.ONE_TIME);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractUrl, setContractUrl] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: clientsData } = useClients({ limit: 100 });
  const { data: brandsData } = useBrands({ limit: 100 });
  const createSale = useCreateSale();
  const uploadContract = useUploadContract();

  const totalAmount = items.reduce((sum, item) => {
    const price = item.customPrice ?? item.unitPrice;
    return sum + price * item.quantity;
  }, 0);

  const reset = () => {
    setStep(0);
    setClientId('');
    setBrandId('');
    setCurrency('USD');
    setItems([{ name: '', description: '', quantity: 1, unitPrice: 0 }]);
    setPaymentPlan(PaymentPlanType.ONE_TIME);
    setInstallmentCount(3);
    setContractFile(null);
    setContractUrl('');
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const addItem = () => setItems(prev => [...prev, { name: '', description: '', quantity: 1, unitPrice: 0 }]);

  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const addPreset = (preset: typeof PRESET_PACKAGES[0]) => {
    setItems(prev => [...prev.filter(it => it.name), { ...preset, quantity: 1 }]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setContractFile(f);
  };

  const handleUploadContract = async () => {
    if (!contractFile) return;
    const res = await uploadContract.mutateAsync(contractFile);
    setContractUrl(res.url);
  };

  const canGoNextStep1 = clientId && brandId && items.some(it => it.name && it.unitPrice > 0);
  const canGoNextStep2 = paymentPlan !== PaymentPlanType.INSTALLMENTS || installmentCount >= 2;

  const handleSubmit = async () => {
    await createSale.mutateAsync({
      clientId,
      brandId,
      currency,
      paymentPlan,
      ...(paymentPlan === PaymentPlanType.INSTALLMENTS && { installmentCount }),
      ...(contractUrl && { contractUrl }),
      items: items
        .filter(it => it.name && it.unitPrice > 0)
        .map(it => ({
          name: it.name,
          description: it.description || undefined,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          ...(it.customPrice !== undefined && { customPrice: it.customPrice }),
        })),
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Sale</DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} total={STEPS.length} />

        {/* ── STEP 1: Package/Service Selection ── */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsData?.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Select value={brandId} onValueChange={setBrandId}>
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
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" className="w-24" />
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Quick Add Presets</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_PACKAGES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addPreset(p)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-primary/40 transition-colors"
                  >
                    {p.name} — ${p.unitPrice.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <Label>Line Items *</Label>
              {items.map((item, i) => (
                <div key={i} className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={item.unitPrice || ''}
                        onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Custom Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Override"
                        value={item.customPrice ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateItem(i, { customPrice: v ? Number(v) : undefined });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            <div className="text-right text-sm font-semibold text-foreground">
              Total: <span className="text-primary text-base">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* ── STEP 2: Payment Plan ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid gap-3">
              {[
                { plan: PaymentPlanType.ONE_TIME, label: 'One-Time Payment', desc: 'Single invoice due in 7 days' },
                { plan: PaymentPlanType.INSTALLMENTS, label: 'Installments', desc: 'Split into monthly installments' },
                { plan: PaymentPlanType.SUBSCRIPTION, label: 'Subscription (ARB)', desc: 'Recurring billing via Authorize.Net' },
              ].map(({ plan, label, desc }) => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setPaymentPlan(plan)}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-colors text-left
                    ${paymentPlan === plan ? 'border-primary/60 bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors
                    ${paymentPlan === plan ? 'border-primary bg-primary' : 'border-white/30'}`} />
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {paymentPlan === PaymentPlanType.INSTALLMENTS && (
              <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="space-y-1.5">
                  <Label>Number of Installments</Label>
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(Number(e.target.value))}
                    className="w-32"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Preview:</p>
                  {Array.from({ length: Math.min(installmentCount, 4) }).map((_, i) => {
                    const due = new Date();
                    due.setMonth(due.getMonth() + i + 1);
                    const amount = i === installmentCount - 1
                      ? totalAmount - (Math.round((totalAmount / installmentCount) * 100) / 100) * (installmentCount - 1)
                      : Math.round((totalAmount / installmentCount) * 100) / 100;
                    return (
                      <p key={i}>
                        Installment {i + 1}: ${amount.toFixed(2)} due {due.toLocaleDateString()}
                      </p>
                    );
                  })}
                  {installmentCount > 4 && <p className="text-muted-foreground/60">+ {installmentCount - 4} more…</p>}
                </div>
              </div>
            )}

            {paymentPlan === PaymentPlanType.SUBSCRIPTION && (
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-300">
                Subscription scheduling is configured after the sale is created via the &ldquo;Subscribe&rdquo; action.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Contract Upload + Review ── */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Contract Upload */}
            <div className="space-y-2">
              <Label>Contract Document (Optional)</Label>
              <div
                className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {contractFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-medium">{contractFile.name}</span>
                    <span className="text-muted-foreground">({(contractFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="space-y-1 text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto opacity-40" />
                    <p className="text-sm">Click to upload PDF or Word document</p>
                    <p className="text-xs">Max 20 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileChange}
              />
              {contractFile && !contractUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUploadContract}
                  disabled={uploadContract.isPending}
                >
                  {uploadContract.isPending ? 'Uploading…' : 'Upload Contract'}
                </Button>
              )}
              {contractUrl && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Contract uploaded
                </p>
              )}
            </div>

            {/* Review Summary */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/10">
              <div className="px-4 py-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">
                  {clientsData?.data.find(c => c.id === clientId)?.companyName ?? clientId}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Brand</span>
                <span className="font-medium">
                  {brandsData?.data.find(b => b.id === brandId)?.name ?? brandId}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Plan</span>
                <span className="font-medium">
                  {paymentPlan === PaymentPlanType.ONE_TIME && 'One-Time'}
                  {paymentPlan === PaymentPlanType.INSTALLMENTS && `${installmentCount} Installments`}
                  {paymentPlan === PaymentPlanType.SUBSCRIPTION && 'Subscription'}
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-muted-foreground text-sm mb-2">Line Items</p>
                {items.filter(it => it.name).map((it, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span>{it.name} × {it.quantity}</span>
                    <span>${((it.customPrice ?? it.unitPrice) * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 flex justify-between text-sm font-bold">
                <span>Total</span>
                <span className="text-primary">{currency} {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {createSale.error && (
              <p className="text-xs text-destructive">{createSale.error.message}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t border-white/10 mt-2">
          <Button type="button" variant="ghost" onClick={step === 0 ? handleClose : () => setStep(s => s - 1)}>
            {step === 0 ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </Button>
          {step < 2 ? (
            <Button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 ? !canGoNextStep1 : !canGoNextStep2}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={createSale.isPending}>
              {createSale.isPending ? 'Creating…' : 'Create Sale'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
