'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface PushNotificationsConfig {
  /** Firebase web app config — use NEXT_PUBLIC_FIREBASE_* env vars */
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  vapidKey: string;
  /** Called to register the FCM token on the server */
  onTokenReceived: (token: string) => Promise<void>;
  /** Called to unregister token (on logout) */
  onTokenRemoved?: (token: string) => Promise<void>;
  /** Called when a foreground message arrives */
  onForegroundMessage?: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void;
}

export function usePushNotifications(config: PushNotificationsConfig | null) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isRegistered, setIsRegistered] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setIsSupported(supported);
    if (supported) setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported || !config) return;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return;

    try {
      // Dynamic imports to avoid SSR issues
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

      const app = getApps().length === 0 ? initializeApp(config.firebaseConfig) : getApp();
      const messaging = getMessaging(app);

      // Register service worker
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: config.vapidKey,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        console.warn('[usePushNotifications] No FCM token received');
        return;
      }

      setFcmToken(token);
      await config.onTokenReceived(token);
      setIsRegistered(true);

      // Foreground message handler
      const unsub = onMessage(messaging, (payload) => {
        config.onForegroundMessage?.({
          title: payload.notification?.title,
          body: payload.notification?.body,
          data: payload.data as Record<string, string> | undefined,
        });
      });
      unsubscribeRef.current = unsub;
    } catch (err) {
      console.error('[usePushNotifications] Registration failed:', err);
    }
  }, [isSupported, config]);

  const unregister = useCallback(async () => {
    if (fcmToken && config?.onTokenRemoved) {
      await config.onTokenRemoved(fcmToken);
    }
    unsubscribeRef.current?.();
    setIsRegistered(false);
    setFcmToken(null);
  }, [fcmToken, config]);

  return { isSupported, permission, isRegistered, fcmToken, requestPermission, unregister };
}
