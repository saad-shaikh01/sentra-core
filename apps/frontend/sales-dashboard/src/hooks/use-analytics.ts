import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IAnalyticsSummary } from '@sentra-core/types';

export interface AnalyticsFilters {
  fromDate?: string;
  toDate?: string;
  preset?: 'this_week' | 'this_month' | 'last_30_days' | 'specific_month' | 'custom';
  granularity?: 'weekly' | 'monthly';
  compareMode?: 'previous_period' | 'previous_month' | 'none';
  month?: string;
  year?: string;
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: (filters: AnalyticsFilters) => ['analytics', 'summary', filters] as const,
};

export function useAnalyticsSummary(filters: AnalyticsFilters = {}) {
  return useQuery<IAnalyticsSummary>({
    queryKey: analyticsKeys.summary(filters),
    queryFn: () => api.getAnalyticsSummary(filters),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
