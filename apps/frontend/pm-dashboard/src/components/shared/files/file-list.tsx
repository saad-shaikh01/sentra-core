'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FileIcon, ExternalLink, Download, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { toast } from '@/hooks/use-toast';

interface FileListProps {
  scopeType: string;
  scopeId: string;
  className?: string;
}

export function FileList({ scopeType, scopeId, className }: FileListProps) {
  const queryClient = useQueryClient();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const queryKey = ['files', 'links', scopeType, scopeId];

  const { data: links, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.fetch<any[]>(`/files/links?scopeType=${scopeType}&scopeId=${scopeId}`, { service: 'pm' }),
    enabled: !!scopeId,
  });

  const getSignedUrl = useMutation({
    mutationFn: (fileAssetId: string) => api.fetch<any>(`/files/${fileAssetId}/signed-url`, { service: 'pm' }),
    onSuccess: (data) => {
      // Open the presigned URL in a new tab
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (e: Error) => toast.error('Failed to get file link', e.message),
  });

  if (isLoading) {
    return (
      <div className={cn("space-y-2 py-2", className)}>
        {[1, 2].map((i) => (
          <div key={i} className="h-12 w-full bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!links || links.length === 0) {
    return null; // Don't show anything if there are no files
  }

  return (
    <div className={cn("space-y-2", className)}>
      {links.map((link) => (
        <div 
          key={link.id} 
          className="group flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-8 w-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <FileIcon className="h-4 w-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-medium text-foreground truncate">
                {link.fileAsset.name}
              </span>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                <span>{link.fileAsset.assetType}</span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(link.createdAt).toLocaleDateString()}
                </span>
                {link.fileVersion && (
                  <>
                    <span>&bull;</span>
                    <span>v{link.fileVersion.versionNumber}</span>
                    <span>&bull;</span>
                    <span>{(link.fileVersion.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={() => getSignedUrl.mutate(link.fileAssetId)}
              disabled={getSignedUrl.isPending}
              title="View/Download"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
