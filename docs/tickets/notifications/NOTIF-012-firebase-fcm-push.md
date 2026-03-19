# NOTIF-012 — Firebase FCM Push Notifications (Foreground + Background)

## Overview
Implement Firebase Cloud Messaging for push notifications:
- **Foreground**: Socket.io already handles this (NOTIF-005/007) — FCM is backup
- **Background**: Service worker receives FCM push when user tab is closed/background

This ticket implements: backend `FcmService`, frontend SW, frontend `usePushNotifications` hook.

## Prerequisites
- NOTIF-004 completed (`POST /api/notifications/push-tokens` endpoint exists)
- NOTIF-005 completed (Socket.io gateway — to check if user online before sending FCM)
- Firebase project must be created by the user (see User Action Required below)

## ⚠️ User Action Required Before Implementation

The agent implementing this ticket **MUST** ask the user for these values before proceeding:
1. Firebase project Service Account JSON (for backend)
2. Firebase Web App config (for frontend): `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
3. VAPID key (Web Push certificate from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates)

Store these in `.env` files — NEVER hardcode in source files.

---

## Scope

**Backend:**
```
apps/backend/core-service/src/modules/notifications/fcm.service.ts   ← implement (was stub)
```

**Frontend (BOTH dashboards):**
```
apps/frontend/sales-dashboard/public/firebase-messaging-sw.js
apps/frontend/pm-dashboard/public/firebase-messaging-sw.js
libs/frontend/notifications/src/hooks/use-push-notifications.ts  ← implement (was stub)
```

**Env files:**
```
apps/backend/core-service/.env           ← FIREBASE_SERVICE_ACCOUNT_PATH or JSON
apps/frontend/sales-dashboard/.env.local ← NEXT_PUBLIC_FIREBASE_* vars
apps/frontend/pm-dashboard/.env.local    ← same vars
```

---

## Backend: FcmService

### Install firebase-admin
```bash
cd apps/backend/core-service
npm install firebase-admin
```

### Environment variable
```bash
# Option A: Path to service account JSON file
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json

# Option B: JSON string in env (better for production)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

### fcm.service.ts (replace stub)

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  onModuleInit() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountJson && !serviceAccountPath) {
      this.logger.warn('Firebase not configured — push notifications disabled');
      return;
    }

    try {
      const serviceAccount = serviceAccountJson
        ? JSON.parse(serviceAccountJson)
        : require(serviceAccountPath!);

      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.logger.log('Firebase Admin initialized');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin:', err);
    }
  }

  async sendMulticast(opts: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.app || opts.tokens.length === 0) return;

    try {
      const response = await admin.messaging(this.app).sendEachForMulticast({
        tokens: opts.tokens,
        notification: {
          title: opts.title,
          body: opts.body,
        },
        data: opts.data,
        webpush: {
          notification: {
            title: opts.title,
            body: opts.body,
            icon: '/icon-192.png',  // must exist in public/
            badge: '/badge-72.png', // must exist in public/
            requireInteraction: false,
          },
          fcmOptions: {
            link: opts.data?.url ?? '/',
          },
        },
      });

      // Remove invalid tokens from DB
      const invalidIndices: number[] = [];
      response.responses.forEach((res, idx) => {
        if (!res.success && (
          res.error?.code === 'messaging/invalid-registration-token' ||
          res.error?.code === 'messaging/registration-token-not-registered'
        )) {
          invalidIndices.push(idx);
        }
      });

      // Note: invalid token cleanup handled in NotificationQueueProcessor
      // Just log here
      if (invalidIndices.length > 0) {
        this.logger.warn(`${invalidIndices.length} invalid FCM tokens detected`);
      }
    } catch (err) {
      // Non-fatal — log and continue
      this.logger.error('FCM sendMulticast error:', err);
    }
  }
}
```

---

## Frontend: Service Worker

**Both dashboards need identical SW file in their `public/` directory.**

```javascript
// public/firebase-messaging-sw.js
// NOTE: Replace config values with actual values from env — but since this is a
// static file in public/, values must be hardcoded here OR use a build-time injection approach.
// Best approach: use Next.js public env vars via a generated sw file.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// These values are safe to be in the SW (they're public client-side config)
firebase.initializeApp({
  apiKey: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  const url = payload.data?.url ?? '/';

  self.registration.showNotification(title ?? 'New notification', {
    body: body ?? '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { url },
  });
});

// Click on background notification → navigate to URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new tab
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
```

**IMPORTANT for SW file:** The Firebase config values must be the actual values from `.env.local`. Since service workers can't read Next.js env vars, there are two approaches:
1. Hardcode values in SW (acceptable since these are public client config, not secrets)
2. Use a Next.js API route at `/api/firebase-config` that returns the config, and fetch it in SW

**Recommend option 1** for simplicity — Firebase client config is NOT secret.

---

## Frontend: usePushNotifications Hook (implement stub)

```typescript
// libs/frontend/notifications/src/hooks/use-push-notifications.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { createNotificationApi } from '../lib/notification-api';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

interface UsePushNotificationsConfig {
  baseUrl: string;
  getToken: () => string | null;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  onForegroundMessage?: (payload: any) => void;
}

export function usePushNotifications(config: UsePushNotificationsConfig) {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const requestPermission = useCallback(async () => {
    if (!isSupported) return;

    const perm = await Notification.requestPermission();
    setPermission(perm);

    if (perm !== 'granted') return;

    // Initialize Firebase app (idempotent)
    const app = getApps().length === 0
      ? initializeApp(config.firebaseConfig)
      : getApps()[0];

    const messaging = getMessaging(app);

    // Register SW
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    // Get FCM token
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    // Store token on server
    const api = createNotificationApi(config.baseUrl, config.getToken);
    await api.registerPushToken({
      token: fcmToken,
      platform: 'WEB',
      userAgent: navigator.userAgent,
    });

    setIsRegistered(true);

    // Foreground message handler
    onMessage(messaging, (payload) => {
      config.onForegroundMessage?.(payload);
    });
  }, [isSupported, config]);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
    setPermission(
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'default'
    );
  }, []);

  return { isSupported, isRegistered, permission, requestPermission };
}
```

---

## Required Icon Files

Create placeholder icons in each dashboard's `public/` (these are referenced in SW):
- `public/icon-192.png` — 192x192 app icon
- `public/badge-72.png` — 72x72 monochrome badge icon

If icons already exist with different names, update the SW file to use those names.

---

## Acceptance Criteria

- [ ] `FcmService.sendMulticast()` sends real FCM push messages (not stub)
- [ ] Firebase Admin initialized from env var (not hardcoded credentials)
- [ ] `FcmService` logs warning (not error) when Firebase not configured (graceful degradation)
- [ ] Invalid FCM tokens don't crash the service (error caught, logged)
- [ ] `firebase-messaging-sw.js` exists in BOTH dashboard `public/` directories
- [ ] SW shows native browser notification with title, body, and icon when app is backgrounded
- [ ] Clicking background notification navigates to `notification.url`
- [ ] `usePushNotifications.requestPermission()` requests browser permission then registers token
- [ ] FCM token stored via `POST /api/notifications/push-tokens`
- [ ] Foreground messages handled via `onMessage` (not shown as native notification — handled by Socket.io toast)
- [ ] `isSupported: false` returned on browsers/environments without Notification API

## Failure Criteria (reject if any)

- Firebase credentials hardcoded in source (must be env vars)
- SW file not registered (background notifications won't work)
- `allowBase64` used for image (unrelated but wrong)
- FCM errors crash the notification queue job (must be try/catch, non-fatal)
- Token registration happens without user permission (must wait for `requestPermission` call)

## Testing

```
1. Open browser → permissions prompt appears
2. Allow notifications
3. FCM token registered via POST /api/notifications/push-tokens
4. Minimize/close the tab
5. Trigger notification from backend (POST /api/notifications/internal)
6. Native browser notification appears
7. Click notification → correct URL opens
8. With tab open: socket delivers notification (no duplicate native notification)
```
