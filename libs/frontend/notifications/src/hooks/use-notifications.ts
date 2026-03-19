'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createNotificationApi } from '../lib/notification-api';
import type { NotificationApiFetcher } from '../lib/notification-api';
import type { NotificationListParams, NotificationListResponse } from '../types';

// -------------------------------------------------------
// Query key factory
// -------------------------------------------------------
export const notificationKeys = {
  all: ['global', 'notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: object) => [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

// -------------------------------------------------------
// useNotifications
// -------------------------------------------------------
export function useNotifications(
  fetcher: NotificationApiFetcher,
  params?: NotificationListParams,
) {
  const client = createNotificationApi(fetcher);
  return useQuery<NotificationListResponse>({
    queryKey: notificationKeys.list(params ?? {}),
    queryFn: () => client.listNotifications(params),
    placeholderData: (prev) => prev,
    staleTime: 20_000,
  });
}

// -------------------------------------------------------
// useMarkNotificationRead
// -------------------------------------------------------
export function useMarkNotificationRead(fetcher: NotificationApiFetcher) {
  const queryClient = useQueryClient();
  const client = createNotificationApi(fetcher);
  return useMutation({
    mutationFn: (id: string) => client.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

// -------------------------------------------------------
// useMarkAllNotificationsRead
// -------------------------------------------------------
export function useMarkAllNotificationsRead(
  fetcher: NotificationApiFetcher,
  onSuccessCallback?: () => void,
) {
  const queryClient = useQueryClient();
  const client = createNotificationApi(fetcher);
  return useMutation({
    mutationFn: () => client.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      onSuccessCallback?.();
    },
  });
}
