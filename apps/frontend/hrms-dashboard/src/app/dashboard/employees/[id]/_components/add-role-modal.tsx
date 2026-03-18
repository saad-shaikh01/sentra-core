'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, hrmsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import type { EmployeeAppFilter, RbacRole } from '../../_components/types';

export function AddRoleModal({
  open,
  userId,
  appCode,
  existingRoleIds,
  onOpenChange,
}: {
  open: boolean;
  userId: string;
  appCode: EmployeeAppFilter;
  existingRoleIds: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedRoleId(null);
    }
  }, [open]);

  const rolesQuery = useQuery({
    queryKey: ['rbac-roles', appCode],
    queryFn: async () => {
      const response = await api.get<{ data: RbacRole[] }>(`/rbac/apps/${appCode}/roles`);
      return response.data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const availableRoles = useMemo(
    () => (rolesQuery.data ?? []).filter((role) => !existingRoleIds.includes(role.id)),
    [existingRoleIds, rolesQuery.data],
  );

  const assignMutation = useMutation({
    mutationFn: () => hrmsApi.post(`/employees/${userId}/roles`, { appRoleId: selectedRoleId }),
    onSuccess: () => {
      toast.success('Role assigned.');
      queryClient.invalidateQueries({ queryKey: ['employee-access', userId] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to assign role.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Role</DialogTitle>
          <DialogDescription>
            Assign another role within the {appCode} app to this employee.
          </DialogDescription>
        </DialogHeader>

        {rolesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading available roles...</p>
        ) : availableRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional roles are available for this app.</p>
        ) : (
          <Select value={selectedRoleId ?? undefined} onValueChange={setSelectedRoleId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                  {role.isSystem ? ' · system' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assignMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={!selectedRoleId || assignMutation.isPending || availableRoles.length === 0}
          >
            {assignMutation.isPending ? 'Assigning...' : 'Assign Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
