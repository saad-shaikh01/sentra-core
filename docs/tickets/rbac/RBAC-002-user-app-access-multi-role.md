# RBAC-002: User App Access + Multi-Role Assignment

## Overview
Create `UserAppAccess` (which apps a user can access) and `UserAppRole` (which roles a user has within each app, supporting multiple roles per app). Implement the app selection screen shown after login when a user has access to more than one app.

## Background / Context
A user like a Sales Manager who also coordinates with the PM team should be able to have `frontsell_agent` + `upsell_agent` roles in Sales simultaneously. Their effective permissions = union of all assigned roles. This multi-role system replaces the single `user.role` string.

The app selection screen is the first thing a multi-app user sees after logging in — it must be clean, fast, and show only apps the user has access to.

## Acceptance Criteria
- [ ] `UserAppAccess` table correctly links users to apps they can access
- [ ] `UserAppRole` table allows multiple role rows per user per app (multi-role)
- [ ] `POST /hrms/users/:userId/app-access` grants a user access to an app
- [ ] `DELETE /hrms/users/:userId/app-access/:appCode` revokes access to an app (also removes all app roles for that app)
- [ ] `GET /hrms/users/:userId/app-access` returns all app access records for a user
- [ ] `POST /hrms/users/:userId/app-roles` assigns a role to a user for a specific app
- [ ] `DELETE /hrms/users/:userId/app-roles/:userAppRoleId` removes a specific role from a user
- [ ] `GET /hrms/users/:userId/app-roles` returns all role assignments for a user
- [ ] `GET /auth/my-apps` returns the calling user's accessible apps with their roles (used by frontend for app selection)
- [ ] App selection screen shows correctly after login when user has 2+ apps
- [ ] Single-app users skip the selection screen and go directly to their app

## Technical Specification

### Database Schema

```prisma
model UserAppAccess {
  id             String    @id @default(cuid())
  userId         String
  appCode        String    // "SALES" | "PM" | "HRMS"
  organizationId String
  isActive       Boolean   @default(true)
  grantedBy      String    // userId of admin who granted access
  grantedAt      DateTime  @default(now())
  revokedAt      DateTime?
  revokedBy      String?

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, appCode, organizationId])
  @@index([userId, organizationId])
}

model UserAppRole {
  id             String    @id @default(cuid())
  userId         String
  appRoleId      String
  organizationId String
  assignedBy     String    // userId of admin who assigned
  assignedAt     DateTime  @default(now())

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  appRole        AppRole   @relation(fields: [appRoleId], references: [id], onDelete: Cascade)

  @@unique([userId, appRoleId, organizationId])
  @@index([userId, organizationId])
}
```

### Service Logic

```typescript
// user-app-access.service.ts

async grantAppAccess(userId: string, appCode: string, orgId: string, adminId: string) {
  // Check user belongs to org
  const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  if (!user) throw new NotFoundException('User not found');

  // Upsert — idempotent
  return this.prisma.userAppAccess.upsert({
    where: { userId_appCode_organizationId: { userId, appCode, organizationId: orgId } },
    create: { userId, appCode, organizationId: orgId, grantedBy: adminId },
    update: { isActive: true, revokedAt: null, revokedBy: null, grantedBy: adminId, grantedAt: new Date() }
  });
}

async revokeAppAccess(userId: string, appCode: string, orgId: string, adminId: string) {
  // Revoke access
  await this.prisma.userAppAccess.updateMany({
    where: { userId, appCode, organizationId: orgId },
    data: { isActive: false, revokedAt: new Date(), revokedBy: adminId }
  });

  // Also remove all roles for this app (access revoked = no roles needed)
  const roles = await this.prisma.userAppRole.findMany({
    where: { userId, organizationId: orgId },
    include: { appRole: true }
  });
  const appRoleIds = roles
    .filter(r => r.appRole.appCode === appCode)
    .map(r => r.id);

  if (appRoleIds.length > 0) {
    await this.prisma.userAppRole.deleteMany({
      where: { id: { in: appRoleIds } }
    });
  }
}

async assignRole(userId: string, appRoleId: string, orgId: string, adminId: string) {
  // Verify role belongs to this app and org (or is a system role)
  const role = await this.prisma.appRole.findUnique({ where: { id: appRoleId } });
  if (!role) throw new NotFoundException('Role not found');
  if (role.organizationId && role.organizationId !== orgId) throw new ForbiddenException('Role not in your org');

  // Verify user has access to this app
  const access = await this.prisma.userAppAccess.findFirst({
    where: { userId, appCode: role.appCode, organizationId: orgId, isActive: true }
  });
  if (!access) throw new BadRequestException(`User does not have access to ${role.appCode} app. Grant access first.`);

  return this.prisma.userAppRole.upsert({
    where: { userId_appRoleId_organizationId: { userId, appRoleId, organizationId: orgId } },
    create: { userId, appRoleId, organizationId: orgId, assignedBy: adminId },
    update: { assignedBy: adminId, assignedAt: new Date() }
  });
}
```

### GET /auth/my-apps

```typescript
// Returns apps the current user has access to, with their roles per app
// Used by frontend login flow

async getMyApps(userId: string, orgId: string): Promise<MyAppsResponse> {
  const appAccess = await this.prisma.userAppAccess.findMany({
    where: { userId, organizationId: orgId, isActive: true },
  });

  const userRoles = await this.prisma.userAppRole.findMany({
    where: { userId, organizationId: orgId },
    include: { appRole: true }
  });

  return appAccess.map(access => ({
    appCode: access.appCode,
    appLabel: APP_LABELS[access.appCode],
    appUrl: APP_URLS[access.appCode],
    roles: userRoles
      .filter(r => r.appRole.appCode === access.appCode)
      .map(r => ({ id: r.appRole.id, name: r.appRole.name, slug: r.appRole.slug }))
  }));
}

// Response shape:
// [
//   { appCode: "SALES", appLabel: "Sales Dashboard", appUrl: "https://sales.sentracore.com", roles: [...] },
//   { appCode: "PM",    appLabel: "PM Dashboard",    appUrl: "https://pm.sentracore.com",    roles: [...] }
// ]
```

### Frontend: App Selection Screen

```typescript
// apps/frontend/sales-dashboard/src/app/auth/select-app/page.tsx

const APP_META = {
  SALES: {
    label: 'Sales Dashboard',
    description: 'Manage leads, sales, and revenue',
    icon: '💼',
    color: 'blue',
  },
  PM: {
    label: 'Project Manager',
    description: 'Track projects, tasks, and deliverables',
    icon: '📋',
    color: 'green',
  },
  HRMS: {
    label: 'HRMS',
    description: 'Manage employees, teams, and access',
    icon: '👥',
    color: 'purple',
  },
};

export default function SelectAppPage() {
  const { data: apps, isLoading } = useQuery({
    queryKey: ['my-apps'],
    queryFn: () => api.get('/auth/my-apps').then(r => r.data.data)
  });

  if (isLoading) return <AppSelectionSkeleton />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-muted-foreground mt-1">Select an app to continue</p>
        </div>

        <div className="grid gap-3">
          {apps?.map(app => (
            <AppCard
              key={app.appCode}
              app={app}
              meta={APP_META[app.appCode]}
              onClick={() => handleAppSwitch(app)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

UX details:
- Each app card shows: icon, name, description, and the user's role(s) within that app (e.g., "Frontsell Agent, Upsell Agent")
- Clicking a card redirects directly (no handoff needed — user just logged in, current app matches origin)
- Loading state: skeleton cards
- If apps list is empty → show "No apps assigned. Contact your administrator."
- Cards sorted: SALES → PM → HRMS → ADMIN

## API Endpoints Summary

```
POST   /hrms/users/:userId/app-access            → grant access to an app
DELETE /hrms/users/:userId/app-access/:appCode   → revoke access to an app
GET    /hrms/users/:userId/app-access            → list all app access for user
POST   /hrms/users/:userId/app-roles             → assign a role { appRoleId }
DELETE /hrms/users/:userId/app-roles/:id         → remove a role assignment
GET    /hrms/users/:userId/app-roles             → list all role assignments for user
GET    /auth/my-apps                             → current user's accessible apps + roles
```

## Testing Requirements

### Unit Tests
- `grantAppAccess()` is idempotent — granting same access twice does not create duplicate
- `revokeAppAccess()` also removes all role assignments for that app
- `assignRole()` throws if user does not have access to the role's app
- `assignRole()` throws if role belongs to different org's custom role
- `getMyApps()` returns only active access records (not revoked)

### Integration Tests
- Grant SALES access → assign frontsell_agent + upsell_agent roles → GET my-apps shows both roles
- Revoke SALES access → role assignments for SALES also deleted
- User with 1 app → /auth/my-apps returns array of length 1

### Frontend Tests
- Select-app page shows exactly the apps from /auth/my-apps
- Empty apps list shows "no apps assigned" message
- Each card shows correct role labels

### Edge Cases
- User invited but no app access assigned yet → /auth/my-apps returns empty array → "no apps" screen
- Admin assigns role without granting app access first → 400 error with clear message
- Org admin tries to assign a role from a different organization → 403
