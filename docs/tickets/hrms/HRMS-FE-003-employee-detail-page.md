# HRMS-FE-003: Employee Detail Page

## Overview
Full employee detail page showing profile info, app access & roles management panel, active sessions panel, and audit activity. Admins can edit profile, manage app access, assign/remove roles, and revoke sessions — all from one page.

## Acceptance Criteria
- [ ] URL: `/dashboard/employees/:id`
- [ ] Header: avatar, full name, email, job title, status badge, action buttons (Edit, Suspend/Unsuspend, Deactivate)
- [ ] Tab 1 — Profile: all employee fields (editable inline or via edit modal)
- [ ] Tab 2 — Access & Roles: app access cards with roles, grant/revoke access, add/remove roles
- [ ] Tab 3 — Sessions: active sessions list with per-session revoke (reuses AUTH-005 data)
- [ ] Tab 4 — Activity: audit log for this employee (invites, status changes, role changes)
- [ ] All actions are permission-gated
- [ ] Success/error toasts on every mutation
- [ ] Back button → employees list

## Technical Specification

### Page Layout

```tsx
// src/app/dashboard/employees/[id]/page.tsx

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', params.id],
    queryFn: () => api.get(`/api/hrms/employees/${params.id}`).then(r => r.data.data),
  });

  if (isLoading) return <EmployeeDetailSkeleton />;
  if (!employee) return <NotFound message="Employee not found" />;

  return (
    <div className="space-y-6">
      <EmployeeDetailHeader employee={employee} />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="access">Access & Roles</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({employee.activeSessionCount})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab employee={employee} /></TabsContent>
        <TabsContent value="access"><AccessRolesTab userId={params.id} /></TabsContent>
        <TabsContent value="sessions"><SessionsTab userId={params.id} /></TabsContent>
        <TabsContent value="activity"><ActivityTab userId={params.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

### Employee Header

```tsx
export function EmployeeDetailHeader({ employee }: { employee: Employee }) {
  const { hasPermission } = usePermissions();

  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/employees"><ArrowLeftIcon /></Link>
        </Button>
        <UserAvatar user={employee} size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{employee.fullName}</h1>
            <StatusBadge status={employee.status} />
          </div>
          <p className="text-muted-foreground">{employee.email}</p>
          {employee.jobTitle && <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {hasPermission('hrms:users:edit') && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <PencilIcon className="mr-2 h-4 w-4" /> Edit
          </Button>
        )}
        {employee.status === 'ACTIVE' && hasPermission('hrms:users:suspend') && (
          <Button variant="outline" className="text-orange-600 border-orange-200" onClick={() => setSuspendOpen(true)}>
            Suspend
          </Button>
        )}
        {employee.status === 'SUSPENDED' && hasPermission('hrms:users:suspend') && (
          <Button variant="outline" onClick={() => handleUnsuspend()}>
            Unsuspend
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Profile Tab

```tsx
// Shows all employee fields in a read-only card layout
// Edit button opens an edit modal

export function ProfileTab({ employee }: { employee: Employee }) {
  return (
    <Card>
      <CardContent className="pt-6 grid grid-cols-2 gap-6">
        <ProfileField label="First Name" value={employee.firstName} />
        <ProfileField label="Last Name" value={employee.lastName} />
        <ProfileField label="Email" value={employee.email} />
        <ProfileField label="Phone" value={employee.phone} />
        <ProfileField label="Job Title" value={employee.jobTitle} />
        <ProfileField label="Department" value={employee.department?.name} />
        <ProfileField label="Member Since" value={formatDate(employee.createdAt)} />
        {employee.suspendReason && (
          <ProfileField label="Suspend Reason" value={employee.suspendReason} className="col-span-2 text-orange-600" />
        )}
      </CardContent>
    </Card>
  );
}
```

### Access & Roles Tab

```tsx
// Shows a card per app the user has (or could have) access to

export function AccessRolesTab({ userId }: { userId: string }) {
  const { data: access } = useQuery({
    queryKey: ['employee-access', userId],
    queryFn: () => api.get(`/api/hrms/employees/${userId}/access`).then(r => r.data.data),
  });

  const allApps = ['SALES', 'PM', 'HRMS'];
  const grantedApps = access?.apps?.map(a => a.appCode) || [];
  const ungrantedApps = allApps.filter(a => !grantedApps.includes(a));

  return (
    <div className="space-y-4">
      {/* Granted apps */}
      {access?.apps?.map(app => (
        <AppAccessCard key={app.appCode} app={app} userId={userId} />
      ))}

      {/* Grant access to additional apps */}
      {ungrantedApps.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-3">Grant access to additional apps:</p>
            <div className="flex gap-2">
              {ungrantedApps.map(appCode => (
                <GrantAccessButton key={appCode} userId={userId} appCode={appCode} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AppAccessCard({ app, userId }: { app: AppAccess; userId: string }) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:app_access:manage');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppIcon appCode={app.appCode} />
            <CardTitle className="text-base">{APP_LABELS[app.appCode]}</CardTitle>
            <span className="text-xs text-muted-foreground">{app.effectivePermissionCount} permissions</span>
          </div>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => confirmRevokeAccess(app.appCode)}
            >
              Revoke Access
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {app.roles.map(role => (
            <div key={role.userAppRoleId} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">{role.roleName}</span>
                {role.isSystem && (
                  <span className="text-xs text-muted-foreground bg-muted-foreground/10 rounded px-1">system</span>
                )}
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeRole(role.userAppRoleId)}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}

          {app.roles.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No roles assigned</p>
          )}

          {canManage && (
            <AddRoleButton userId={userId} appCode={app.appCode} existingRoleIds={app.roles.map(r => r.roleId)} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Sessions Tab

```tsx
// Same data as AUTH-005 admin session view — renders sessions list

export function SessionsTab({ userId }: { userId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ['employee-sessions', userId],
    queryFn: () => api.get(`/api/admin/users/${userId}/sessions`).then(r => r.data),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{data?.meta.active || 0} active sessions</p>
        {data?.meta.active > 0 && (
          <Button variant="outline" size="sm" onClick={() => revokeAll()}>
            Revoke All Sessions
          </Button>
        )}
      </div>

      {data?.data.map(session => (
        <SessionCard key={session.id} session={session} onRevoke={() => { revokeSession(session.id); refetch(); }} />
      ))}

      {data?.meta.active === 0 && (
        <EmptyState icon={MonitorIcon} message="No active sessions" />
      )}
    </div>
  );
}
```

### Activity Tab

```tsx
// Shows audit log for this employee
// GET /api/hrms/employees/:id/activity?page=1&limit=20

export function ActivityTab({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ['employee-activity', userId],
    queryFn: () => api.get(`/api/hrms/employees/${userId}/activity`).then(r => r.data),
  });

  return (
    <div className="space-y-3">
      {data?.data.map(log => (
        <ActivityLogItem key={log.id} log={log} />
      ))}
    </div>
  );
}

// Activity log item shows:
// Icon + Action label + "by {adminName}" + relative time
// Examples:
// "Account invited by Jane Smith  · 3 days ago"
// "Sales Dashboard access granted by Jane Smith  · 2 days ago"
// "Frontsell Agent role assigned by Jane Smith  · 2 days ago"
// "Account suspended by Jane Smith  · Reason: Policy violation · 1 hour ago"
```

## Testing Requirements

### Component Tests
- Profile tab shows suspend reason in orange when employee is suspended
- Access tab shows "Revoke Access" only to users with hrms:app_access:manage
- Sessions tab shows "Revoke All" only when active session count > 0
- Add role dropdown grays out already-assigned roles

### Integration Tests
- Grant app access → card appears in Access tab
- Assign role → role appears in app card
- Remove role → role removed from card
- Revoke app access → card disappears, all roles gone
- Revoke session from Sessions tab → session disappears after refetch
- Edit profile → name updated in header

### Edge Cases
- Employee with 0 app access: shows all apps as "available to grant" cards
- Activity tab empty: shows "No activity yet" empty state
- Employee not found (deleted between list load and navigation): shows 404 page, not crash
