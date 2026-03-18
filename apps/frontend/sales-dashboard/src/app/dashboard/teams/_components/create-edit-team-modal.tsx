'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useCreateTeam,
  useEmployees,
  useTeamTypes,
  useUpdateTeam,
  type EmployeeOption,
  type TeamDetail,
  type TeamSummary,
} from '@/hooks/use-teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TeamTypeBadge } from './team-type-badge';

type TeamEditable = TeamSummary | TeamDetail | null;

type FormState = {
  name: string;
  typeId: string;
  description: string;
  managerId: string | null;
};

function getInitialForm(team: TeamEditable): FormState {
  return {
    name: team?.name ?? '',
    typeId: team?.type.id ?? '',
    description: team?.description ?? '',
    managerId: team?.manager?.id ?? null,
  };
}

function sortTeamTypes(types: Array<{ id: string; name: string; slug: string; isSystem: boolean }>) {
  return [...types].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return Number(b.isSystem) - Number(a.isSystem);
    return a.name.localeCompare(b.name);
  });
}

function getEmployeeLabel(employee: EmployeeOption | undefined, fallback?: string | null) {
  return employee ? `${employee.fullName} · ${employee.email}` : (fallback ?? 'No manager');
}

export function CreateEditTeamModal({
  open,
  editTarget,
  onOpenChange,
}: {
  open: boolean;
  editTarget: TeamEditable;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(getInitialForm(editTarget));
  const [managerSearch, setManagerSearch] = useState('');
  const debouncedSearch = useDebounce(managerSearch, 300);
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam(editTarget?.id ?? '');
  const teamTypesQuery = useTeamTypes(open);
  const employeesQuery = useEmployees({
    search: debouncedSearch || undefined,
    status: 'ACTIVE',
    limit: 20,
  }, open);

  useEffect(() => {
    if (open) {
      setForm(getInitialForm(editTarget));
      setManagerSearch('');
    }
  }, [editTarget, open]);

  const sortedTeamTypes = useMemo(() => sortTeamTypes(teamTypesQuery.data ?? []), [teamTypesQuery.data]);
  const managerOptions = employeesQuery.data?.data ?? [];
  const selectedManager = managerOptions.find((employee) => employee.id === form.managerId);
  const isPending = createTeam.isPending || updateTeam.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Team' : 'Create Team'}</DialogTitle>
          <DialogDescription>
            Configure the team name, type, description, and manager.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ebook Team Alpha"
            />
          </div>

          <div className="space-y-2">
            <Label>Team Type</Label>
            <Select
              value={form.typeId || undefined}
              onValueChange={(value) => setForm((current) => ({ ...current, typeId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a team type" />
              </SelectTrigger>
              <SelectContent>
                {sortedTeamTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    <div className="flex items-center gap-2">
                      <TeamTypeBadge type={type} />
                      <span>{type.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              placeholder="Optional context about what this team handles."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager-search">Manager Search</Label>
            <Input
              id="manager-search"
              value={managerSearch}
              onChange={(event) => setManagerSearch(event.target.value)}
              placeholder="Search active employees..."
            />
            <Select
              value={form.managerId ?? 'none'}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  managerId: value === 'none' ? null : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={getEmployeeLabel(selectedManager, editTarget?.manager?.name)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager</SelectItem>
                {managerOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName} · {employee.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.name.trim() || !form.typeId || isPending}
            onClick={async () => {
              const payload = {
                name: form.name.trim(),
                typeId: form.typeId,
                description: form.description.trim() || undefined,
                managerId: form.managerId ?? undefined,
              };

              if (editTarget?.id) {
                await updateTeam.mutateAsync(payload);
              } else {
                await createTeam.mutateAsync(payload);
              }

              onOpenChange(false);
            }}
          >
            {isPending ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
