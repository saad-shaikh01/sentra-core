'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from './use-toast';

export function useProjectHealth() {
  return useQuery({
    queryKey: ['pm', 'reports', 'project-health'],
    queryFn: () => api.getPmReports('project-health'),
    staleTime: 5 * 60_000,
  });
}

export function useSlaBreaches(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['pm', 'reports', 'sla-breaches', page, limit],
    queryFn: () => api.getPmReports('sla-breaches', { page, limit }),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useTeamPerformance() {
  return useQuery({
    queryKey: ['pm', 'reports', 'team-performance'],
    queryFn: () => api.getPmReports('team-performance'),
    staleTime: 5 * 60_000,
  });
}

export function useEngagementFinancials() {
  return useQuery({
    queryKey: ['pm', 'reports', 'financials'],
    queryFn: () => api.getPmReports('engagement-financials'),
    staleTime: 5 * 60_000,
  });
}

export function useResolveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resolveEscalation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm', 'reports', 'sla-breaches'] });
      toast.success('Escalation resolved');
    },
    onError: (e: Error) => toast.error('Failed to resolve', e.message),
  });
}
