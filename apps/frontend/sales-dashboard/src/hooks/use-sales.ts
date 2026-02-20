'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ISale, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const salesKeys = {
  all:    ['sales'] as const,
  lists:  () => [...salesKeys.all, 'list'] as const,
  list:   (params: object) => [...salesKeys.lists(), params] as const,
  detail: (id: string)     => [...salesKeys.all, 'detail', id] as const,
};

export function useSales(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: salesKeys.list(params ?? {}),
    queryFn:  () => api.getSales(params) as Promise<IPaginatedResponse<ISale>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: salesKeys.detail(id),
    queryFn:  () => api.getSale(id) as Promise<ISale>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createSale(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Sale created');
    },
    onError: (e: Error) => toast.error('Failed to create sale', e.message),
  });
}

export function useUpdateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateSale(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.setQueryData(salesKeys.detail(id), data);
      toast.success('Sale updated');
    },
    onError: (e: Error) => toast.error('Failed to update sale', e.message),
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Sale deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete sale', e.message),
  });
}

export function useChargeSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.chargeSale(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Payment charged successfully');
    },
    onError: (e: Error) => toast.error('Charge failed', e.message),
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.createSubscription(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.setQueryData(salesKeys.detail(id), data);
      toast.success('Subscription created');
    },
    onError: (e: Error) => toast.error('Failed to create subscription', e.message),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelSubscription(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.setQueryData(salesKeys.detail(id), data);
      toast.success('Subscription cancelled');
    },
    onError: (e: Error) => toast.error('Failed to cancel subscription', e.message),
  });
}
