'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { DetailSheet } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useBrand,
  useBrandInvoiceConfig,
  useUpdateBrand,
  useUpdateBrandInvoiceConfig,
  useUploadBrandLogo,
} from '@/hooks/use-brands';
import { IBrandInvoiceConfig } from '@sentra-core/types';
import { Building2, FileText, ImagePlus, Loader2, Upload } from 'lucide-react';

interface BrandDetailSheetProps {
  brandId: string | null;
  onClose: () => void;
}

type Tab = 'general' | 'invoice';

interface GeneralFormValues {
  name: string;
  domain: string;
}

type InvoiceFormValues = Omit<IBrandInvoiceConfig, 'id' | 'brandId' | 'createdAt' | 'updatedAt'>;

export function BrandDetailSheet({ brandId, onClose }: BrandDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const { data: brand, isLoading: brandLoading } = useBrand(brandId ?? '');
  const { data: invoiceConfig, isLoading: configLoading } = useBrandInvoiceConfig(brandId ?? '');

  const updateBrand = useUpdateBrand();
  const updateInvoiceConfig = useUpdateBrandInvoiceConfig();
  const uploadLogo = useUploadBrandLogo();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // General form
  const generalForm = useForm<GeneralFormValues>();

  // Invoice config form
  const invoiceForm = useForm<InvoiceFormValues>();

  useEffect(() => {
    if (brand) {
      generalForm.reset({ name: brand.name, domain: brand.domain ?? '' });
    }
  }, [brand]);

  useEffect(() => {
    invoiceForm.reset({
      billingEmail: invoiceConfig?.billingEmail ?? '',
      supportEmail: invoiceConfig?.supportEmail ?? '',
      phone: invoiceConfig?.phone ?? '',
      website: invoiceConfig?.website ?? '',
      address: invoiceConfig?.address ?? '',
      taxId: invoiceConfig?.taxId ?? '',
      dueDays: invoiceConfig?.dueDays ?? 30,
      currency: invoiceConfig?.currency ?? 'USD',
      invoiceTerms: invoiceConfig?.invoiceTerms ?? '',
      invoiceNotes: invoiceConfig?.invoiceNotes ?? '',
    });
  }, [invoiceConfig]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const onSaveGeneral = async (values: GeneralFormValues) => {
    if (!brandId) return;
    const dto: Record<string, unknown> = {};
    if (values.name !== brand?.name) dto.name = values.name;
    if (values.domain !== (brand?.domain ?? '')) dto.domain = values.domain || null;

    if (Object.keys(dto).length > 0) {
      await updateBrand.mutateAsync({ id: brandId, ...dto });
    }
    if (selectedFile) {
      await uploadLogo.mutateAsync({ id: brandId, file: selectedFile });
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  const onSaveInvoice = async (values: InvoiceFormValues) => {
    if (!brandId) return;
    const dto: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      dto[k] = v === '' ? null : v;
    }
    await updateInvoiceConfig.mutateAsync({ id: brandId, ...dto });
  };

  const currentLogo = previewUrl ?? brand?.logoUrl ?? '';
  const isLoading = brandLoading || configLoading;

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: 'general', label: 'General', icon: Building2 },
    { key: 'invoice', label: 'Invoice Config', icon: FileText },
  ];

  return (
    <DetailSheet
      open={!!brandId}
      onClose={onClose}
      title={brand?.name ?? 'Brand'}
      description={brand?.domain ?? 'Brand settings'}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/10 mb-6">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === key
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* General Tab */}
          {activeTab === 'general' && (
            <form onSubmit={generalForm.handleSubmit(onSaveGeneral)} className="space-y-5">
              {/* Logo */}
              <div className="space-y-2">
                <Label>Brand Logo</Label>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20 shrink-0">
                      {currentLogo ? (
                        <img src={currentLogo} alt="Logo" className="h-full w-full object-contain" />
                      ) : (
                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">PNG, JPG, SVG, WEBP up to 5 MB. Used in invoice PDF header.</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="mr-2 h-3.5 w-3.5" />
                        {selectedFile ? 'Change' : currentLogo ? 'Replace' : 'Upload Logo'}
                      </Button>
                      {selectedFile && <p className="text-xs text-muted-foreground">{selectedFile.name}</p>}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Brand Name *</Label>
                <Input {...generalForm.register('name', { required: true })} placeholder="Acme Corp" />
              </div>

              <div className="space-y-1.5">
                <Label>Domain</Label>
                <Input {...generalForm.register('domain')} placeholder="acme.com" />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={updateBrand.isPending || uploadLogo.isPending}
                >
                  {(updateBrand.isPending || uploadLogo.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          )}

          {/* Invoice Config Tab */}
          {activeTab === 'invoice' && (
            <form onSubmit={invoiceForm.handleSubmit(onSaveInvoice)} className="space-y-5">
              <p className="text-xs text-muted-foreground -mt-2">
                These details appear in the invoice PDF footer and override any defaults.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Billing Email</Label>
                  <Input {...invoiceForm.register('billingEmail')} placeholder="billing@brand.com" type="email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Support Email</Label>
                  <Input {...invoiceForm.register('supportEmail')} placeholder="support@brand.com" type="email" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input {...invoiceForm.register('phone')} placeholder="(888) 000-0000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Website</Label>
                  <Input {...invoiceForm.register('website')} placeholder="https://brand.com" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input {...invoiceForm.register('address')} placeholder="123 Main St, New York, NY 10001" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tax ID / EIN</Label>
                  <Input {...invoiceForm.register('taxId')} placeholder="12-3456789" />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Input {...invoiceForm.register('currency')} placeholder="USD" maxLength={3} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Default Due Days</Label>
                <Input {...invoiceForm.register('dueDays', { valueAsNumber: true })} type="number" min={1} max={365} placeholder="30" />
                <p className="text-xs text-muted-foreground">Invoice due date = created date + this many days</p>
              </div>

              <div className="space-y-1.5">
                <Label>Invoice Terms</Label>
                <Textarea
                  {...invoiceForm.register('invoiceTerms')}
                  placeholder="Payment is due within 30 days of invoice date..."
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Shown in the Terms section of every invoice PDF for this brand.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Default Invoice Notes</Label>
                <Textarea
                  {...invoiceForm.register('invoiceNotes')}
                  placeholder="Thank you for your business!"
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={updateInvoiceConfig.isPending}>
                  {updateInvoiceConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Invoice Config
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </DetailSheet>
  );
}
