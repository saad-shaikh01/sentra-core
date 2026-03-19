import type {
  NotificationListParams,
  NotificationListResponse,
  MarkReadResponse,
  MarkAllReadResponse,
} from '../types';

// ============================================================
// Minimal fetch interface — concrete implementations must
// satisfy this shape (ApiClient.fetch is compatible).
// ============================================================
export interface NotificationApiFetcher {
  fetch<T>(endpoint: string, options?: RequestInit & { skipAuth?: boolean }): Promise<T>;
}

export interface NotificationApiClient {
  listNotifications(params?: NotificationListParams): Promise<NotificationListResponse>;
  markNotificationRead(id: string): Promise<MarkReadResponse>;
  markAllNotificationsRead(): Promise<MarkAllReadResponse>;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Factory that creates a typed notification API client from any object
 * that exposes a `fetch<T>(endpoint, options?)` method.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   const notifApi = createNotificationApi(api);
 */
export function createNotificationApi(fetcher: NotificationApiFetcher): NotificationApiClient {
  return {
    listNotifications(params?: NotificationListParams) {
      const qs = buildQueryString(params as Record<string, unknown>);
      return fetcher.fetch<NotificationListResponse>(`/notifications${qs}`);
    },

    markNotificationRead(id: string) {
      return fetcher.fetch<MarkReadResponse>(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
    },

    markAllNotificationsRead() {
      return fetcher.fetch<MarkAllReadResponse>('/notifications/read-all', {
        method: 'PATCH',
      });
    },
  };
}
