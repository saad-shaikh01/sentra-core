# HRMS-FE-006: Teams & Departments Pages (HRMS Dashboard)

## Overview
Teams and Departments management pages within the HRMS Dashboard. Teams page is the admin view of all org teams (similar to Sales Teams page but with full management controls and no sales stats). Departments page is a simple CRUD for org departments.

## Acceptance Criteria

### Teams Page (`/dashboard/teams`)
- [ ] List of all teams: name, type badge, manager, member count, status
- [ ] Create team modal (per HRMS-BE-005 spec): name, type dropdown, description, manager picker
- [ ] Edit team (same modal, pre-filled)
- [ ] Delete team (confirmation required, soft-delete)
- [ ] Click team → team detail sheet showing members + manager
- [ ] Add member to team from detail sheet (employee picker)
- [ ] Remove member from detail sheet
- [ ] Change member role (MEMBER ↔ LEAD) from detail sheet
- [ ] Team type management: "Manage Types" button opens types CRUD modal
- [ ] All actions gated by `hrms:teams:manage`

### Departments Page (`/dashboard/departments`)
- [ ] Simple table: name, description, employee count, actions
- [ ] Create department (inline form or modal)
- [ ] Edit department
- [ ] Delete department (only if no employees assigned)
- [ ] Actions gated by `hrms:departments:manage`

## Technical Specification

### Teams Page

```tsx
// src/app/dashboard/teams/page.tsx

export default function HrmsTeamsPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);

  const { data: teams, isLoading, refetch } = useQuery({
    queryKey: ['hrms-teams'],
    queryFn: () => api.get('/api/hrms/teams').then(r => r.data),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description={`${teams?.meta.total || 0} teams`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTypesOpen(true)}>
              Manage Team Types
            </Button>
            {hasPermission('hrms:teams:manage') && (
              <Button onClick={() => setCreateOpen(true)}>
                <PlusIcon className="mr-2 h-4 w-4" /> Create Team
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <TeamsGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams?.data.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onClick={() => setSelectedTeam(team)}
              onEdit={() => { setEditTarget(team); setCreateOpen(true); }}
              onDelete={() => confirmDelete(team)}
            />
          ))}
        </div>
      )}

      {/* Team Detail Sheet */}
      <TeamDetailSheet
        team={selectedTeam}
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        onUpdate={refetch}
      />

      {/* Create/Edit Modal */}
      <CreateEditTeamModal
        open={createOpen}
        editTarget={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onSuccess={refetch}
      />

      {/* Team Types Modal */}
      <TeamTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} />
    </div>
  );
}
```

### Team Card (HRMS version — no sales stats)

```tsx
function TeamCard({ team, onClick, onEdit, onDelete }) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:teams:manage');

  return (
    <Card className="cursor-pointer hover:shadow-sm" onClick={onClick}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <TeamTypeBadge type={team.type} />
            <h3 className="font-medium">{team.name}</h3>
          </div>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={e => { e.stopPropagation(); onDelete(); }}
                >Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          {team.manager ? (
            <span className="flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {team.manager.name}
            </span>
          ) : (
            <span className="italic">No manager</span>
          )}
          <span>·</span>
          <span>{team.memberCount} members</span>
        </div>
        {team.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{team.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

### Team Detail Sheet

```tsx
function TeamDetailSheet({ team, open, onClose, onUpdate }) {
  const { data: detail } = useQuery({
    queryKey: ['team-detail', team?.id],
    queryFn: () => api.get(`/api/hrms/teams/${team.id}`).then(r => r.data.data),
    enabled: !!team?.id,
  });

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <TeamTypeBadge type={detail?.type} />
            <SheetTitle>{detail?.name}</SheetTitle>
          </div>
          {detail?.description && <SheetDescription>{detail.description}</SheetDescription>}
        </SheetHeader>

        {/* Manager */}
        <div className="mt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Manager</p>
          {detail?.manager ? (
            <UserListItem user={detail.manager} />
          ) : (
            <p className="text-sm text-muted-foreground italic">No manager assigned</p>
          )}
        </div>

        {/* Members */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Members ({detail?.memberCount || 0})
            </p>
            {hasPermission('hrms:teams:manage') && (
              <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
                <PlusIcon className="mr-1 h-3 w-3" /> Add Member
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {detail?.members.map(member => (
              <div key={member.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserAvatar user={member} size="sm" />
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.jobTitle || member.email}</p>
                  </div>
                </div>
                {hasPermission('hrms:teams:manage') && (
                  <div className="flex items-center gap-1">
                    <Select
                      value={member.role}
                      onValueChange={role => updateMemberRole(team.id, member.userId, role)}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="LEAD">Team Lead</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMember(team.id, member.userId)}
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### Team Types Modal

```tsx
// Manage team types (add/edit/delete custom types)

function TeamTypesModal({ open, onClose }) {
  const { data: types } = useQuery({
    queryKey: ['team-types'],
    queryFn: () => api.get('/api/hrms/team-types').then(r => r.data.data),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Team Types</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {types?.map(type => (
            <div key={type.id} className="flex items-center justify-between p-2 rounded border">
              <div className="flex items-center gap-2">
                <TeamTypeBadge type={type} />
                {type.isSystem && <span className="text-xs text-muted-foreground">(system)</span>}
              </div>
              {!type.isSystem && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editType(type)}>
                    <PencilIcon className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteType(type)}>
                    <TrashIcon className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t pt-3">
          <AddTypeForm onSuccess={refetch} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Departments Page

```tsx
// src/app/dashboard/departments/page.tsx

export default function DepartmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        actions={
          hasPermission('hrms:departments:manage') && (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" /> Add Department
            </Button>
          )
        }
      />

      <DataTable
        columns={[
          { header: 'Name', accessorKey: 'name' },
          { header: 'Description', cell: ({ row }) => row.original.description || '—' },
          { header: 'Employees', cell: ({ row }) => row.original.employeeCount },
          {
            id: 'actions',
            cell: ({ row }) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => editDept(row.original)}>
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Tooltip content={row.original.employeeCount > 0 ? 'Cannot delete: has employees' : 'Delete'}>
                  <span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={row.original.employeeCount > 0}
                      onClick={() => deleteDept(row.original.id)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </span>
                </Tooltip>
              </div>
            ),
          }
        ]}
        data={departments || []}
      />
    </div>
  );
}
```

## Testing Requirements

### Component Tests
- Team card shows "No manager" when manager is null
- Team types modal shows edit/delete only for non-system types
- Delete department button is disabled when employeeCount > 0
- Add member to team opens employee picker

### Integration Tests
- Create team with type "Ebook" → appears in grid with Ebook badge
- Edit team name → card updates
- Delete team → removed from grid
- Add member to team → member count increments
- Create custom team type → appears in type dropdown when creating teams

### Edge Cases
- Delete team type that has teams assigned → 409 error shown as toast
- Team with 0 members → "0 members" shown (no crash)
- Adding member who is already in the team → duplicate error shown gracefully
