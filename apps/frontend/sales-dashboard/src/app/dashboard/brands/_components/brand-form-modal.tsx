'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBrand, useUpdateBrand, useUploadBrandLogo } from '@/hooks/use-brands';
import { IBrand } from '@sentra-core/types';
import { ImagePlus, Loader2, Upload } from 'lucide-react';

interface BrandFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: IBrand | null;
}

interface FormValues {
  name: string;
  domain: string;
}

export function BrandFormModal({ open, onOpenChange, brand }: BrandFormModalProps) {
  const isEdit = !!brand;
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const uploadBrandLogo = useUploadBrandLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [workingBrandId, setWorkingBrandId] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  useEffect(() => {
    if (open) {
      reset({
        name: brand?.name ?? '',
        domain: brand?.domain ?? '',
      });
      setSelectedLogoFile(null);
      setPreviewUrl(null);
      setWorkingBrandId(brand?.id ?? null);
    }
  }, [open, brand, reset]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const mutation = isEdit ? updateBrand : createBrand;
  const error = mutation.error?.message ?? uploadBrandLogo.error?.message ?? null;
  const isSaving = mutation.isPending || uploadBrandLogo.isPending;
  const currentLogo = previewUrl ?? brand?.logoUrl ?? '';

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedLogoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    event.target.value = '';
  };

  const onSubmit = async (values: FormValues) => {
    const dto = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '')
    );
    let savedBrand: IBrand;
    const targetBrandId = brand?.id ?? workingBrandId;

    if (targetBrandId) {
      savedBrand = Object.keys(dto).length > 0 || !brand || brand.id !== targetBrandId
        ? await updateBrand.mutateAsync({ id: targetBrandId, ...dto })
        : brand;
    } else {
      savedBrand = await createBrand.mutateAsync(dto);
      setWorkingBrandId(savedBrand.id);
    }

    if (selectedLogoFile) {
      await uploadBrandLogo.mutateAsync({ id: savedBrand.id, file: selectedLogoFile });
    }

    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Brand' : 'New Brand'}
      description={isEdit ? 'Update brand details.' : 'Create a new brand for your organization.'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="Acme Corp"
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            placeholder="acme.com"
            {...register('domain')}
          />
        </div>

        <div className="space-y-2">
          <Label>Brand Logo</Label>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {currentLogo ? (
                  <img src={currentLogo} alt="Brand logo preview" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upload logo directly to your Wasabi/CDN storage. PNG, JPG, SVG, WEBP, ICO up to 5 MB.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedLogoFile ? 'Change Logo' : currentLogo ? 'Replace Logo' : 'Upload Logo'}
                  </Button>
                  {selectedLogoFile ? (
                    <p className="self-center text-xs text-muted-foreground">
                      Selected: {selectedLogoFile.name}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
              className="hidden"
              onChange={handleLogoFileChange}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEdit ? 'Save Changes' : 'Create Brand'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
