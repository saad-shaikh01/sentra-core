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
  board:   (id: string)     => [...projectsKeys.all, 'board', id] as const,
  activity:(id: string, params: object) => [...projectsKeys.all, 'activity', id, params] as const,
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
    queryFn:  () => api.getProject(id),
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useProjectBoard(id: string) {
  return useQuery({
    queryKey: projectsKeys.board(id),
    queryFn: () => api.getProjectBoard(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useProjectActivity(
  id: string,
  params?: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: projectsKeys.activity(id, params ?? {}),
    queryFn: () => api.getProjectActivity(id, params),
    enabled: !!id && enabled,
    staleTime: 30_000,
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

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveProject(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectsKeys.detail(id) });
      toast.success('Project archived');
    },
    onError: (e: Error) => toast.error('Failed to archive project', e.message),
  });
}

export function useProjectStages(projectId: string) {
  return useQuery({
    queryKey: projectsKeys.stages(projectId),
    queryFn:  () => api.getStages(projectId),
    enabled:  !!projectId,
    staleTime: 30_000,
  });
}

export function useTasksByStage(stageId: string) {
  return useQuery({
    queryKey: projectsKeys.tasks(stageId),
    queryFn:  () => api.getTasksByStage(stageId),
    enabled:  !!stageId,
    staleTime: 30_000,
  });
}
