# HRMS-001 — Sidebar "No sections available" Flash on Login

## Problem

On initial page load / login, the sidebar briefly (or permanently) shows
`"No sections available."` instead of the navigation links.

## Root Cause

`PermissionsProvider` drives sidebar visibility via `isLoading: query.isLoading`.
In React Query, `query.isLoading` is only `true` while the query is **actively
fetching AND has no data**. On the very first server-side render (Next.js App
Router), `getTokens()` cannot read `localStorage`, so `accessToken = null` →
`enabled = false` → `isLoading = false`. The client hydrates with
`isLoading = false` and an empty permissions set. There is a brief window (one
React paint) before React Query starts its first fetch where the sidebar sees:

```
isLoading = false
visibleItems = []   ← all nav items filtered out (no permissions yet)
```

…and renders `"No sections available."` before the permissions API call resolves.

## Files to Change

| File | Change |
|------|--------|
| `apps/frontend/hrms-dashboard/src/providers/permissions-provider.tsx` | Fix `isLoading` to stay `true` until permissions are confirmed |

## Implementation

In `PermissionsProvider`, change:

```ts
isLoading: query.isLoading,
```

to:

```ts
isLoading: !!accessToken && !query.data,
```

This keeps `isLoading = true` for as long as there is a token but no permissions
data yet, which covers the hydration race window. Once the query resolves (with
data OR error), `isLoading` becomes `false` and the sidebar renders correctly.

If the query errors, `query.data` stays `undefined` → sidebar stays in loading
state forever. To handle that edge case, also cover the error state:

```ts
isLoading: !!accessToken && query.isPending && !query.isError,
```

## Acceptance Criteria

- [ ] Hard-refresh on `/dashboard/employees` — sidebar shows nav links immediately, never flashes "No sections available."
- [ ] Login flow — same as above.
- [ ] User with NO permissions (hypothetical) still sees "No sections available." after permissions load (not during loading).
- [ ] `npx tsc --noEmit` passes in `apps/frontend/hrms-dashboard`.
