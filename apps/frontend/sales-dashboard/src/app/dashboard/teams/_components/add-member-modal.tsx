'use client';

import { useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useAddTeamMember, useEmployees, type TeamDetail } from '@/hooks/use-teams';
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

export function AddMemberModal({
  open,
  team,
  onOpenChange,
}: {
  open: boolean;
  team: TeamDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<'MEMBER' | 'LEAD'>('MEMBER');
  const debouncedSearch = useDebounce(search, 300);
  const addTeamMember = useAddTeamMember(team.id);
  const employeesQuery = useEmployees({
    search: debouncedSearch || undefined,
    status: 'ACTIVE',
    limit: 20,
  }, open);

  const availableEmployees = useMemo(
    () =>
      (employeesQuery.data?.data ?? []).filter(
        (employee) => !team.members.some((member) => member.userId === employee.id),
      ),
    [employeesQuery.data?.data, team.members],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setSearch('');
          setSelectedUserId(null);
          setRole('MEMBER');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>Add an active employee to {team.name}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-search">Search Employees</Label>
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

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as 'MEMBER' | 'LEAD')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="LEAD">Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedUserId || addTeamMember.isPending}
            onClick={async () => {
              if (!selectedUserId) return;
              await addTeamMember.mutateAsync({ userId: selectedUserId, role });
              onOpenChange(false);
              setSearch('');
              setSelectedUserId(null);
              setRole('MEMBER');
            }}
          >
            {addTeamMember.isPending ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
