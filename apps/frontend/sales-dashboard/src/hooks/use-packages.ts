'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IProductPackage } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const packagesKeys = {
  all:    ['packages'] as const,
  lists:  () => [...packagesKeys.all, 'list'] as const,
  list:   (params: object) => [...packagesKeys.lists(), params] as const,
  detail: (id: string) => [...packagesKeys.all, 'detail', id] as const,
};

export function usePackages(params?: Record<string, unknown>) {
  return useQuery({
    queryKey:  packagesKeys.list(params ?? {}),
    queryFn:   () => api.getPackages(params) as Promise<IProductPackage[]>,
    staleTime: 60_000,
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api.createPackage(dto) as Promise<IProductPackage>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packagesKeys.lists() });
      toast.success('Package created');
    },
    onError: (e: Error) => toast.error('Failed to create package', e.message),
  });
}

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updatePackage(id, dto) as Promise<IProductPackage>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packagesKeys.lists() });
      toast.success('Package updated');
    },
    onError: (e: Error) => toast.error('Failed to update package', e.message),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePackage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packagesKeys.lists() });
      toast.success('Package deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete package', e.message),
  });
}
