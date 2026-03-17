# HRMS-FE-001: HRMS Dashboard Frontend Bootstrap

## Overview
Bootstrap a new Next.js frontend application for the HRMS Dashboard. This is a separate app from Sales and PM dashboards, running on its own port/domain, following the same patterns established in those apps.

## Acceptance Criteria
- [ ] New Next.js 14 app at `apps/frontend/hrms-dashboard/`
- [ ] App Router with `src/app/` directory structure
- [ ] Tailwind CSS configured (same design tokens as other dashboards)
- [ ] Shared UI component library used (`@sentra/ui` or local `/components/ui`)
- [ ] Auth flow: JWT tokens in localStorage, same Axios interceptor pattern as other dashboards (single-flight refresh per AUTH-003)
- [ ] `ProtectedRoute` component — redirects unauthenticated users to login
- [ ] `OrgContextProvider` — reads org/user from JWT, exposes via context
- [ ] `PermissionsProvider` — loads user permissions from `/auth/my-permissions`, exposes `hasPermission(code)` hook
- [ ] Sidebar navigation with links: Employees, Teams, Departments, Roles, Invitations
- [ ] Sidebar shows only nav items the user has permission to see
- [ ] Top navbar: org name, user avatar dropdown (My Profile, My Sessions, Logout)
- [ ] Responsive layout (sidebar collapses on mobile)
- [ ] `GET /dashboard` root → redirects to `/dashboard/employees`
- [ ] Error boundary at app level
- [ ] Loading states with skeleton components
- [ ] Toast notifications (sonner or react-hot-toast)
- [ ] Running on port 3005 (`NEXT_PUBLIC_PORT=3005`)

## Technical Specification

### Directory Structure

```
apps/frontend/hrms-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← root layout with providers
│   │   ├── page.tsx                 ← redirect to /dashboard
│   │   ├── auth/
│   │   │   ├── login/page.tsx       ← login page (same as other apps)
│   │   │   ├── suspended/page.tsx
│   │   │   ├── select-app/page.tsx
│   │   │   └── handoff/page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx           ← protected layout with sidebar
│   │       ├── page.tsx             ← redirect to /dashboard/employees
│   │       ├── employees/
│   │       ├── teams/
│   │       ├── departments/
│   │       ├── roles/
│   │       └── invitations/
│   ├── components/
│   │   ├── ui/                      ← shadcn components
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── navbar.tsx
│   │   │   └── dashboard-layout.tsx
│   │   └── shared/
│   │       ├── status-badge.tsx     ← ACTIVE/SUSPENDED/INVITED/DEACTIVATED
│   │       ├── user-avatar.tsx
│   │       ├── pagination.tsx
│   │       └── confirm-dialog.tsx
│   ├── lib/
│   │   ├── api.ts                   ← Axios instance + interceptors
│   │   ├── tokens.ts                ← getTokens/setTokens/clearTokens
│   │   └── refresh-mutex.ts
│   ├── hooks/
│   │   ├── use-permissions.ts       ← hasPermission(), usePermissions()
│   │   └── use-org-context.ts
│   └── providers/
│       ├── query-provider.tsx       ← React Query
│       ├── permissions-provider.tsx
│       └── org-context-provider.tsx
├── tailwind.config.ts
├── next.config.mjs
└── project.json
```

### Root Layout

```tsx
// src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <OrgContextProvider>
            <PermissionsProvider>
              {children}
              <Toaster />
            </PermissionsProvider>
          </OrgContextProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

### Dashboard Layout (Protected)

```tsx
// src/app/dashboard/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-y-auto bg-muted/10 p-6">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

### Sidebar Navigation

```tsx
// src/components/layout/sidebar.tsx

const NAV_ITEMS = [
  {
    href: '/dashboard/employees',
    label: 'Employees',
    icon: UsersIcon,
    permission: 'hrms:users:view',
  },
  {
    href: '/dashboard/invitations',
    label: 'Invitations',
    icon: MailIcon,
    permission: 'hrms:invitations:send',
  },
  {
    href: '/dashboard/teams',
    label: 'Teams',
    icon: UsersRoundIcon,
    permission: 'hrms:teams:view',
  },
  {
    href: '/dashboard/departments',
    label: 'Departments',
    icon: BuildingIcon,
    permission: 'hrms:departments:manage',
  },
  {
    href: '/dashboard/roles',
    label: 'Roles & Permissions',
    icon: ShieldIcon,
    permission: 'hrms:roles:view',
  },
];

export function Sidebar() {
  const { hasPermission } = usePermissions();
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(item => hasPermission(item.permission));

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <img src="/logo.svg" alt="Sentra HRMS" className="h-6" />
      </div>
      <nav className="p-3 space-y-1">
        {visibleItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

### Permissions Provider

```tsx
// src/providers/permissions-provider.tsx

const PermissionsContext = createContext<{
  permissions: Set<string>;
  hasPermission: (code: string) => boolean;
  isLoading: boolean;
}>({ permissions: new Set(), hasPermission: () => false, isLoading: true });

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/auth/my-permissions').then(r => r.data.data as string[]),
    staleTime: 5 * 60 * 1000, // 5 min — matches backend cache TTL
  });

  const permissions = useMemo(() => new Set(data || []), [data]);

  const hasPermission = useCallback((code: string) => {
    if (permissions.has('*:*:*')) return true;
    const [app] = code.split(':');
    if (permissions.has(`${app}:*:*`)) return true;
    return permissions.has(code);
  }, [permissions]);

  return (
    <PermissionsContext.Provider value={{ permissions, hasPermission, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
```

### Status Badge Component

```tsx
// src/components/shared/status-badge.tsx

const STATUS_CONFIG = {
  ACTIVE:      { label: 'Active',      className: 'bg-green-100 text-green-700' },
  INVITED:     { label: 'Invited',     className: 'bg-yellow-100 text-yellow-700' },
  SUSPENDED:   { label: 'Suspended',   className: 'bg-orange-100 text-orange-700' },
  DEACTIVATED: { label: 'Deactivated', className: 'bg-gray-100 text-gray-500' },
};

export function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DEACTIVATED;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
```

### Backend Endpoint Needed: GET /auth/my-permissions

```typescript
// auth.controller.ts (core-service)
@Get('my-permissions')
@UseGuards(JwtAuthGuard)
async getMyPermissions(@Req() req: Request) {
  const perms = await this.permissionsService.getUserPermissions(req.user.sub, req.user.organizationId);
  return { data: perms };  // string[] of permission codes
}
```

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_PORT=3005
NEXT_PUBLIC_SALES_APP_URL=http://localhost:3001
NEXT_PUBLIC_PM_APP_URL=http://localhost:3002
```

## Testing Requirements

### Smoke Tests
- App loads on port 3005
- Unauthenticated user → redirect to /auth/login
- Authenticated user with HRMS access → loads /dashboard/employees
- Sidebar shows only items matching user permissions

### Component Tests
- Sidebar renders only permitted nav items
- StatusBadge renders correct color per status
- PermissionsProvider `hasPermission()` returns correct value for wildcard and specific codes

### Edge Cases
- /auth/my-permissions API fails → permissions are empty → all permission checks return false → appropriate "no access" message shown
- User navigates directly to /dashboard/roles without `hrms:roles:view` → redirect or 403 page
