'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const pmKeys = {
  engagements: ['pm', 'engagements'] as const,
  engagementList: (params: object) => [...pmKeys.engagements, 'list', params] as const,
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

export function useMyTasks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: pmKeys.myTasksList(params ?? {}),
    queryFn:  () => api.getMyTasks(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
