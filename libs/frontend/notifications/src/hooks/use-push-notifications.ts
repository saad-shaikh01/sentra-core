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

const VAPID_PLACEHOLDER_PATTERN = /(your-vapid-key|replace[-_]?me)/i;

export function normalizeVapidKey(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;

  const trimmedKey = rawKey.trim();
  const unwrappedKey =
    (trimmedKey.startsWith('"') && trimmedKey.endsWith('"')) ||
    (trimmedKey.startsWith("'") && trimmedKey.endsWith("'")) ||
    (trimmedKey.startsWith('`') && trimmedKey.endsWith('`'))
      ? trimmedKey.slice(1, -1)
      : trimmedKey;

  const condensedKey = unwrappedKey.replace(/\s+/g, '');
  if (!condensedKey || VAPID_PLACEHOLDER_PATTERN.test(condensedKey)) {
    return null;
  }

  const standardBase64Key = condensedKey.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64Key = standardBase64Key.padEnd(
    Math.ceil(standardBase64Key.length / 4) * 4,
    '='
  );

  try {
    const decodedKey = Uint8Array.from(atob(paddedBase64Key), (char) => char.charCodeAt(0));

    // VAPID public keys are uncompressed P-256 points: 65 bytes, starting with 0x04.
    if (decodedKey.length !== 65 || decodedKey[0] !== 0x04) {
      return null;
    }
  } catch {
    return null;
  }

  return condensedKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

    const vapidKey = normalizeVapidKey(config.vapidKey);
    if (!vapidKey) {
      console.warn(
        '[usePushNotifications] Skipping registration because NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing or invalid.'
      );
      return;
    }

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
        vapidKey,
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
