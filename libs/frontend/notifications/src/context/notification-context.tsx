'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { NotificationApiFetcher } from '../lib/notification-api';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../hooks/use-notifications';
import type { GlobalNotification } from '../types';

// -------------------------------------------------------
// Context shape
// -------------------------------------------------------
interface NotificationContextValue {
  notifications: GlobalNotification[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  isMarkingAll: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// -------------------------------------------------------
// Provider
// -------------------------------------------------------
interface NotificationProviderProps {
  children: React.ReactNode;
  /** An object that exposes a fetch<T> method (e.g. ApiClient instance) */
  fetcher: NotificationApiFetcher;
}

export function NotificationProvider({ children, fetcher }: NotificationProviderProps) {
  const { data, isLoading, isError } = useNotifications(fetcher, { limit: 20 });

  const markReadMutation = useMarkNotificationRead(fetcher);
  const markAllMutation = useMarkAllNotificationsRead(fetcher);

  const notifications = useMemo(() => data?.data ?? [], [data]);
  const unreadCount = useMemo(
    () => data?.unreadCount ?? notifications.filter((n) => !n.isRead).length,
    [data, notifications],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      isError,
      markRead: (id: string) => markReadMutation.mutate(id),
      markAllRead: () => markAllMutation.mutate(),
      isMarkingAll: markAllMutation.isPending,
    }),
    [notifications, unreadCount, isLoading, isError, markReadMutation, markAllMutation],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

// -------------------------------------------------------
// Hook
// -------------------------------------------------------
export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return ctx;
}
