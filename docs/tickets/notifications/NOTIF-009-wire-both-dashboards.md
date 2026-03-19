# NOTIF-009 — Wire Notifications into Both Dashboards

## Overview
Integrate the shared notification components into `sales-dashboard` and `pm-dashboard` layouts.
Also remove the old `pm-dashboard` notification hook (replaced by shared lib).

## Prerequisites
- NOTIF-008 completed (NotificationBell, NotificationProvider exported)
- NOTIF-007 completed (hooks working)

## Scope

**Files to modify:**
```
apps/frontend/sales-dashboard/src/app/dashboard/layout.tsx
apps/frontend/pm-dashboard/src/app/dashboard/layout.tsx
```

**Files to delete:**
```
apps/frontend/pm-dashboard/src/hooks/use-notifications.ts  ← replaced by shared lib
```

**Files to verify (do NOT delete yet — check if anything else imports them):**
```
apps/frontend/pm-dashboard/src/components/notifications/   ← if exists, check and remove
```

---

## Implementation

### 1. Both Dashboard Layouts

The layout must:
1. Wrap content in `NotificationProvider` with correct config
2. Add `NotificationBell` to the header/topbar
3. Wire `useNotificationSocket` at layout level (not inside panel) so notifications arrive even when panel is closed

**Look at the current layout structure first** (`layout.tsx` in each dashboard) before modifying. Do NOT break existing layout structure.

```tsx
// Pattern to add in BOTH dashboard layouts:
import { NotificationBell, NotificationProvider } from '@sentra-core/notifications';

// Inside the layout component, wrap with provider:
// Find where CORE_SERVICE_URL is configured (check existing env usage in api.ts)
// Use same env var pattern

const CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';

// In JSX, wrap the existing layout content:
<NotificationProvider
  baseUrl={CORE_API_URL}
  socketServerUrl={CORE_API_URL}
  getToken={() => {
    // Use the same token retrieval as api.ts in each dashboard
    // Check how api.ts gets the auth token (localStorage, cookie, auth store)
    // Replicate the EXACT same pattern here
  }}
>
  {/* existing layout content */}
</NotificationProvider>
```

**For `getToken`:** Look at how `use-comm-socket.ts` in each dashboard gets the JWT token. Use the exact same method. Do NOT invent a new way.

### 2. Add NotificationBell to Header

Find the topbar/header component in each dashboard layout. Add `<NotificationBell />` next to existing header icons (like user avatar, settings, etc.).

### 3. Socket Connection at Layout Level

Add `useNotificationSocket` at layout level with `onNewNotification` callback for toast:

```tsx
// In layout.tsx (inside NotificationProvider, in a child component or layout body):
import { useNotificationSocket } from '@sentra-core/notifications';
import { useToast } from '@/hooks/use-toast';  // existing toast system

function NotificationSocketWatcher() {
  const { baseUrl, getToken, socketServerUrl } = useNotificationContext();
  const toast = useToast();

  useNotificationSocket({
    serverUrl: socketServerUrl,
    getToken,
    enabled: true,
    onNewNotification: (notification) => {
      toast.info(notification.title, { description: notification.body });
    },
  });

  return null;
}
// Render <NotificationSocketWatcher /> inside NotificationProvider in layout
```

**NOTE:** Check if `useToast()` supports `.info()` or uses different method names. Check `hooks/use-toast.ts` in each dashboard and use the correct method name.

### 4. Remove old PM notification code

After wiring the shared lib:
1. Check `apps/frontend/pm-dashboard/src/hooks/use-notifications.ts` — if it's only used in notification-specific components, delete it
2. Check `apps/frontend/pm-dashboard/src/app/dashboard/*/` for any notification pages using the old hook
3. Update those pages to use the shared `useNotifications` from `@sentra-core/notifications`
4. If old notification page exists in PM dashboard, keep it but update the hook import

---

## Environment Variables Required

Add to `.env.local` in both dashboards (if not already present):
```
NEXT_PUBLIC_CORE_API_URL=http://localhost:3001
```

Check if this env var already exists with a different name. If it does, use the existing name.

---

## Acceptance Criteria

- [ ] `NotificationProvider` wraps dashboard layout in both `sales-dashboard` and `pm-dashboard`
- [ ] `NotificationBell` appears in header of both dashboards
- [ ] Bell shows correct unread count on page load
- [ ] `NotificationSocketWatcher` renders inside provider (real-time updates work)
- [ ] Toast appears when new notification arrives (without opening panel)
- [ ] Old `use-notifications.ts` in pm-dashboard removed OR updated to re-export from shared lib
- [ ] No TypeScript errors in either dashboard after changes
- [ ] Both dashboards build without errors (`npx nx build sales-dashboard`, `npx nx build pm-dashboard`)
- [ ] `getToken` uses SAME pattern as existing socket hooks in each dashboard

## Failure Criteria (reject if any)

- Different `getToken` logic than existing socket hooks (causes auth inconsistency)
- `NotificationProvider` not wrapping layout (hooks will throw context error)
- Bell not visible in header
- `NotificationSocketWatcher` rendered OUTSIDE `NotificationProvider`
- Old pm-dashboard notification hook left AND new shared hook also added (duplicate queries)

## Testing

```
1. Open sales-dashboard — bell visible in header
2. Open pm-dashboard — bell visible in header
3. Via API: POST /api/notifications/internal with recipientId = logged-in user
4. Both dashboards should show toast + bell count increase WITHOUT page refresh
5. Click bell → panel opens, notification visible
6. Click notification → navigates to notification.url
7. No console errors on either dashboard
```
