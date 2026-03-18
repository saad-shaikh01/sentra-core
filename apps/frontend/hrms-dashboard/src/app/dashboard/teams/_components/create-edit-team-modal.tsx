'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { Employee, PaginatedResponse } from '../../employees/_components/types';
import type { TeamSummary, TeamTypeRecord } from './types';

type FormState = {
  name: string;
  typeId: string;
  description: string;
  managerId: string | null;
};

function getInitialState(team?: TeamSummary | null): FormState {
  return {
    name: team?.name ?? '',
    typeId: team?.type.id ?? '',
    description: team?.description ?? '',
    managerId: team?.manager?.id ?? null,
  };
}

export function CreateEditTeamModal({
  open,
  editTarget,
  onOpenChange,
}: {
  open: boolean;
  editTarget?: TeamSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(getInitialState(editTarget));
  const [managerSearch, setManagerSearch] = useState('');
  const debouncedManagerSearch = useDebounce(managerSearch, 300);

  useEffect(() => {
    if (open) {
      setForm(getInitialState(editTarget));
      setManagerSearch('');
    }
  }, [editTarget, open]);

  const teamTypesQuery = useQuery({
    queryKey: ['team-types'],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: TeamTypeRecord[] }>('/team-types');
      return response.data;
    },
    enabled: open,
  });

  const employeesQuery = useQuery({
    queryKey: ['manager-options', debouncedManagerSearch],
    queryFn: async () => {
      const response = await hrmsApi.get<PaginatedResponse<Employee>>('/employees', {
        search: debouncedManagerSearch || undefined,
        status: 'ACTIVE',
        limit: 20,
      });
      return response.data;
    },
    enabled: open,
  });

  const managerOptions = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        typeId: form.typeId,
        description: form.description.trim() || undefined,
        managerId: form.managerId || undefined,
      };

      return editTarget
        ? hrmsApi.patch(`/teams/${editTarget.id}`, payload)
        : hrmsApi.post('/teams', payload);
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Team updated.' : 'Team created.');
      queryClient.invalidateQueries({ queryKey: ['hrms-teams'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save team.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Team' : 'Create Team'}</DialogTitle>
          <DialogDescription>
            Configure the team name, type, description, and manager.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={form.typeId || undefined}
              onValueChange={(value) => setForm((current) => ({ ...current, typeId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team type" />
              </SelectTrigger>
              <SelectContent>
                {(teamTypesQuery.data ?? []).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Input
              id="team-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager-search">Manager search</Label>
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
                <SelectValue placeholder="Select a manager" />
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || !form.typeId || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
