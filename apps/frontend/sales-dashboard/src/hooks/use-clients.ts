'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IClient, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const clientsKeys = {
  all:    ['clients'] as const,
  lists:  () => [...clientsKeys.all, 'list'] as const,
  list:   (params: object) => [...clientsKeys.lists(), params] as const,
  detail: (id: string)     => [...clientsKeys.all, 'detail', id] as const,
};

export function useClients(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: clientsKeys.list(params ?? {}),
    queryFn:  () => api.getClients(params) as Promise<IPaginatedResponse<IClient>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientsKeys.detail(id),
    queryFn:  () => api.getClient(id) as Promise<IClient>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createClient(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      toast.success('Client created');
    },
    onError: (e: Error) => toast.error('Failed to create client', e.message),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateClient(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      queryClient.setQueryData(clientsKeys.detail(id), data);
      toast.success('Client updated');
    },
    onError: (e: Error) => toast.error('Failed to update client', e.message),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      toast.success('Client deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete client', e.message),
  });
}
