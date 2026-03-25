'use client';

import { useEffect } from 'react';
import { usePushNotifications } from '../hooks/use-push-notifications';
import { createNotificationApi } from '../lib/notification-api';
import type { NotificationApiFetcher } from '../lib/notification-api';

interface NotificationPushInitProps {
  fetcher: NotificationApiFetcher;
  /** Auto-request permission on mount (default: false — user must trigger manually) */
  autoRequest?: boolean;
}

/**
 * Mount this inside NotificationProvider to enable FCM push.
 * Reads Firebase config from NEXT_PUBLIC_FIREBASE_* env vars.
 * Safe to mount even when Firebase is not configured — does nothing.
 */
export function NotificationPushInit({ fetcher, autoRequest = false }: NotificationPushInitProps) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  const config =
    apiKey && vapidKey
      ? {
          firebaseConfig: {
            apiKey,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
          },
          vapidKey,
          onTokenReceived: async (token: string) => {
            const api = createNotificationApi(fetcher);
            await api.registerPushToken({ token, platform: 'WEB', userAgent: navigator.userAgent });
          },
          onTokenRemoved: async (token: string) => {
            const api = createNotificationApi(fetcher);
            await api.unregisterPushToken(token);
          },
        }
      : null;

  const { requestPermission, isSupported } = usePushNotifications(config);

  useEffect(() => {
    if (autoRequest && config && isSupported) {
      requestPermission();
    }
  }, [autoRequest, isSupported]);  // re-fires once isSupported becomes true

  return null;
}
