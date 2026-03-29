'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IInvoice, IInvoiceSummary, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const invoicesKeys = {
  all:    ['invoices'] as const,
  lists:  () => [...invoicesKeys.all, 'list'] as const,
  list:   (params: object) => [...invoicesKeys.lists(), params] as const,
  detail: (id: string)     => [...invoicesKeys.all, 'detail', id] as const,
};

export function useInvoices(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: invoicesKeys.list(params ?? {}),
    queryFn:  () => api.getInvoices(params) as Promise<IPaginatedResponse<IInvoice>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoicesKeys.detail(id),
    queryFn:  () => api.getInvoice(id) as Promise<IInvoice>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createInvoice(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Invoice created');
    },
    onError: (e: Error) => toast.error('Failed to create invoice', e.message),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateInvoice(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: invoicesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoicesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Invoice updated');
    },
    onError: (e: Error) => toast.error('Failed to update invoice', e.message),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Invoice deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete invoice', e.message),
  });
}

export function useInvoiceSummary(params?: { brandId?: string }) {
  return useQuery({
    queryKey: [...invoicesKeys.all, 'summary', params ?? {}] as const,
    queryFn: () => api.getInvoiceSummary(params) as Promise<IInvoiceSummary>,
    staleTime: 60_000,
  });
}

export function usePayInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.payInvoice(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: invoicesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoicesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('Invoice paid successfully');
    },
    onError: (e: Error) => toast.error('Payment failed', e.message),
  });
}
