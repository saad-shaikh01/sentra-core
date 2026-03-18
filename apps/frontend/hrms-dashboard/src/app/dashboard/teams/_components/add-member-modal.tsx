'use client';

import { useMemo, useState } from 'react';
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
import type { TeamDetail } from './types';

export function AddMemberModal({
  open,
  team,
  onOpenChange,
}: {
  open: boolean;
  team: TeamDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const employeesQuery = useQuery({
    queryKey: ['active-employees', debouncedSearch],
    queryFn: async () => {
      const response = await hrmsApi.get<PaginatedResponse<Employee>>('/employees', {
        search: debouncedSearch || undefined,
        status: 'ACTIVE',
        limit: 20,
      });
      return response.data;
    },
    enabled: open,
  });

  const availableEmployees = useMemo(
    () =>
      (employeesQuery.data ?? []).filter(
        (employee) => !team.members.some((member) => member.userId === employee.id),
      ),
    [employeesQuery.data, team.members],
  );

  const addMemberMutation = useMutation({
    mutationFn: () => hrmsApi.post(`/teams/${team.id}/members`, { userId: selectedUserId }),
    onSuccess: () => {
      toast.success('Team member added.');
      queryClient.invalidateQueries({ queryKey: ['team-detail', team.id] });
      queryClient.invalidateQueries({ queryKey: ['hrms-teams'] });
      onOpenChange(false);
      setSearch('');
      setSelectedUserId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add team member.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>Add an active employee to {team.name}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-search">Search employees</Label>
            <Input
              id="member-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search active employees..."
            />
          </div>

          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={selectedUserId ?? undefined} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.map((employee) => (
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
            onClick={() => addMemberMutation.mutate()}
            disabled={!selectedUserId || addMemberMutation.isPending}
          >
            {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
