'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ILead, ILeadActivity, IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const leadsKeys = {
  all:        ['leads'] as const,
  lists:      () => [...leadsKeys.all, 'list'] as const,
  list:       (params: object) => [...leadsKeys.lists(), params] as const,
  detail:     (id: string)     => [...leadsKeys.all, 'detail', id] as const,
  activities: (id: string)     => [...leadsKeys.all, 'activities', id] as const,
};

export function useLeads(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: leadsKeys.list(params ?? {}),
    queryFn:  () => api.getLeads(params) as Promise<IPaginatedResponse<ILead>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: leadsKeys.detail(id),
    queryFn:  () => api.getLead(id) as Promise<ILead>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createLead(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      toast.success('Lead created');
    },
    onError: (e: Error) => toast.error('Failed to create lead', e.message),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateLead(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      queryClient.setQueryData(leadsKeys.detail(id), data);
      toast.success('Lead updated');
    },
    onError: (e: Error) => toast.error('Failed to update lead', e.message),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      toast.success('Lead deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete lead', e.message),
  });
}

export function useChangeLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.changeLeadStatus(id, status),
    onSuccess: (data, { id, status }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      queryClient.setQueryData(leadsKeys.detail(id), data);
      toast.success(`Lead moved to ${status}`);
    },
    onError: (e: Error) => toast.error('Status change failed', e.message),
  });
}

export function useAssignLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string }) =>
      api.assignLead(id, assignedToId),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      queryClient.setQueryData(leadsKeys.detail(id), data);
      toast.success('Lead assigned');
    },
    onError: (e: Error) => toast.error('Failed to assign lead', e.message),
  });
}

export function useAddLeadNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.addLeadNote(id, content),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.activities(id) });
      toast.success('Note added');
    },
    onError: (e: Error) => toast.error('Failed to add note', e.message),
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.convertLead(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
      toast.success('Lead converted to client');
    },
    onError: (e: Error) => toast.error('Conversion failed', e.message),
  });
}

export function useLeadActivities(id: string) {
  return useQuery({
    queryKey: leadsKeys.activities(id),
    queryFn:  () => api.getLeadActivities(id) as Promise<ILeadActivity[]>,
    enabled:  !!id,
    staleTime: 30_000,
  });
}
