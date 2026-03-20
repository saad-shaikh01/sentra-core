import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TeamBrandMapping {
  id: string;
  teamId: string;
  brandId: string;
  team: { id: string; name: string };
  brand: { id: string; name: string };
  createdAt: string;
}

const keys = {
  all: ['team-brands'] as const,
  byTeam: (teamId: string) => ['team-brands', 'team', teamId] as const,
};

export function useTeamBrands() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => api.getTeamBrands() as Promise<TeamBrandMapping[]>,
  });
}

export function useTeamBrandsByTeam(teamId: string) {
  const { data: all, ...rest } = useTeamBrands();
  return {
    ...rest,
    data: all?.filter((m) => m.teamId === teamId) ?? [],
  };
}

export function useAssignBrand(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) => api.assignBrandToTeam(teamId, brandId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useUnassignBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brandId: string) => api.unassignBrandFromTeam(brandId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useReassignBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, newTeamId }: { brandId: string; newTeamId: string }) =>
      api.reassignBrandToTeam(brandId, newTeamId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}
