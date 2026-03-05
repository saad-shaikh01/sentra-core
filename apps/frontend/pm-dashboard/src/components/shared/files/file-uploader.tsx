'use client';

import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface FileUploaderProps {
  projectId: string;
  scopeType: string;
  scopeId: string;
  assetType?: string;
  onUploadComplete?: () => void;
  className?: string;
}

export function FileUploader({
  projectId,
  scopeType,
  scopeId,
  assetType = 'WORKING',
  onUploadComplete,
  className,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processUploads = async (files: File[]) => {
    if (!files.length) return;

    for (const file of files) {
      setUploadingFiles((prev) => [...prev, { name: file.name, progress: 10 }]);

      try {
        // 1. Request Upload Token (creates FileAsset and returns presigned URL)
        const tokenRes = await api.requestFileUploadToken({
          projectId,
          assetType,
          name: file.name,
          mimeType: file.type,
        });
        const tokenData = tokenRes.data;

        setUploadingFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, progress: 40 } : f))
        );

        // 2. Upload to Wasabi via Presigned URL
        const uploadResponse = await fetch(tokenData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        if (!uploadResponse.ok) throw new Error('Upload to storage failed');

        setUploadingFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, progress: 80 } : f))
        );

        // 3. Complete Upload (creates FileVersion)
        const versionRes = await api.completeFileUpload({
          fileAssetId: tokenData.fileAssetId,
          storageKey: tokenData.storageKey,
          originalFilename: file.name,
          sizeBytes: file.size,
        });
        const versionData = versionRes.data;

        // 4. Link File to Scope
        await api.linkFile(tokenData.fileAssetId, {
          fileVersionId: versionData.id,
          scopeType,
          scopeId,
          linkType: 'REFERENCE',
        });

        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
        toast.success(`Uploaded ${file.name}`);
        
        queryClient.invalidateQueries({ queryKey: ['files', 'links', scopeType, scopeId] });
        if (onUploadComplete) onUploadComplete();
        
      } catch (error: unknown) {
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
        const message =
          error instanceof Error ? error.message : 'Unexpected upload error';
        toast.error(`Failed to upload ${file.name}`, message);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processUploads(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processUploads(Array.from(e.target.files));
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={className}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3",
          isDragging 
            ? "border-primary/50 bg-primary/5" 
            : "border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20"
        )}
      >
        <div className={cn(
          "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
          isDragging ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
        )}>
          <UploadCloud className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Click or drag files to upload</p>
          <p className="text-xs text-muted-foreground mt-1">Files are securely uploaded to Wasabi storage</p>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />
      </div>

      {uploadingFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadingFiles.map((file) => (
            <div key={file.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-3 truncate">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="text-sm truncate">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{file.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
