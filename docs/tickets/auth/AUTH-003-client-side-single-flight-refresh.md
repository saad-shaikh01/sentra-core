# AUTH-003: Client-Side Single-Flight Refresh (Sales Dashboard + PM Dashboard)

## Overview
Implement a refresh mutex on both frontend dashboards so that only one `/auth/refresh` HTTP request runs at a time per browser tab. All other requests that hit a 401 while a refresh is in progress must wait for the same promise — not fire their own refresh requests simultaneously.

## Background / Context
Both `sales-dashboard/src/lib/api.ts` and `pm-dashboard/src/lib/api.ts` have Axios interceptors that call `/auth/refresh` on 401. The problem: if 5 API calls are in-flight and the access token expires, all 5 interceptors independently call `/auth/refresh` using the same old refresh token. Only one succeeds; the other 4 get 401 and `clearTokens()` is called — logging the user out. This is the "random logout" bug around the 15-minute access token boundary.

## Acceptance Criteria
- [ ] At most one `/auth/refresh` request is in-flight at any time per browser tab
- [ ] Concurrent 401 responses queue up and wait for the single refresh to complete
- [ ] On successful refresh, all queued requests are retried with the new access token
- [ ] On failed refresh, all queued requests are rejected and user is redirected to login once (not multiple alert/redirects)
- [ ] Solution implemented in both `sales-dashboard` and `pm-dashboard` API clients
- [ ] No changes to the backend required for this ticket
- [ ] Works correctly when refreshing multiple tabs independently (each tab has its own mutex — tabs do not coordinate, each tab manages its own token state)

## Technical Specification

### Refresh Mutex Implementation

Create a shared utility (copy into both apps, or put in a shared lib if one exists):

```typescript
// apps/frontend/sales-dashboard/src/lib/refresh-mutex.ts
// (copy identical file to pm-dashboard)

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  pendingQueue = [];
}

export { isRefreshing, pendingQueue, processQueue };
export function setRefreshing(value: boolean) {
  isRefreshing = value;
}
```

### Updated Axios Response Interceptor

```typescript
// apps/frontend/sales-dashboard/src/lib/api.ts
// Replace existing 401 interceptor with this:

import axios, { AxiosInstance } from 'axios';
import { isRefreshing, setRefreshing, pendingQueue, processQueue } from './refresh-mutex';

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401, and only if this is not already a retry
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't retry the refresh endpoint itself
    if (originalRequest.url?.includes('/auth/refresh')) {
      clearTokens();
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    // If refresh already in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers['Authorization'] = `Bearer ${token}`;
        originalRequest._retry = true;
        return api(originalRequest);
      }).catch((err) => {
        return Promise.reject(err);
      });
    }

    // Start refresh — set mutex
    originalRequest._retry = true;
    setRefreshing(true);

    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) throw new Error('No refresh token');

      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        refreshToken
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data.data;

      // Store new tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefreshToken);

      // Update default header
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      // Resolve all queued requests with new token
      processQueue(null, accessToken);

      // Retry original request
      originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Refresh failed — reject all queued requests and clear auth
      processQueue(refreshError, null);
      clearTokens();
      window.location.href = '/auth/login';
      return Promise.reject(refreshError);
    } finally {
      setRefreshing(false);
    }
  }
);
```

### Token Storage Helper (ensure consistency)
```typescript
// apps/frontend/sales-dashboard/src/lib/tokens.ts

export function getTokens() {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  delete api.defaults.headers.common['Authorization'];
}
```

### Request Setup (attach token to every request)
```typescript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});
```

## Files to Modify
- `apps/frontend/sales-dashboard/src/lib/api.ts` — replace 401 interceptor
- `apps/frontend/pm-dashboard/src/lib/api.ts` — same change
- Create `apps/frontend/sales-dashboard/src/lib/refresh-mutex.ts`
- Create `apps/frontend/pm-dashboard/src/lib/refresh-mutex.ts`
- Create `apps/frontend/sales-dashboard/src/lib/tokens.ts`
- Create `apps/frontend/pm-dashboard/src/lib/tokens.ts`

## Testing Requirements

### Manual Test Scenarios
**Scenario 1: Multiple simultaneous 401s**
1. Set access token TTL to 5 seconds (temp for testing)
2. Navigate to a page that makes 5 API calls on mount
3. Wait for token to expire
4. Verify: exactly ONE `/auth/refresh` call in Network tab
5. Verify: all 5 original requests are retried after refresh
6. Verify: user is NOT logged out

**Scenario 2: Refresh fails**
1. Expire access token, also expire/corrupt refresh token
2. Trigger any API call
3. Verify: ONE /auth/refresh attempt (not 5)
4. Verify: single redirect to /auth/login (not multiple)
5. Verify: no console errors about "cannot set headers after sent"

**Scenario 3: Refresh endpoint itself returns 401**
1. Call /auth/refresh with invalid token
2. Verify: interceptor does NOT retry /auth/refresh again (infinite loop prevention)
3. Verify: clearTokens() called, redirect to login

### Unit Tests
- Queue accumulates requests when `isRefreshing = true`
- `processQueue(null, token)` resolves all queued promises with the token
- `processQueue(error, null)` rejects all queued promises
- Queue is emptied after `processQueue` is called

### Edge Cases
- Refresh succeeds but new token is empty string → treat as failure
- `localStorage` is unavailable (private mode edge case) → graceful fallback
- User manually calls logout while refresh is in-flight → logout wins, redirect to login
