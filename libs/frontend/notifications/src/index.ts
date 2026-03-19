// Types
export type {
  GlobalNotification,
  GlobalNotificationType,
  NotificationListParams,
  NotificationListResponse,
  MarkReadResponse,
  MarkAllReadResponse,
} from './types';

// API factory
export { createNotificationApi } from './lib/notification-api';
export type { NotificationApiClient, NotificationApiFetcher } from './lib/notification-api';

// Hooks (NOTIF-007)
export {
  notificationKeys,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from './hooks/use-notifications';

export { useNotificationSocket } from './hooks/use-notification-socket';
export { usePushNotifications } from './hooks/use-push-notifications';

// Context (NOTIF-008)
export { NotificationProvider, useNotificationContext } from './context/notification-context';

// UI Components (NOTIF-008)
export { NotificationBell } from './components/NotificationBell';
export { NotificationPanel } from './components/NotificationPanel';
export { NotificationItem } from './components/NotificationItem';
