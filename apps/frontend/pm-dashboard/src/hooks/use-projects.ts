'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const projectsKeys = {
  all:     ['projects'] as const,
  lists:   () => [...projectsKeys.all, 'list'] as const,
  list:    (params: object) => [...projectsKeys.lists(), params] as const,
  detail:  (id: string)     => [...projectsKeys.all, 'detail', id] as const,
  stages:  (id: string)     => [...projectsKeys.all, 'stages', id] as const,
  tasks:   (stageId: string) => [...projectsKeys.all, 'tasks', stageId] as const,
};

export function useProjects(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: projectsKeys.list(params ?? {}),
    queryFn:  () => api.getProjects(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectsKeys.detail(id),
    queryFn:  () => api.getProject(id) as Promise<any>,
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createProject(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.lists() });
      toast.success('Project created');
    },
    onError: (e: Error) => toast.error('Failed to create project', e.message),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      api.updateProject(id, dto),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.lists() });
      queryClient.setQueryData(projectsKeys.detail(id), data);
      toast.success('Project updated');
    },
    onError: (e: Error) => toast.error('Failed to update project', e.message),
  });
}

export function useProjectStages(projectId: string) {
  return useQuery({
    queryKey: projectsKeys.stages(projectId),
    queryFn:  () => api.getStages(projectId) as Promise<any>,
    enabled:  !!projectId,
    staleTime: 30_000,
  });
}

export function useTasksByStage(stageId: string) {
  return useQuery({
    queryKey: projectsKeys.tasks(stageId),
    queryFn:  () => api.getTasksByStage(stageId) as Promise<any>,
    enabled:  !!stageId,
    staleTime: 30_000,
  });
}
