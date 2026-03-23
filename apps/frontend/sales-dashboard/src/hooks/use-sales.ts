'use client';

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ISale, ISaleWithRelations, ISalesSummary, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';
import { clientsKeys } from '@/hooks/use-clients';
import { leadsKeys } from '@/hooks/use-leads';

export const salesKeys = {
  all:    ['sales'] as const,
  lists:  () => [...salesKeys.all, 'list'] as const,
  list:   (params: object) => [...salesKeys.lists(), params] as const,
  detail: (id: string)     => [...salesKeys.all, 'detail', id] as const,
};

type CreateSaleInput = {
  clientId?: string;
  leadId?: string;
  brandId: string;
  totalAmount?: number;
  currency?: string;
  description?: string;
  contractUrl?: string;
  paymentPlan?: string;
  installmentCount?: number;
  items?: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    customPrice?: number;
  }>;
};

export function useSales(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: salesKeys.list(params ?? {}),
    queryFn:  () => api.getSales(params) as Promise<IPaginatedResponse<ISale>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useSale(id: string): UseQueryResult<ISaleWithRelations> {
  return useQuery({
    queryKey: salesKeys.detail(id),
    queryFn:  () => api.getSale(id) as Promise<ISaleWithRelations>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSaleInput) => api.createSale(dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });

      if (variables.leadId) {
        queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
        queryClient.invalidateQueries({ queryKey: leadsKeys.detail(variables.leadId) });
        queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
        toast.success('Sale created for this lead');
        return;
      }

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
    onError: (e: Error) => {
      const message = e.message.toLowerCase();

      if (message.includes('cannot delete sale') && message.includes('invoice')) {
        toast.error(
          'Cannot delete sale',
          'This sale already has invoice(s). Delete the related invoice(s) first.',
        );
        return;
      }

      toast.error('Failed to delete sale', e.message);
    },
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Subscription created');
    },
    onError: (e: Error) => toast.error('Failed to create subscription', e.message),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelSubscription(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Subscription cancelled');
    },
    onError: (e: Error) => toast.error('Failed to cancel subscription', e.message),
  });
}

export function useSalesSummary(params?: { brandId?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: [...salesKeys.all, 'summary', params ?? {}] as const,
    queryFn: () => api.getSalesSummary(params) as Promise<ISalesSummary>,
    staleTime: 60_000,
  });
}

export function useRefundSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.refundSale(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: [...salesKeys.all, 'summary'] });
      toast.success('Refund issued successfully');
    },
    onError: (e: Error) => toast.error('Refund failed', e.message),
  });
}

export function useChargebackSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.chargebackSale(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      toast.success('Chargeback recorded');
    },
    onError: (e: Error) => toast.error('Chargeback failed', e.message),
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; amount: number; invoiceId?: string; invoiceNumber?: string; externalRef?: string; note: string }) =>
      api.recordPayment(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      toast.success('Payment recorded successfully');
    },
    onError: (e: Error) => toast.error('Failed to record payment', e.message),
  });
}

export function useAddSaleNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.addSaleNote(id, note),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(id) });
      toast.success('Note added');
    },
    onError: (e: Error) => toast.error('Failed to add note', e.message),
  });
}

export function useUploadContract() {
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const form = new FormData();
      form.append('file', file);
      return api.fetch<{ url: string }>('/sales/upload/contract', {
        method: 'POST',
        body: form,
      });
    },
    onError: (e: Error) => toast.error('Contract upload failed', e.message),
  });
}

/** Upload contract file then immediately patch the sale's contractUrl */
export function useAttachContract(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const form = new FormData();
      form.append('file', file);
      const { url } = await api.fetch<{ url: string }>('/sales/upload/contract', {
        method: 'POST',
        body: form,
      });
      await api.updateSale(saleId, { contractUrl: url });
      return url;
    },
    onSuccess: (url) => {
      queryClient.setQueryData(salesKeys.detail(saleId), (old: any) =>
        old ? { ...old, contractUrl: url } : old,
      );
      toast.success('Contract attached');
    },
    onError: (e: Error) => toast.error('Contract upload failed', e.message),
  });
}
