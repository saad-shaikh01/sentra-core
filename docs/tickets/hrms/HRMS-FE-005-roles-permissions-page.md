# HRMS-FE-005: Roles & Permissions Management Page

## Overview
Admin-facing page to view all app roles, create custom roles, edit permissions on custom roles, and see which users are assigned each role. System roles are read-only.

## Acceptance Criteria
- [ ] URL: `/dashboard/roles`
- [ ] App tabs: Sales | PM | HRMS (tabs to switch between apps)
- [ ] Each app tab shows: system roles (read-only) + org custom roles (editable)
- [ ] Each role card shows: name, type (system/custom), permission count, user count, actions
- [ ] "Create Custom Role" button per app tab
- [ ] Click on any role → role detail sheet/modal showing all permissions
- [ ] Custom roles: edit name/description, modify permissions, delete (if no users assigned)
- [ ] System roles: view only (no edit/delete)
- [ ] Permission list grouped by resource (leads, sales, reports, teams...)
- [ ] "Who has this role?" — shows list of users assigned this role

## Technical Specification

### Page Structure

```tsx
// src/app/dashboard/roles/page.tsx

const APP_TABS = [
  { code: 'SALES', label: 'Sales Dashboard' },
  { code: 'PM',    label: 'PM Dashboard' },
  { code: 'HRMS',  label: 'HRMS' },
];

export default function RolesPage() {
  const [activeApp, setActiveApp] = useState('SALES');

  const { data: roles } = useQuery({
    queryKey: ['roles', activeApp],
    queryFn: () => api.get(`/api/hrms/apps/${activeApp}/roles`).then(r => r.data.data),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Manage what users can do in each app"
      />

      <Tabs value={activeApp} onValueChange={setActiveApp}>
        <TabsList>
          {APP_TABS.map(tab => (
            <TabsTrigger key={tab.code} value={tab.code}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>

        {APP_TABS.map(tab => (
          <TabsContent key={tab.code} value={tab.code}>
            <RolesAppTab appCode={tab.code} roles={roles || []} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

### Roles App Tab

```tsx
function RolesAppTab({ appCode, roles }: { appCode: string; roles: AppRole[] }) {
  const { hasPermission } = usePermissions();
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  return (
    <div className="space-y-6">
      {/* System Roles Section */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">System Roles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {systemRoles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              onClick={() => setSelectedRole(role)}
            />
          ))}
        </div>
      </div>

      {/* Custom Roles Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Custom Roles</h3>
          {hasPermission('hrms:roles:manage') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" /> Create Role
            </Button>
          )}
        </div>
        {customRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No custom roles yet. Create one to customize access for your team.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customRoles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                onClick={() => setSelectedRole(role)}
                editable
              />
            ))}
          </div>
        )}
      </div>

      {/* Role Detail Sheet */}
      <RoleDetailSheet
        role={selectedRole}
        appCode={appCode}
        open={!!selectedRole}
        onClose={() => setSelectedRole(null)}
      />
    </div>
  );
}
```

### Role Card

```tsx
function RoleCard({ role, onClick, editable = false }: { role: AppRole; onClick: () => void; editable?: boolean }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{role.name}</span>
              {role.isSystem && (
                <span className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">system</span>
              )}
              {!role.isSystem && (
                <span className="text-xs bg-purple-50 text-purple-600 rounded px-1.5 py-0.5">custom</span>
              )}
            </div>
            {role.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
            )}
          </div>
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>{role.permissionCount} permissions</span>
          <span>{role.userCount} users</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Role Detail Sheet

```tsx
function RoleDetailSheet({ role, appCode, open, onClose }) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:roles:manage') && !role?.isSystem;

  const { data: permissions } = useQuery({
    queryKey: ['role-permissions', role?.id],
    queryFn: () => api.get(`/api/hrms/apps/${appCode}/roles/${role.id}/permissions`).then(r => r.data.data),
    enabled: !!role?.id,
  });

  const { data: allPermissions } = useQuery({
    queryKey: ['all-permissions', appCode],
    queryFn: () => api.get(`/api/hrms/apps/${appCode}/permissions`).then(r => r.data.data),
    enabled: canManage,
  });

  // Group permissions by resource
  const grouped = useMemo(() => {
    const perms = canManage ? allPermissions : permissions;
    return groupBy(perms || [], p => p.resource);
  }, [allPermissions, permissions, canManage]);

  const assignedIds = new Set(permissions?.map(p => p.id));

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {role?.name}
            {role?.isSystem && <span className="text-xs bg-blue-50 text-blue-600 rounded px-1.5">system</span>}
          </SheetTitle>
          {role?.description && <SheetDescription>{role.description}</SheetDescription>}
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {Object.entries(grouped).map(([resource, perms]) => (
            <div key={resource}>
              <h4 className="text-sm font-medium capitalize mb-2">
                {resource.replace(/_/g, ' ')}
              </h4>
              <div className="space-y-1.5">
                {perms.map(perm => (
                  <div key={perm.id} className="flex items-center justify-between rounded-md px-3 py-2 bg-muted">
                    <div>
                      <p className="text-sm">{perm.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{perm.code}</p>
                    </div>
                    {canManage ? (
                      <Checkbox
                        checked={assignedIds.has(perm.id)}
                        onCheckedChange={(checked) => togglePermission(perm.id, checked)}
                      />
                    ) : (
                      assignedIds.has(perm.id)
                        ? <CheckIcon className="h-4 w-4 text-green-600" />
                        : <MinusIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Users with this role */}
        <RoleUsersSection roleId={role?.id} />

        {canManage && (
          <div className="mt-6 flex gap-2">
            <Button onClick={savePermissions} className="flex-1">Save Changes</Button>
            <Button variant="destructive" onClick={deleteRole} disabled={role?.userCount > 0}>
              Delete Role
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

### Create Custom Role Modal

```tsx
// Fields: Role Name (required), Description (optional), App (pre-selected from current tab)
// After creation, user can immediately set permissions from the role detail sheet

export function CreateRoleModal({ appCode, open, onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      await api.post(`/api/hrms/apps/${appCode}/roles`, { ...form, appCode });
      toast.success('Role created. You can now assign permissions to it.');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast.error('A role with this name already exists.');
      } else {
        toast.error('Failed to create role.');
      }
    } finally {
      setLoading(false);
    }
  }
  // ...
}
```

## Testing Requirements

### Component Tests
- System role card does not show edit controls
- Custom role card shows "custom" badge
- Role detail sheet shows checkboxes for editable roles, check icons for system roles
- Delete button disabled when userCount > 0

### Integration Tests
- Create custom role → appears in custom roles section
- Add permission to custom role → checkbox checked → save → refetch shows permission still checked
- Remove permission → uncheck → save → permission gone
- Delete role with 0 users → role removed
- Delete role with 1+ users → button is disabled (not clickable)

### Edge Cases
- Role with very long description → truncate in card, full text in detail sheet
- Permission group with 1 permission → still shows group header
- All permissions assigned → all checkboxes checked (100% grant state)
