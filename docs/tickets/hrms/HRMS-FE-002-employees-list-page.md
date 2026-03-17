# HRMS-FE-002: Employees List Page

## Overview
Build the main employees list page in HRMS Dashboard. Shows all staff members with their status, app access, and roles. Supports search, filter, and quick actions (invite, suspend, view detail).

## Acceptance Criteria
- [ ] Table/list view of all employees with: avatar, full name, email, job title, department, status badge, app access icons, actions
- [ ] Search by name or email (debounced 300ms)
- [ ] Filter by: Status (All/Active/Invited/Suspended/Deactivated), App Access (All/SALES/PM/HRMS), Department
- [ ] "Invite User" button (create employee + send invite) — visible to `hrms:users:create`
- [ ] Row actions: View Detail, Send Invite (if INVITED), Suspend/Unsuspend, Deactivate — gated by permissions
- [ ] Pagination (20 per page default)
- [ ] Column: "Apps" shows small icon badges for each app the user has access to
- [ ] Empty state per filter context ("No employees" vs "No results matching your search")
- [ ] Loading skeleton table (5 rows)

## Technical Specification

### Page Structure

```tsx
// src/app/dashboard/employees/page.tsx

export default function EmployeesPage() {
  const [filters, setFilters] = useState<EmployeesFilters>({
    search: '', status: '', appCode: '', departmentId: '', page: 1
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', filters],
    queryFn: () => fetchEmployees(filters),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={`${data?.meta.total || 0} total`}
        actions={<CreateEmployeeButton />}
      />
      <EmployeeFilters filters={filters} onChange={setFilters} />
      {isLoading ? <EmployeeTableSkeleton /> : (
        <EmployeeTable employees={data?.data || []} onAction={handleAction} />
      )}
      <Pagination meta={data?.meta} onPageChange={p => setFilters(f => ({...f, page: p}))} />
    </div>
  );
}
```

### Employee Table

```tsx
// Columns:
// 1. Name (avatar + full name + email)
// 2. Job Title
// 3. Department
// 4. Status (badge)
// 5. Apps (icon badges: S=Sales, P=PM, H=HRMS)
// 6. Actions (dropdown)

const columns: ColumnDef<Employee>[] = [
  {
    accessorKey: 'name',
    header: 'Employee',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <UserAvatar user={row.original} size="sm" />
        <div>
          <p className="font-medium text-sm">{row.original.fullName}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'jobTitle',
    header: 'Title',
    cell: ({ row }) => row.original.jobTitle || <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'department',
    header: 'Department',
    cell: ({ row }) => row.original.department?.name || <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'appAccess',
    header: 'Apps',
    cell: ({ row }) => <AppAccessBadges apps={row.original.appAccess} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => <EmployeeRowActions employee={row.original} />,
  },
];
```

### App Access Badges

```tsx
// Shows small colored pill per app
const APP_BADGES = {
  SALES: { label: 'S', color: 'bg-blue-100 text-blue-700', title: 'Sales Dashboard' },
  PM:    { label: 'P', color: 'bg-green-100 text-green-700', title: 'PM Dashboard' },
  HRMS:  { label: 'H', color: 'bg-purple-100 text-purple-700', title: 'HRMS' },
};

export function AppAccessBadges({ apps }: { apps: Array<{ appCode: string }> }) {
  if (apps.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <div className="flex gap-1">
      {apps.map(app => {
        const badge = APP_BADGES[app.appCode];
        if (!badge) return null;
        return (
          <Tooltip key={app.appCode} content={badge.title}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${badge.color}`}>
              {badge.label}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
```

### Row Actions Dropdown

```tsx
export function EmployeeRowActions({ employee }: { employee: Employee }) {
  const { hasPermission } = usePermissions();
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreHorizontalIcon className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/employees/${employee.id}`}>View Details</Link>
          </DropdownMenuItem>

          {employee.status === 'INVITED' && hasPermission('hrms:invitations:send') && (
            <DropdownMenuItem onClick={() => resendInvite(employee.id)}>
              Resend Invitation
            </DropdownMenuItem>
          )}

          {employee.status === 'ACTIVE' && hasPermission('hrms:users:suspend') && (
            <DropdownMenuItem
              className="text-orange-600"
              onClick={() => setSuspendDialogOpen(true)}
            >
              Suspend
            </DropdownMenuItem>
          )}

          {employee.status === 'SUSPENDED' && hasPermission('hrms:users:suspend') && (
            <DropdownMenuItem onClick={() => unsuspend(employee.id)}>
              Unsuspend
            </DropdownMenuItem>
          )}

          {employee.status !== 'DEACTIVATED' && hasPermission('hrms:users:deactivate') && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => confirmDeactivate(employee.id)}
            >
              Deactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SuspendEmployeeDialog
        open={suspendDialogOpen}
        employee={employee}
        onClose={() => setSuspendDialogOpen(false)}
        onSuccess={() => { setSuspendDialogOpen(false); invalidateEmployees(); }}
      />
    </>
  );
}
```

### Suspend Dialog

```tsx
// Requires reason input before suspend

export function SuspendEmployeeDialog({ open, employee, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {employee.fullName}?</DialogTitle>
          <DialogDescription>
            This will immediately log them out from all devices and block further logins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason (required)</Label>
          <Textarea
            placeholder="E.g. Policy violation, under investigation..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || loading}
            onClick={() => handleSuspend()}
          >
            {loading ? 'Suspending...' : 'Suspend Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Create Employee + Invite Flow

```tsx
// Single "Invite Member" button that:
// 1. Opens modal to fill: firstName, lastName, email, jobTitle (optional), department (optional)
// 2. On save: POST /hrms/employees (creates record with INVITED status)
// 3. Immediately calls POST /hrms/employees/:id/invite (sends email)
// 4. Shows success toast: "Invitation sent to john@example.com"
// 5. Refreshes employee list

export function CreateEmployeeButton() {
  const { hasPermission } = usePermissions();
  if (!hasPermission('hrms:users:create')) return null;

  return (
    <Button onClick={() => setOpen(true)}>
      <PlusIcon className="mr-2 h-4 w-4" /> Invite Member
    </Button>
  );
}
```

### Filter Bar

```tsx
// Row of filters above table
<div className="flex flex-wrap gap-3">
  <Input
    placeholder="Search name or email..."
    value={filters.search}
    onChange={e => setFilters(f => ({...f, search: e.target.value, page: 1}))}
    className="w-64"
  />

  <Select value={filters.status} onValueChange={v => setFilters(f => ({...f, status: v, page: 1}))}>
    <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="">All Statuses</SelectItem>
      <SelectItem value="ACTIVE">Active</SelectItem>
      <SelectItem value="INVITED">Invited</SelectItem>
      <SelectItem value="SUSPENDED">Suspended</SelectItem>
      <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
    </SelectContent>
  </Select>

  <Select value={filters.appCode} onValueChange={v => setFilters(f => ({...f, appCode: v, page: 1}))}>
    <SelectTrigger className="w-40"><SelectValue placeholder="All Apps" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="">All Apps</SelectItem>
      <SelectItem value="SALES">Sales Dashboard</SelectItem>
      <SelectItem value="PM">PM Dashboard</SelectItem>
      <SelectItem value="HRMS">HRMS</SelectItem>
    </SelectContent>
  </Select>
</div>
```

## Testing Requirements

### Component Tests
- Suspend dialog "Suspend" button is disabled when reason is empty
- AppAccessBadges shows correct letter and color per appCode
- RowActions shows "Resend Invitation" only for INVITED status
- RowActions shows "Suspend" only for ACTIVE status
- RowActions hides actions when user lacks required permissions

### Integration Tests
- Search "john" → table filters to matching employees
- Filter by SUSPENDED status → only suspended employees shown
- Click "Invite Member" → fill form → submit → toast shown → employee appears in list with INVITED status
- Suspend from row actions → confirm dialog → reason entered → employee status changes to SUSPENDED
- Paginate to page 2 → URL updates → correct employees shown

### Edge Cases
- Empty search: clear X button resets filter
- Deactivating an already-deactivated user: button not shown in actions
- Table with 0 results: shows empty state with appropriate message (different for "no employees" vs "no search results")
