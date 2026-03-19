# NOTIF-008 — NotificationBell + Panel UI Components

## Overview
Build the notification UI components in `libs/frontend/notifications/src/components/`:
- `NotificationBell` — bell icon with unread badge, click opens panel
- `NotificationPanel` — dropdown panel with notification list
- `NotificationItem` — single notification row (icon + title + time + link)

These components must work identically in both dashboards without any dashboard-specific code.

## Prerequisites
- NOTIF-007 completed (hooks available)
- NOTIF-006 completed (types available)

## Scope
**Files to create:**
```
libs/frontend/notifications/src/components/
├── NotificationBell.tsx
├── NotificationPanel.tsx
└── NotificationItem.tsx
```
**Files to create:**
```
libs/frontend/notifications/src/context/
└── notification-context.tsx   ← React context to provide baseUrl + getToken
```

---

## Design Requirements

**Visual style must match existing app:**
- Glassmorphism: `bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl`
- Dark theme (same as rest of the dashboards)
- Bell icon: use `lucide-react` `Bell` icon (already installed)
- Unread badge: red dot/count on bell (hide if 0)
- Panel: fixed-height scrollable list, Radix UI `Popover` for positioning
- Empty state: same pattern as existing `EmptyState` component
- Loading: same skeleton/spinner pattern as existing pages

---

## NotificationContext (Required for shared hooks)

Since hooks need `baseUrl` and `getToken`, create a context so components don't need props drilling:

```typescript
// notification-context.tsx
'use client';

import React, { createContext, useContext } from 'react';

interface NotificationContextValue {
  baseUrl: string;
  getToken: () => string | null;
  socketServerUrl: string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({
  children,
  baseUrl,
  getToken,
  socketServerUrl,
}: NotificationContextValue & { children: React.ReactNode }) {
  return (
    <NotificationContext.Provider value={{ baseUrl, getToken, socketServerUrl }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotificationContext must be used within NotificationProvider');
  return ctx;
}
```

---

## NotificationBell.tsx

```typescript
'use client';

import { Bell } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useNotifications } from '../hooks/use-notifications';
import { useNotificationContext } from '../context/notification-context';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const { baseUrl, getToken } = useNotificationContext();
  const { data } = useNotifications({
    baseUrl,
    getToken,
    params: { isRead: 'false', limit: 1 },  // just to get unreadCount
  });

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="w-5 h-5 text-white/70" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-96 rounded-2xl bg-[#0f1117] border border-white/10 shadow-2xl"
        >
          <NotificationPanel />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

---

## NotificationPanel.tsx

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useNotifications, useMarkAllNotificationsRead } from '../hooks/use-notifications';
import { useNotificationContext } from '../context/notification-context';
import { useNotificationSocket } from '../hooks/use-notification-socket';
import { NotificationItem } from './NotificationItem';
import type { GlobalNotification } from '../types';

export function NotificationPanel() {
  const router = useRouter();
  const { baseUrl, getToken, socketServerUrl } = useNotificationContext();

  const { data, isLoading, isError } = useNotifications({
    baseUrl,
    getToken,
    params: { limit: 20 },
  });

  const markAllRead = useMarkAllNotificationsRead({ baseUrl, getToken });

  // Connect socket for real-time updates while panel is mounted
  useNotificationSocket({
    serverUrl: socketServerUrl,
    getToken,
    enabled: true,
  });

  const handleItemClick = (notification: GlobalNotification) => {
    if (notification.url) {
      router.push(notification.url);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Notifications</h3>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-[420px]">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            {/* Use same loading spinner as rest of app */}
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-8 text-sm text-white/40">
            Failed to load notifications
          </div>
        )}

        {!isLoading && !isError && (!data?.data || data.data.length === 0) && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Bell className="w-8 h-8 text-white/20" />
            <p className="text-sm text-white/40">No notifications yet</p>
          </div>
        )}

        {data?.data?.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            baseUrl={baseUrl}
            getToken={getToken}
            onClick={() => handleItemClick(notification)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## NotificationItem.tsx

```typescript
'use client';

import {
  Bell, DollarSign, AlertCircle, CheckCircle,
  MessageSquare, User, AtSign, Info
} from 'lucide-react';
import { useMarkNotificationRead } from '../hooks/use-notifications';
import type { GlobalNotification, GlobalNotificationType } from '../types';

const TYPE_ICONS: Record<GlobalNotificationType, React.ComponentType<{ className?: string }>> = {
  SALE_STATUS_CHANGED: DollarSign,
  PAYMENT_RECEIVED: CheckCircle,
  PAYMENT_FAILED: AlertCircle,
  INVOICE_OVERDUE: AlertCircle,
  CHARGEBACK_FILED: AlertCircle,
  TASK_ASSIGNED: User,
  TASK_DUE_SOON: AlertCircle,
  COMMENT_ADDED: MessageSquare,
  PROJECT_STATUS_CHANGED: Info,
  APPROVAL_REQUESTED: CheckCircle,
  MENTION: AtSign,
  SYSTEM_ALERT: Bell,
};

interface NotificationItemProps {
  notification: GlobalNotification;
  baseUrl: string;
  getToken: () => string | null;
  onClick: () => void;
}

export function NotificationItem({ notification, baseUrl, getToken, onClick }: NotificationItemProps) {
  const markRead = useMarkNotificationRead({ baseUrl, getToken });
  const Icon = TYPE_ICONS[notification.type] ?? Bell;

  const handleClick = () => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors border-b border-white/[0.05] last:border-0 ${
        !notification.isRead ? 'bg-white/[0.02]' : ''
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 ${
        !notification.isRead ? 'bg-blue-500/20' : 'bg-white/[0.06]'
      }`}>
        <Icon className={`w-3.5 h-3.5 ${!notification.isRead ? 'text-blue-400' : 'text-white/40'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.isRead ? 'text-white' : 'text-white/60'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-white/30 mt-1">{timeAgo(notification.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
      )}
    </button>
  );
}

function timeAgo(dateStr: string): string {
  // Import from the dashboard's lib/format-date.ts via shared types
  // OR copy the timeAgo function here (it's small and standalone)
  // Check libs/ for a shared format-date utility — if exists, import from there
  // If not, implement inline:
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
```

---

### Update index.ts

```typescript
// Add to libs/frontend/notifications/src/index.ts:
export { NotificationBell } from './components/NotificationBell';
export { NotificationPanel } from './components/NotificationPanel';
export { NotificationItem } from './components/NotificationItem';
export { NotificationProvider, useNotificationContext } from './context/notification-context';
```

---

## Acceptance Criteria

- [ ] `NotificationBell` shows unread count badge (hidden when 0, shows number when > 0)
- [ ] Unread count > 99 shows "99+" not "100"
- [ ] Clicking bell opens `Radix Popover` panel (not a custom dropdown)
- [ ] Panel has max-height with scroll (notifications don't push page content down)
- [ ] "Mark all read" button visible only when `unreadCount > 0`
- [ ] `NotificationItem` marks notification as read on click
- [ ] `NotificationItem` navigates to `notification.url` on click (if url exists)
- [ ] Unread notifications have visual distinction (blue dot + slightly brighter text)
- [ ] Each notification type has a distinct icon (all 12 types covered in TYPE_ICONS)
- [ ] Empty state shown when no notifications
- [ ] Loading state shown while fetching
- [ ] Error state shown on fetch failure
- [ ] `NotificationProvider` exports `baseUrl`, `getToken`, `socketServerUrl` via context
- [ ] No hardcoded colors that break dark theme

## Failure Criteria (reject if any)

- Custom dropdown instead of Radix Popover (z-index issues)
- `NotificationItem` navigates but doesn't mark as read
- Unread count doesn't update in real-time after marking read (socket update)
- `timeAgo` not implemented (shows raw ISO string)
- Missing items in `TYPE_ICONS` (TypeScript should catch this — Record with all enum values)

## Testing

```
Manual test checklist:
1. Bell shows correct unread count
2. Clicking notification with url → navigates to correct page
3. Notification marked as read → unread dot disappears, bell count decreases
4. "Mark all read" → all dots disappear, bell count goes to 0
5. New notification arrives via socket → bell count increases without page refresh
6. Scroll works when > 5 notifications
7. Empty state shows when no notifications
```
