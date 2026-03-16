'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

export const pmKeys = {
  engagements: ['pm', 'engagements'] as const,
  engagementList: (params: object) => [...pmKeys.engagements, 'list', params] as const,
  engagementDetail: (id: string) => [...pmKeys.engagements, 'detail', id] as const,
  templates: ['pm', 'templates'] as const,
  templateList: (params: object) => [...pmKeys.templates, 'list', params] as const,
  myTasks: ['pm', 'my-tasks'] as const,
  myTasksList: (params: object) => [...pmKeys.myTasks, 'list', params] as const,
};

export function useEngagements(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: pmKeys.engagementList(params ?? {}),
    queryFn:  () => api.getEngagements(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useTemplates(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: pmKeys.templateList(params ?? {}),
    queryFn:  () => api.getTemplates(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 300_000, // Templates change less often
  });
}

export function useEngagement(id: string) {
  return useQuery({
    queryKey: pmKeys.engagementDetail(id),
    queryFn: () => api.getEngagement(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createEngagement(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.engagements });
      toast.success('Engagement created');
    },
    onError: (e: Error) => toast.error('Failed to create engagement', e.message),
  });
}

export function useUpdateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateEngagement(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pmKeys.engagements });
      queryClient.invalidateQueries({ queryKey: pmKeys.engagementDetail(id) });
      toast.success('Engagement updated');
    },
    onError: (e: Error) => toast.error('Failed to update engagement', e.message),
  });
}

export function useArchiveEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveEngagement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.engagements });
      toast.success('Engagement archived');
    },
    onError: (e: Error) => toast.error('Failed to archive engagement', e.message),
  });
}

export function useMyTasks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: pmKeys.myTasksList(params ?? {}),
    queryFn:  () => api.getMyTasks(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['pm', 'notifications', 'count'],
    queryFn: async () => {
      const res = await api.getNotifications({ status: 'UNREAD', limit: 1 });
      return (res as any)?.meta?.total ?? 0;
    },
    enabled: !!user?.organizationId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
