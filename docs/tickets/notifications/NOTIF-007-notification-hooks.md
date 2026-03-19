# NOTIF-007 — Notification Hooks (TanStack Query + Socket.io)

## Overview
Implement three React hooks in `libs/frontend/notifications/src/hooks/`:
1. `use-notifications.ts` — TanStack Query for list/mark-read/mark-all-read
2. `use-notification-socket.ts` — Socket.io connection to `/notifications` namespace
3. `use-push-notifications.ts` — FCM token registration (stub for now, NOTIF-012 fills it in)

These hooks are **shared** — same code used in both `sales-dashboard` and `pm-dashboard`.

## Prerequisites
- NOTIF-004 + NOTIF-005 completed (API + Socket gateway running)
- NOTIF-006 completed (lib structure + types exist)

## Scope
**Files to create:**
```
libs/frontend/notifications/src/hooks/
├── use-notifications.ts
├── use-notification-socket.ts
└── use-push-notifications.ts
```
**Update:**
- `libs/frontend/notifications/src/index.ts` — uncomment hook exports

---

## Implementation Details

### Hook Pattern Reference
Before writing, read:
- `apps/frontend/pm-dashboard/src/hooks/use-notifications.ts` — existing PM notification hook
- `apps/frontend/sales-dashboard/src/hooks/use-comm-socket.ts` — existing socket hook pattern
- `apps/frontend/pm-dashboard/src/hooks/use-comm-socket.ts` — same

Use the **exact same patterns** for query keys, `placeholderData`, and socket reconnect logic.

---

### use-notifications.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createNotificationApi } from '../lib/notification-api';
import type { NotificationQueryParams } from '../types';

// Query key factory — same pattern as rest of codebase
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: NotificationQueryParams) =>
    [...notificationKeys.lists(), params] as const,
};

// This hook needs baseUrl and getToken — accept via config object
// OR use a NotificationContext (see NOTIF-009 for how dashboards provide this)
interface UseNotificationsConfig {
  baseUrl: string;
  getToken: () => string | null;
  params?: NotificationQueryParams;
  enabled?: boolean;
}

export function useNotifications(config: UseNotificationsConfig) {
  const api = createNotificationApi(config.baseUrl, config.getToken);

  return useQuery({
    queryKey: notificationKeys.list(config.params ?? {}),
    queryFn: () => api.list(config.params ?? {}),
    placeholderData: (prev) => prev,   // v5 keepPreviousData equivalent
    enabled: config.enabled !== false,
    staleTime: 30_000,                 // 30 seconds
  });
}

export function useMarkNotificationRead(config: { baseUrl: string; getToken: () => string | null }) {
  const queryClient = useQueryClient();
  const api = createNotificationApi(config.baseUrl, config.getToken);

  return useMutation({
    mutationFn: (id: string) => api.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
}

export function useMarkAllNotificationsRead(config: { baseUrl: string; getToken: () => string | null }) {
  const queryClient = useQueryClient();
  const api = createNotificationApi(config.baseUrl, config.getToken);

  return useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
}
```

---

### use-notification-socket.ts

```typescript
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { notificationKeys } from './use-notifications';
import type { GlobalNotification, NotificationCountEvent } from '../types';

interface UseNotificationSocketConfig {
  serverUrl: string;        // e.g. "http://localhost:3001"
  getToken: () => string | null;
  enabled?: boolean;
  onNewNotification?: (notification: GlobalNotification) => void;
}

export function useNotificationSocket(config: UseNotificationSocketConfig) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (config.enabled === false) return;

    const token = config.getToken();
    if (!token) return;

    const socket = io(`${config.serverUrl}/notifications`, {
      path: '/socket.io-notifications/',
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    // New notification arrived
    socket.on('notification:new', (notification: GlobalNotification) => {
      // Invalidate list queries to refetch
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      // Call optional callback (for toast display in NOTIF-008)
      config.onNewNotification?.(notification);
    });

    // Unread count update
    socket.on('notification:count', ({ count }: NotificationCountEvent) => {
      // Update unread count in cached query data
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: any) => {
          if (!old) return old;
          return { ...old, unreadCount: count };
        },
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [config.enabled, config.serverUrl]);  // re-run only if server URL changes
  // NOTE: getToken must be stable (useCallback or from auth store) to avoid infinite re-renders

  return socketRef;
}
```

---

### use-push-notifications.ts (stub)

```typescript
// Stub — full implementation in NOTIF-012
// Exported now so dashboards can import it without breaking

export function usePushNotifications(_config: {
  baseUrl: string;
  getToken: () => string | null;
}) {
  // TODO: NOTIF-012 will implement FCM token registration here
  return { isSupported: false, isRegistered: false, requestPermission: async () => {} };
}
```

---

### Update index.ts

Uncomment hook exports in `libs/frontend/notifications/src/index.ts`:
```typescript
export * from './hooks/use-notifications';
export * from './hooks/use-notification-socket';
export * from './hooks/use-push-notifications';
```

---

## Acceptance Criteria

- [ ] `notificationKeys` factory exported with `all`, `lists()`, `list(params)` pattern
- [ ] `useNotifications()` uses `placeholderData: (prev) => prev` (NOT `keepPreviousData`)
- [ ] `useNotifications()` has `staleTime: 30_000`
- [ ] `useMarkNotificationRead()` invalidates `notificationKeys.lists()` on success
- [ ] `useMarkAllNotificationsRead()` invalidates `notificationKeys.lists()` on success
- [ ] `useNotificationSocket()` connects to `/notifications` namespace with path `/socket.io-notifications/`
- [ ] Socket reconnects automatically (reconnection: true, attempts: 10)
- [ ] `notification:new` event triggers query invalidation AND calls `onNewNotification` callback
- [ ] `notification:count` event updates unread count in query cache via `setQueriesData`
- [ ] Socket disconnects on component unmount (cleanup in useEffect return)
- [ ] `usePushNotifications()` stub exported (no errors when imported)
- [ ] All 3 hooks exported from `src/index.ts`

## Failure Criteria (reject if any)

- `keepPreviousData: true` used (deprecated v4 syntax — use `placeholderData`)
- Socket not disconnected on unmount (memory leak)
- `notification:new` only invalidates query but doesn't call `onNewNotification` callback
- Socket path wrong (different from NOTIF-005 gateway path)
- Hooks import from dashboard-specific files

## Testing

```typescript
// In sales-dashboard, test by temporarily adding to a page:
import { useNotifications, useNotificationSocket } from '@sentra-core/notifications';

// Should compile without errors
// useNotifications should return { data: NotificationListResponse, isLoading, isError }
// useNotificationSocket should connect to socket server

// Manual test: send a test notification via POST /api/notifications/internal
// The hook should receive 'notification:new' and update UI
```
