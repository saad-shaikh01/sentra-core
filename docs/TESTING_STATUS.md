# Testing Status

**Last Updated:** February 06, 2026
**E2E Status:** ✅ 5/5 Passing
**Framework:** Playwright (Chromium)

---

## Overview

End-to-end tests verify the critical user flows across the full stack (Next.js frontend + NestJS backend + PostgreSQL). Tests were introduced after the Phase 3 frontend refactor (TanStack Query + Zustand) to ensure no regressions.

---

## Test Infrastructure

### Framework & Config

| Setting | Value |
|---------|-------|
| **Framework** | Playwright |
| **Browser** | Chromium (headless) |
| **Frontend URL** | `http://localhost:4200` |
| **Backend URL** | `http://localhost:3001/api` |
| **Config File** | `apps/frontend/sales-dashboard/playwright.config.ts` |
| **Test Directory** | `apps/frontend/sales-dashboard/tests/` |
| **Parallelism** | Sequential (1 worker, serial mode) |
| **Timeout** | 30s per test |
| **Retries** | 0 locally, 2 in CI |
| **Screenshots** | On failure only |
| **Traces** | On first retry |

### Why Sequential?

Tests run in serial mode because they share a dependency chain: signup creates the user that login, profile, and team tests rely on. Each test run generates unique credentials via `Date.now()` to avoid conflicts.

---

## Prerequisites

Before running tests, ensure:

1. **PostgreSQL** is running:
   ```bash
   docker-compose up -d postgres
   ```

2. **Backend (core-service)** is running:
   ```bash
   npx nx serve core-service
   ```

3. **Environment** is configured:
   ```
   # apps/frontend/sales-dashboard/.env.local
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```

4. **Browser dependencies** are installed:
   ```bash
   npx playwright install chromium
   npx playwright install-deps chromium
   ```

---

## Running Tests

```bash
# Run all E2E tests (starts frontend automatically via webServer config)
cd apps/frontend/sales-dashboard
npx playwright test

# Run with visible browser
npx playwright test --headed

# Run a specific test by name
npx playwright test -g "Signup Flow"

# View HTML report after run
npx playwright show-report
```

---

## Test Suite: Critical Flow

**File:** `apps/frontend/sales-dashboard/tests/critical-flow.spec.ts`

### Test Results

| # | Test Name | What It Verifies | Status |
|---|-----------|-----------------|--------|
| 1 | **Signup Flow** | Visit `/auth/signup`, fill all fields (name, email, org, password, confirm), submit, verify redirect to `/dashboard`, verify user name rendered | ✅ Pass |
| 2 | **Logout Flow** | Login, click sidebar logout button (`button[title="Logout"]`), verify redirect to `/auth/login` | ✅ Pass |
| 3 | **Login Flow** | Visit `/auth/login`, fill email + password, submit, verify redirect to `/dashboard`, verify `<h1>Dashboard</h1>` heading rendered | ✅ Pass |
| 4 | **Profile Verification** | Login, navigate to `/dashboard/settings/profile`, verify user name and email displayed (validates `useUser` React Query hook) | ✅ Pass |
| 5 | **Team Page** | Login, navigate to `/dashboard/settings/team`, verify member name and `OWNER` role badge displayed (validates `useMembers` React Query hook) | ✅ Pass |

### What Each Test Validates

| Test | Frontend Hook | Backend Endpoint | State Layer |
|------|--------------|-----------------|-------------|
| Signup | `useSignup()` | `POST /api/auth/signup` | TanStack Query mutation |
| Logout | `useLogout()` | `POST /api/auth/logout` | TanStack Query mutation + localStorage clear |
| Login | `useLogin()` | `POST /api/auth/login` | TanStack Query mutation |
| Profile | `useUser()` | `GET /api/users/me` | TanStack Query query |
| Team | `useMembers()` | `GET /api/organization/members` | TanStack Query query |

---

## Bugs Found & Fixed During Testing

### 1. Dashboard page using deprecated auth context

**File:** `src/app/dashboard/page.tsx`
**Error:** `useAuth must be used within an AuthProvider`
**Cause:** The dashboard page was still importing `useAuth` from the old React Context (`@/contexts/auth-context`) instead of the new React Query hook (`@/hooks/use-auth`).

```diff
- import { useAuth } from '@/contexts/auth-context';
+ import { useAuth } from '@/hooks/use-auth';
```

**Impact:** Dashboard page crashed on load after signup/login redirect.

### 2. API URL defaulting to Codespaces URL

**File:** `src/lib/api.ts`
**Error:** `Failed to fetch` on all API calls
**Cause:** The fallback `API_BASE_URL` pointed to a GitHub Codespaces hostname, which is unreachable from the local Playwright browser.

**Fix:** Created `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3001/api`.

---

## Test Data Strategy

Each test run generates unique data to avoid conflicts with previous runs:

```typescript
const testId = Date.now();
const testUser = {
  email: `e2e-test-${testId}@example.com`,
  password: 'TestPassword123!',
  name: `E2E Test User ${testId}`,
  organizationName: `E2E Test Org ${testId}`,
};
```

**Note:** Test users accumulate in the database. For a clean test environment, reset the database:
```bash
npx prisma migrate reset --schema=libs/backend/prisma-client/prisma/schema.prisma
```

---

## Coverage Gaps

### Not Yet Covered by E2E Tests

| Area | Description | Priority |
|------|-------------|----------|
| Profile update | Edit name/bio/phone and save | Medium |
| Role change | OWNER changes member role via dropdown | Medium |
| Invite flow | Send invitation, accept via token URL | High |
| Remove member | OWNER removes a team member | Low |
| Cancel invitation | Cancel a pending invite | Low |
| Theme toggle | Switch dark/light mode, verify persistence | Low |
| Token refresh | Access token expires, automatic refresh | Medium |
| Protected routes | Unauthenticated user redirected from `/dashboard` | Medium |
| Error states | Invalid credentials, network errors | Medium |

### Not Testable via E2E

| Area | Reason | Alternative |
|------|--------|-------------|
| SSR rendering | Playwright tests client-side only | Unit tests with `@testing-library/react` |
| Zustand store isolation | State resets per test (new page) | Unit tests with Zustand |
| Query cache behavior | Internal React Query state | Unit tests with `QueryClientProvider` |
| Framer Motion animations | Visual, not functional | Visual regression tests |

---

## CI Integration (Future)

To run in CI, add to your pipeline:

```yaml
- name: E2E Tests
  run: |
    docker-compose up -d postgres
    npx prisma migrate deploy --schema=libs/backend/prisma-client/prisma/schema.prisma
    npx nx serve core-service &
    sleep 15
    cd apps/frontend/sales-dashboard
    npx playwright install --with-deps chromium
    CI=true npx playwright test
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sentra
    NEXT_PUBLIC_API_URL: http://localhost:3001/api
```

---

## File Reference

```
apps/frontend/sales-dashboard/
├── playwright.config.ts              # Playwright configuration
├── tests/
│   └── critical-flow.spec.ts         # Critical path E2E tests
├── test-results/                     # Screenshots on failure (gitignored)
└── .env.local                        # API URL for local testing
```
