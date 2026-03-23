'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { UserRole } from '@sentra-core/types';

export type PmRole = 'pm-admin' | 'pm-project-manager' | 'pm-dept-lead' | 'pm-team-member';

export function usePmRole(): PmRole | null {
  const { user } = useAuth();
  const role = user?.role;
  if (!role) return null;
  if (role === UserRole.OWNER || role === UserRole.ADMIN) return 'pm-admin';
  if (role === UserRole.SALES_MANAGER) return 'pm-dept-lead';
  if (role === UserRole.PROJECT_MANAGER) return 'pm-project-manager';
  return 'pm-team-member';
}

export function useDashboardStats() {
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const activeProjects = useQuery({
    queryKey: ['pm', 'dashboard', 'active-projects'],
    queryFn: () => api.getProjects({ status: 'ACTIVE', limit: 1 }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const myTasks = useQuery({
    queryKey: ['pm', 'dashboard', 'my-tasks-count'],
    queryFn: () => api.getMyTasks({ limit: 1 }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const qcQueue = useQuery({
    queryKey: ['pm', 'dashboard', 'qc-queue'],
    queryFn: () => api.getSubmissions({ status: 'SUBMITTED', limit: 1 }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const stages = useQuery({
    queryKey: ['pm', 'dashboard', 'stages-count'],
    queryFn: () => api.getAllStages({ limit: 1 }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const pendingSales = useQuery({
    queryKey: ['pm', 'dashboard', 'pending-sales'],
    queryFn: () => api.fetch<any>('/pipeline/pending-sales', { service: 'pm' }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  return {
    activeProjects: (activeProjects.data as any)?.meta?.total ?? 0,
    myTasksCount: (myTasks.data as any)?.meta?.total ?? 0,
    qcQueueCount: (qcQueue.data as any)?.meta?.total ?? 0,
    stageCount: (stages.data as any)?.meta?.total ?? 0,
    pendingSales: (pendingSales.data as any)?.data ?? [],
    isLoading: activeProjects.isLoading,
  };
}
