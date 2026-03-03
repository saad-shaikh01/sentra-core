'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const qcKeys = {
  all: ['qc-reviews'] as const,
  queue: (params: object) => [...qcKeys.all, 'queue', params] as const,
  submission: (id: string) => [...qcKeys.all, 'submission', id] as const,
};

export function useQcQueue(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: qcKeys.queue(params ?? {}),
    queryFn: () => api.getSubmissions(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useSubmissionDetail(id: string) {
  return useQuery({
    queryKey: qcKeys.submission(id),
    queryFn: () => api.getSubmission(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, ...dto }: { submissionId: string } & Record<string, unknown>) =>
      api.submitReview(submissionId, dto),
    onSuccess: (_, { submissionId }) => {
      queryClient.invalidateQueries({ queryKey: qcKeys.all });
      // Toast is handled by the component to avoid duplicates
    },
    onError: (e: Error) => toast.error('Review failed', e.message),
  });
}
