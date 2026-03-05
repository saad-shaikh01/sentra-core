'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IPaginatedResponse } from '@sentra-core/types';
import { toast } from '@/hooks/use-toast';

export const notificationKeys = {
  all: ['pm', 'notifications'] as const,
  list: (params: object) => [...notificationKeys.all, 'list', params] as const,
};

export function useNotifications(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: notificationKeys.list(params ?? {}),
    queryFn: () => api.getNotifications(params) as Promise<IPaginatedResponse<any>>,
    placeholderData: (prev) => prev,
    staleTime: 20_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (e: Error) => toast.error('Failed to mark notification', e.message),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success('All notifications marked as read');
    },
    onError: (e: Error) => toast.error('Failed to mark all notifications', e.message),
  });
}

