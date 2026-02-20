'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IBrand, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const brandsKeys = {
  all:    ['brands'] as const,
  lists:  () => [...brandsKeys.all, 'list'] as const,
  list:   (params: object) => [...brandsKeys.lists(), params] as const,
  detail: (id: string)     => [...brandsKeys.all, 'detail', id] as const,
};

export function useBrands(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: brandsKeys.list(params ?? {}),
    queryFn:  () => api.getBrands(params) as Promise<IPaginatedResponse<IBrand>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useBrand(id: string) {
  return useQuery({
    queryKey: brandsKeys.detail(id),
    queryFn:  () => api.getBrand(id) as Promise<IBrand>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createBrand(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandsKeys.lists() });
      toast.success('Brand created');
    },
    onError: (e: Error) => toast.error('Failed to create brand', e.message),
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateBrand(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: brandsKeys.lists() });
      queryClient.setQueryData(brandsKeys.detail(id), data);
      toast.success('Brand updated');
    },
    onError: (e: Error) => toast.error('Failed to update brand', e.message),
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandsKeys.lists() });
      toast.success('Brand deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete brand', e.message),
  });
}
