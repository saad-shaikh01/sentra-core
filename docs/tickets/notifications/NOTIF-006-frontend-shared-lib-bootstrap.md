# NOTIF-006 — Frontend Shared Lib Bootstrap

## Overview
Create an Nx shared frontend library `libs/frontend/notifications` that exports
all notification-related hooks, components, and types. Both `sales-dashboard` and
`pm-dashboard` will import from this library instead of having their own notification code.

This ticket only does the **scaffold + types + API client** — no components yet (those are NOTIF-007, NOTIF-008).

## Prerequisites
- NOTIF-001 completed (to know the exact TypeScript types)
- Can start in parallel with NOTIF-002

## Scope
**Files to create:**
```
libs/frontend/notifications/
├── project.json                    ← Nx project config
├── tsconfig.json
├── tsconfig.lib.json
├── src/
│   ├── index.ts                    ← barrel exports
│   ├── types.ts                    ← TypeScript interfaces
│   └── lib/
│       └── notification-api.ts     ← API client functions
```
**Files to modify:**
- `tsconfig.base.json` (root) — add path alias `@sentra-core/notifications`

---

## Implementation Details

### Check Existing Nx Lib Structure First

Before creating files, look at an existing frontend lib:
- `libs/frontend/ui/` — check its `project.json`, `tsconfig.json`, `tsconfig.lib.json` structure
- Replicate the exact same Nx configuration for the new lib

The lib name in Nx should be `frontend-notifications` (kebab-case).

### src/types.ts

```typescript
// All TypeScript interfaces matching the Prisma GlobalNotification model

export type GlobalNotificationType =
  | 'SALE_STATUS_CHANGED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'INVOICE_OVERDUE'
  | 'CHARGEBACK_FILED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE_SOON'
  | 'COMMENT_ADDED'
  | 'PROJECT_STATUS_CHANGED'
  | 'APPROVAL_REQUESTED'
  | 'MENTION'
  | 'SYSTEM_ALERT';

export type AppModule = 'SALES' | 'PM' | 'HRMS' | 'COMM' | 'SYSTEM';

export type PushPlatform = 'WEB' | 'ANDROID' | 'IOS';

export interface GlobalNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  actorId: string | null;
  type: GlobalNotificationType;
  module: AppModule;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  url: string | null;
  isMention: boolean;
  mentionContext: string | null;
  isRead: boolean;
  readAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  data: GlobalNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface NotificationQueryParams {
  isRead?: 'true' | 'false';
  module?: AppModule;
  page?: number;
  limit?: number;
}

export interface RegisterPushTokenPayload {
  token: string;
  platform: PushPlatform;
  userAgent?: string;
}

// Socket.io events
export interface NotificationNewEvent {
  // Same shape as GlobalNotification
  id: string;
  type: GlobalNotificationType;
  module: AppModule;
  title: string;
  body: string;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationCountEvent {
  count: number;
}
```

### src/lib/notification-api.ts

```typescript
// Typed API functions for notifications
// Uses the same `api` client pattern as the rest of the frontend
// Look at apps/frontend/sales-dashboard/src/lib/api.ts to understand the ApiClient pattern
// Import or replicate the same base URL/fetch pattern

import type {
  GlobalNotification,
  NotificationListResponse,
  NotificationQueryParams,
  RegisterPushTokenPayload,
} from '../types';

// DO NOT import from a specific dashboard's api.ts
// Instead, accept a fetcher function or base URL as parameter
// so this lib works with both dashboards

export function createNotificationApi(baseUrl: string, getToken: () => string | null) {
  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  });

  return {
    async list(params: NotificationQueryParams): Promise<NotificationListResponse> {
      const query = new URLSearchParams();
      if (params.isRead !== undefined) query.set('isRead', params.isRead);
      if (params.module) query.set('module', params.module);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));

      const res = await fetch(`${baseUrl}/api/notifications?${query}`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },

    async markRead(id: string): Promise<GlobalNotification> {
      const res = await fetch(`${baseUrl}/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to mark notification as read');
      return res.json();
    },

    async markAllRead(): Promise<{ success: boolean }> {
      const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to mark all notifications as read');
      return res.json();
    },

    async registerPushToken(payload: RegisterPushTokenPayload): Promise<void> {
      const res = await fetch(`${baseUrl}/api/notifications/push-tokens`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to register push token');
    },

    async unregisterPushToken(token: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/notifications/push-tokens/${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to unregister push token');
    },
  };
}
```

### src/index.ts

```typescript
// Types
export * from './types';

// API
export { createNotificationApi } from './lib/notification-api';

// Hooks — exported after NOTIF-007
// export * from './hooks/use-notifications';
// export * from './hooks/use-notification-socket';
// export * from './hooks/use-push-notifications';

// Components — exported after NOTIF-008
// export { NotificationBell } from './components/NotificationBell';
// export { NotificationPanel } from './components/NotificationPanel';
```

(Commented exports will be uncommented as subsequent tickets are completed)

### tsconfig.base.json path alias

Find the `paths` section in root `tsconfig.base.json` and add:
```json
"@sentra-core/notifications": ["libs/frontend/notifications/src/index.ts"]
```

---

## Acceptance Criteria

- [ ] Nx project at `libs/frontend/notifications` exists with valid `project.json`
- [ ] Path alias `@sentra-core/notifications` resolves to `libs/frontend/notifications/src/index.ts`
- [ ] All TypeScript interfaces in `types.ts` match Prisma `GlobalNotification` model fields exactly
- [ ] `GlobalNotificationType` union includes all 12 values from NOTIF-001 enum
- [ ] `createNotificationApi()` factory function exported and has all 5 methods
- [ ] No imports from dashboard-specific code (lib must be dashboard-agnostic)
- [ ] `src/index.ts` barrel export exists

## Failure Criteria (reject if any)

- Lib imports from `apps/frontend/sales-dashboard/` or `apps/frontend/pm-dashboard/`
- TypeScript types don't match schema (different field names, wrong types)
- Path alias not added to `tsconfig.base.json`
- API functions use hardcoded `localhost:3001` instead of accepting `baseUrl`

## Testing

```typescript
// In either dashboard, try:
import { GlobalNotification, createNotificationApi } from '@sentra-core/notifications';
// Should resolve without TypeScript errors

// Verify types align with backend:
const n: GlobalNotification = {
  id: 'test',
  organizationId: 'org-1',
  recipientId: 'user-1',
  actorId: null,
  type: 'MENTION',
  module: 'SALES',
  title: 'Test',
  body: 'Test body',
  entityType: null,
  entityId: null,
  url: null,
  isMention: true,
  mentionContext: null,
  isRead: false,
  readAt: null,
  data: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
// Should compile without errors
```
