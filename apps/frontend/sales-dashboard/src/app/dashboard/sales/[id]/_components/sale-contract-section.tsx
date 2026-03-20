'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAttachContract } from '@/hooks/use-sales';

interface SaleContractSectionProps {
  saleId: string;
  contractUrl?: string | null;
}

export function SaleContractSection({ saleId, contractUrl }: SaleContractSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const attachContract = useAttachContract(saleId);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      attachContract.mutate(file);
    }
    e.target.value = '';
  };

  // Derive a readable filename from the URL
  const fileName = contractUrl
    ? decodeURIComponent(contractUrl.split('/').pop() ?? 'contract')
    : null;

  const handleDownload = async () => {
    if (!contractUrl || !fileName) return;
    setIsDownloading(true);
    try {
      const response = await fetch(contractUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Contract
        </h3>
      </div>

      {contractUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.03]">
            <FileText className="h-8 w-8 text-primary/60 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">Signed contract</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              title="Download contract"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Allow replacing the contract */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={attachContract.isPending}
            >
              {attachContract.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Replace contract
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="border-2 border-dashed border-white/10 rounded-lg p-5 text-center cursor-pointer hover:border-white/20 transition-colors"
            onClick={() => !attachContract.isPending && fileRef.current?.click()}
          >
            {attachContract.isPending ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin opacity-50" />
                <p className="text-sm">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-7 w-7 opacity-40" />
                <p className="text-sm">Click to upload contract</p>
                <p className="text-xs opacity-60">PDF or Word · max 20 MB</p>
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
        </div>
      )}
    </div>
  );
}
