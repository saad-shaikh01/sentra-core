'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';

export const stagesKeys = {
  all: ['stages'] as const,
  lists: () => [...stagesKeys.all, 'list'] as const,
  list: (params: object) => [...stagesKeys.lists(), params] as const,
};

export function useAllStages(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: stagesKeys.list(params ?? {}),
    queryFn: () => api.getAllStages(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}
