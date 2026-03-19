'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBrands } from '@/hooks/use-brands';
import { useImportLeads } from '@/hooks/use-leads';
import { LeadSource, LeadType, type ILeadImportResult } from '@sentra-core/types';

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

const TEMPLATE_CSV = [
  'name,email,phone,website,title,lead_type,source,lead_date,company',
  'John Doe,john@example.com,+15550000000,https://example.com,Lead - John Doe - PPC,INBOUND,PPC,2026-03-16,Acme Inc',
].join('\n');

interface LeadImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadImportModal({ open, onOpenChange }: LeadImportModalProps) {
  const importLeads = useImportLeads();
  const { data: brandsData } = useBrands({ limit: 100 });

  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [leadType, setLeadType] = useState<LeadType | ''>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<ILeadImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setBrandId('');
      setSource('');
      setLeadType('');
      setLocalError(null);
      setResult(null);
      setShowErrors(false);
    }
  }, [open]);

  const resolvedError = localError ?? importLeads.error?.message ?? null;
  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : 'Choose a CSV or XLSX file up to 5 MB'),
    [file],
  );

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lead-import-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    if (!file) {
      setLocalError('Please choose a CSV or XLSX file to import.');
      return;
    }

    if (!brandId) {
      setLocalError('Brand is required.');
      return;
    }

    setLocalError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('brandId', brandId);
    if (source) {
      formData.append('source', source);
    }
    if (leadType) {
      formData.append('leadType', leadType);
    }

    const response = await importLeads.mutateAsync(formData);
    setResult(response);
    setShowErrors(response.errorDetails.length > 0);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Import Leads"
      description="Upload a CSV or XLSX file, apply optional defaults, and review the import summary."
      error={resolvedError}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Lead import file</p>
              <p className="text-xs text-muted-foreground">{selectedFileLabel}</p>
            </div>
          </div>
          <Input
            type="file"
            accept=".csv,.xlsx"
            className="mt-4"
            onChange={(event) => {
              setLocalError(null);
              setResult(null);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={brandId || 'none'} onValueChange={(value) => setBrandId(value === 'none' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select brand</SelectItem>
                {brandsData?.data.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default Source</Label>
            <Select value={source || 'none'} onValueChange={(value) => setSource(value === 'none' ? '' : (value as LeadSource))}>
              <SelectTrigger>
                <SelectValue placeholder="No default source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default source</SelectItem>
                {LEAD_SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default Lead Type</Label>
            <Select value={leadType || 'none'} onValueChange={(value) => setLeadType(value === 'none' ? '' : (value as LeadType))}>
              <SelectTrigger>
                <SelectValue placeholder="No default lead type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default lead type</SelectItem>
                {LEAD_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-xs text-muted-foreground">
          <p>Supported columns: `name`, `email`, `phone`, `website`, `title`, `lead_type`, `source`, `lead_date`.</p>
          <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-muted-foreground">Rows</p>
                <p className="mt-1 text-lg font-semibold">{result.total}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">{result.created}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-muted-foreground">Duplicates</p>
                <p className="mt-1 text-lg font-semibold text-amber-300">{result.duplicates}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-muted-foreground">Errors</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">{result.errors}</p>
              </div>
            </div>

            {result.errorDetails.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Row errors</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowErrors((value) => !value)}>
                    {showErrors ? 'Hide details' : 'Show details'}
                  </Button>
                </div>
                {showErrors && (
                  <div className="max-h-52 overflow-auto rounded-lg border border-white/10">
                    <table className="w-full text-left text-sm min-w-[300px]">
                      <thead className="bg-black/20 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errorDetails.map((detail) => (
                          <tr key={`${detail.row}-${detail.reason}`} className="border-t border-white/10">
                            <td className="px-3 py-2 font-medium">{detail.row}</td>
                            <td className="px-3 py-2 text-muted-foreground">{detail.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={importLeads.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {importLeads.isPending ? 'Importing...' : 'Import Leads'}
          </Button>
        </div>
      </div>
    </FormModal>
  );
}
