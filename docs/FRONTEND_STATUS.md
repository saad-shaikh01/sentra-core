# Frontend Status - Modern Stack & Premium UI

**Last Updated:** February 06, 2026
**Phase:** 3 (Modern Stack Refactor) - COMPLETE
**Build Status:** ✅ Passing
**E2E Tests:** ✅ 5/5 Passing (Playwright)

---

## Overview

The Sales Dashboard frontend (`apps/frontend/sales-dashboard`) has been fully refactored with:
- **Modern State Management**: TanStack Query v5 + Zustand
- **Premium UI**: Dark-mode-first design with Glassmorphism & Spotlight effects
- **Animations**: Framer Motion page transitions
- **Theming**: next-themes with Dark/Light toggle
- **E2E Testing**: Playwright test suite for critical flows

---

## Tech Stack Comparison

| Category | Phase 2 (Previous) | Phase 3 (Current) |
|----------|-------------------|-------------------|
| **Framework** | Next.js 16 (App Router) | Next.js 16 (App Router) |
| **State Management** | React Context API | TanStack Query v5 + Zustand |
| **Server State** | Manual fetch + useState | React Query with caching |
| **Client State** | Context/useState | Zustand stores |
| **URL State** | Manual parsing | Nuqs (type-safe adapter) |
| **Theming** | CSS variables only | next-themes (system aware) |
| **Animations** | CSS only | Framer Motion |
| **Styling** | Tailwind CSS v4 | Tailwind + Glassmorphism |
| **UI Components** | Basic Shadcn-style | Premium glass components |

---

## Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.x",
    "@tanstack/react-query-devtools": "^5.x",
    "zustand": "^5.x",
    "nuqs": "^2.x",
    "next-themes": "^0.4.x",
    "framer-motion": "^11.x",
    "lucide-react": "^0.x",
    "@radix-ui/react-dialog": "^1.x",
    "@radix-ui/react-select": "^2.x",
    "@radix-ui/react-label": "^2.x",
    "@radix-ui/react-slot": "^1.x",
    "class-variance-authority": "^0.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  }
}
```

---

## Architecture

### 1. State Management

#### TanStack Query (Server State)

All async data is managed through React Query hooks:

**Auth Hooks** (`src/hooks/use-auth.ts`)
```typescript
useUser()              // GET /users/me - current user data
useLogin()             // POST /auth/login - login mutation
useSignup()            // POST /auth/signup - signup mutation
useLogout()            // POST /auth/logout - logout mutation
useAcceptInvitation()  // POST /auth/accept-invite - accept invite
useAuth()              // Combined hook for backward compatibility
```

**Organization Hooks** (`src/hooks/use-organization.ts`)
```typescript
useMembers()           // GET /organization/members
useUpdateMemberRole()  // PATCH /organization/members/:id/role
useRemoveMember()      // DELETE /organization/members/:id
useInvitations()       // GET /organization/invitations
useSendInvitation()    // POST /organization/invite
useCancelInvitation()  // DELETE /organization/invitations/:id
```

**Profile Hooks** (`src/hooks/use-profile.ts`)
```typescript
useUpdateProfile()     // PATCH /users/me
```

#### Zustand (Client State)

UI state managed through stores with selectors:

```typescript
// src/stores/ui-store.ts
interface UIState {
  sidebarOpen: boolean;
  inviteModalOpen: boolean;
  confirmDialogOpen: boolean;
}

// Selectors for performance
useSidebarOpen()       // Only re-renders on sidebar change
useInviteModalOpen()   // Only re-renders on modal change
```

#### Query Keys Pattern

```typescript
export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
};

export const organizationKeys = {
  all: ['organization'] as const,
  members: () => [...organizationKeys.all, 'members'] as const,
  invitations: () => [...organizationKeys.all, 'invitations'] as const,
};
```

### 2. Providers Architecture

```typescript
// src/components/providers.tsx
export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

---

## UI Design System

### Theme Configuration

**Dark Mode (Default)**
```css
--color-background: #0a0a0f;      /* Near black */
--color-foreground: #fafafa;       /* White */
--color-primary: #6366f1;          /* Indigo */
--color-glass: rgba(17, 17, 27, 0.6);
--color-glass-border: rgba(255, 255, 255, 0.08);
--color-glow-primary: rgba(99, 102, 241, 0.5);
```

**Light Mode**
```css
--color-background: #fafafa;
--color-foreground: #0a0a0f;
--color-primary: #4f46e5;
--color-glass: rgba(255, 255, 255, 0.6);
--color-glass-border: rgba(0, 0, 0, 0.08);
```

### Glassmorphism Pattern

All components use this pattern:
```tsx
className={cn(
  'bg-white/5 backdrop-blur-xl',      // Glass effect
  'border border-white/10',            // Subtle border
  'shadow-xl shadow-black/10',         // Depth
  'hover:bg-white/10',                 // Hover state
  'transition-all duration-200'        // Smooth transitions
)}
```

### Spotlight Background

Mouse-following radial gradient:
```tsx
<SpotlightBackground>
  {/* Content with dynamic glow effect */}
</SpotlightBackground>
```

### Button Variants

| Variant | Usage | Style |
|---------|-------|-------|
| `default` | Primary actions | Indigo with hover shadow |
| `glow` | **CTA buttons** | Indigo with animated glow |
| `destructive` | Delete/danger | Red with hover glow |
| `outline` | Secondary | Glass border only |
| `secondary` | Tertiary | Muted glass fill |
| `ghost` | Minimal | Transparent, hover fill |
| `link` | Text links | Underline on hover |

### Role Badge Colors

| Role | Text Color | Background |
|------|------------|------------|
| OWNER | `#fbbf24` (Amber) | Amber gradient 20% |
| ADMIN | `#a855f7` (Purple) | Purple gradient 20% |
| SALES_MANAGER | `#3b82f6` (Blue) | Blue gradient 20% |
| PROJECT_MANAGER | `#22c55e` (Green) | Green gradient 20% |
| FRONTSELL_AGENT | `#06b6d4` (Cyan) | Cyan gradient 20% |
| UPSELL_AGENT | `#f97316` (Orange) | Orange gradient 20% |

---

## File Structure

```
apps/frontend/sales-dashboard/src/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx           # Login with React Query
│   │   ├── signup/page.tsx          # Signup with React Query
│   │   └── accept-invite/page.tsx   # Accept invite flow
│   ├── dashboard/
│   │   ├── layout.tsx               # Protected + Spotlight
│   │   ├── page.tsx                 # Dashboard home
│   │   └── settings/
│   │       ├── profile/page.tsx     # Profile with React Query
│   │       └── team/page.tsx        # Team with React Query
│   ├── layout.tsx                   # Root with Providers
│   ├── page.tsx                     # Auth redirect
│   └── global.css                   # Theme + Glassmorphism
├── components/
│   ├── ui/
│   │   ├── button.tsx               # Glow variant
│   │   ├── input.tsx                # Glass input
│   │   ├── card.tsx                 # Glass card
│   │   ├── badge.tsx                # Role badges
│   │   ├── dialog.tsx               # Glass modal
│   │   ├── select.tsx               # Glass dropdown
│   │   ├── avatar.tsx               # User avatar
│   │   ├── label.tsx                # Form label
│   │   └── index.ts                 # Barrel export
│   ├── providers.tsx                # Query + Theme + Nuqs
│   ├── spotlight-background.tsx     # Mouse-following glow
│   ├── theme-toggle.tsx             # Dark/Light switch
│   ├── sidebar.tsx                  # Collapsible nav
│   ├── protected-route.tsx          # Auth guard
│   ├── role-guard.tsx               # RBAC visibility
│   └── page-wrapper.tsx             # Framer animations
├── hooks/
│   ├── use-auth.ts                  # Auth React Query
│   ├── use-organization.ts          # Org React Query
│   └── use-profile.ts               # Profile React Query
├── stores/
│   └── ui-store.ts                  # Zustand UI state
├── contexts/
│   └── auth-context.tsx             # Legacy (deprecated)
└── lib/
    ├── api.ts                       # API client class
    ├── query-client.ts              # React Query config
    └── utils.ts                     # cn() utility
```

---

## API Integration

### Backend Endpoints Used

| Frontend Action | HTTP Method | Backend Endpoint |
|-----------------|-------------|------------------|
| Login | POST | `/api/auth/login` |
| Signup | POST | `/api/auth/signup` |
| Logout | POST | `/api/auth/logout` |
| Get Profile | GET | `/api/users/me` |
| Update Profile | PATCH | `/api/users/me` |
| Get Members | GET | `/api/organization/members` |
| Update Role | PATCH | `/api/organization/members/:id/role` |
| Remove Member | DELETE | `/api/organization/members/:id` |
| Send Invite | POST | `/api/organization/invite` |
| Get Invitations | GET | `/api/organization/invitations` |
| Cancel Invite | DELETE | `/api/organization/invitations/:id` |
| Get Invite Details | GET | `/api/auth/invite?token=xxx` |
| Accept Invite | POST | `/api/auth/accept-invite` |

### API Client Features

- Automatic token refresh on 401
- Token storage in localStorage
- Type-safe responses
- Error handling with message extraction

---

## Routes

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | Redirects to login or dashboard |
| `/auth/login` | Public | Login page |
| `/auth/signup` | Public | Signup + create org |
| `/auth/accept-invite` | Public | Accept invitation |
| `/dashboard` | Protected | Main dashboard |
| `/dashboard/settings/profile` | Protected | Profile settings |
| `/dashboard/settings/team` | OWNER/ADMIN | Team management |

---

## Running the Frontend

```bash
# Development (with hot reload)
npx nx serve sales-dashboard
# Runs on http://localhost:4200

# Production build
npx nx build sales-dashboard

# Lint
npx nx lint sales-dashboard
```

---

## Environment Variables

Create `apps/frontend/sales-dashboard/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## Migration Guide

### From Context to React Query

**Before (Phase 2):**
```tsx
import { useAuth } from '@/contexts/auth-context';

function Component() {
  const { user, login, logout, isLoading } = useAuth();

  const handleLogin = async () => {
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  };
}
```

**After (Phase 3):**
```tsx
import { useAuth, useLogin } from '@/hooks/use-auth';

function Component() {
  const { user, isLoading } = useAuth();
  const loginMutation = useLogin();

  const handleLogin = () => {
    loginMutation.mutate({ email, password });
  };

  // Access error state
  if (loginMutation.error) {
    // Handle error
  }
}
```

---

## Performance Optimizations

1. **Zustand Selectors**: Prevent unnecessary re-renders
   ```tsx
   const sidebarOpen = useSidebarOpen(); // Selective subscription
   ```

2. **React Query Caching**: 5-minute stale time for user data

3. **Query Invalidation**: Precise cache updates
   ```tsx
   queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
   ```

4. **SSR Safety**: Token check deferred to client-side effect

---

## E2E Tests (Playwright)

✅ **5/5 critical path tests passing** - See [`docs/TESTING_STATUS.md`](./TESTING_STATUS.md) for full details.

```bash
# Quick run
npx nx serve core-service  # backend must be running
cd apps/frontend/sales-dashboard && npx playwright test
```

| Test | Validates | Status |
|------|-----------|--------|
| Signup Flow | `useSignup` + redirect | ✅ |
| Logout Flow | `useLogout` + token clear | ✅ |
| Login Flow | `useLogin` + dashboard load | ✅ |
| Profile Page | `useUser` query hook | ✅ |
| Team Page | `useMembers` query hook | ✅ |

---

## Testing Checklist

### Authentication
- [x] User can sign up and create organization
- [x] User can login with email/password
- [x] User can logout
- [x] Dashboard redirects unauthenticated users
- [x] Tokens persist across page refresh

### Profile
- [x] Profile page shows user info
- [x] Profile can be updated
- [x] Avatar updates reflect immediately

### Team Management
- [x] Team page shows all members
- [x] Role can be changed via dropdown
- [x] Members can be removed
- [x] Invite modal sends invitations
- [x] Pending invitations are listed
- [x] Invitations can be cancelled

### UI/UX
- [x] Dark/Light theme toggle works
- [x] Theme persists across sessions
- [x] Spotlight effect follows mouse
- [x] Sidebar can collapse/expand
- [x] Page animations work smoothly
- [x] Loading states show spinners
- [x] Error states show messages

---

## Known Limitations

1. **No Email Integration**: Invitation links logged to console only
2. **No Avatar Upload**: Must enter URL manually
3. **No Password Reset**: Forgot password logs to console
4. **No Real-time Updates**: Polling only, no WebSocket

---

## Next Steps

- [ ] Implement Leads management page with React Query
- [ ] Implement Orders management page with React Query
- [ ] Add real-time notifications (WebSocket/SSE)
- [ ] Add table filtering with Nuqs URL state
- [ ] Add avatar file upload with presigned URLs
- [ ] Add activity log/audit trail
