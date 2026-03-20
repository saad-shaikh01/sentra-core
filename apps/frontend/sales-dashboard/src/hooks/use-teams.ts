'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hrmsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export interface TeamTypeRecord {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  organizationId?: string | null;
}

export interface TeamManager {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface TeamMemberRecord {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'MEMBER' | 'LEAD';
  jobTitle: string | null;
  joinedAt: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  type: TeamTypeRecord;
  manager: TeamManager | null;
  memberCount: number;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMemberRecord[];
}

export interface TeamListResponse {
  data: TeamSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface TeamStats {
  teamId: string;
  period: string;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: string;
  totalSales: number;
  totalRevenue: number;
}

export interface EmployeeOption {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  status: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export const teamKeys = {
  all: ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list: (params: object) => [...teamKeys.lists(), params] as const,
  detail: (id: string) => [...teamKeys.all, 'detail', id] as const,
  stats: (id: string, period: string) => [...teamKeys.all, 'stats', id, period] as const,
  types: ['team-types'] as const,
  employees: (params: object) => [...teamKeys.all, 'employees', params] as const,
};

export function useTeams(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: teamKeys.list(params ?? {}),
    queryFn: async () => hrmsApi.getTeams({ isActive: true, ...params }) as Promise<TeamListResponse>,
    staleTime: 60_000,
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: teamKeys.detail(id),
    queryFn: async () => {
      const response = await hrmsApi.getTeam(id) as { data: TeamDetail };
      return response.data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useTeamStats(teamId: string, period = 'this_month') {
  return useQuery({
    queryKey: teamKeys.stats(teamId, period),
    queryFn: async () => api.getTeamStats(teamId, period) as Promise<TeamStats>,
    enabled: !!teamId,
    staleTime: 30_000,
  });
}

export function useTeamTypes(enabled = true) {
  return useQuery({
    queryKey: teamKeys.types,
    queryFn: async () => {
      const response = await hrmsApi.getTeamTypes() as { data: TeamTypeRecord[] };
      return response.data;
    },
    enabled,
    staleTime: 300_000,
  });
}

export function useEmployees(params?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: teamKeys.employees(params ?? {}),
    queryFn: async () => hrmsApi.getEmployees(params) as Promise<PaginatedResponse<EmployeeOption>>,
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => hrmsApi.createTeam(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Team created');
    },
    onError: (e: Error) => toast.error('Failed to create team', e.message),
  });
}

export function useUpdateTeam(id: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => hrmsApi.updateTeam(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      qc.invalidateQueries({ queryKey: teamKeys.detail(id) });
      toast.success('Team updated');
    },
    onError: (e: Error) => toast.error('Failed to update team', e.message),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => hrmsApi.deleteTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Team deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete team', e.message),
  });
}

export function useAddTeamMember(teamId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (dto: { userId: string; role?: string }) => hrmsApi.addTeamMember(teamId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Member added');
    },
    onError: (e: Error) => toast.error('Failed to add member', e.message),
  });
}

export function useUpdateTeamMember(teamId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      hrmsApi.updateTeamMember(teamId, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Member role updated');
    },
    onError: (e: Error) => toast.error('Failed to update role', e.message),
  });
}

export function useRemoveTeamMember(teamId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => hrmsApi.removeTeamMember(teamId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Member removed');
    },
    onError: (e: Error) => toast.error('Failed to remove member', e.message),
  });
}
