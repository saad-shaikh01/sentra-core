'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { DetailSheet } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionGroup } from './permission-group';
import type { EmployeeAppFilter, RbacPermission, RbacRole } from '../../employees/_components/types';

type RoleRecord = RbacRole & { userCount?: number | null };

function groupPermissions(permissions: RbacPermission[]) {
  return permissions.reduce<Record<string, RbacPermission[]>>((groups, permission) => {
    const segments = permission.code.split(':');
    const resource = segments[1] || 'general';
    groups[resource] = [...(groups[resource] ?? []), permission];
    return groups;
  }, {});
}

export function RoleDetailSheet({
  role,
  appCode,
  open,
  onClose,
}: {
  role: RoleRecord | null;
  appCode: EmployeeAppFilter;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setIsEditing(false);
  }, [role]);

  const rolePermissionsQuery = useQuery({
    queryKey: ['role-permissions', appCode, role?.id],
    queryFn: async () => {
      const response = await api.get<{ data: RbacPermission[] }>(
        `/rbac/apps/${appCode}/roles/${role?.id}/permissions`,
      );
      return response.data;
    },
    enabled: open && Boolean(role?.id),
  });

  const allPermissionsQuery = useQuery({
    queryKey: ['all-permissions', appCode],
    queryFn: async () => {
      const response = await api.get<{ data: RbacPermission[] }>(`/rbac/apps/${appCode}/permissions`);
      return response.data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setAssignedIds(new Set((rolePermissionsQuery.data ?? role?.permissions ?? []).map((permission) => permission.id)));
  }, [role?.permissions, rolePermissionsQuery.data]);

  const canEditMeta = isEditing && Boolean(role && !role.isSystem);
  const canEditPermissions = isEditing && Boolean(role);

  const groupedPermissions = useMemo(
    () => groupPermissions(allPermissionsQuery.data ?? rolePermissionsQuery.data ?? role?.permissions ?? []),
    [allPermissionsQuery.data, role?.permissions, rolePermissionsQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!role) return;

      if (!role.isSystem && (name.trim() !== role.name || description.trim() !== (role.description ?? ''))) {
        await api.patch(`/rbac/apps/${appCode}/roles/${role.id}`, {
          name: name.trim(),
          description: description.trim() || null,
        });
      }

      await api.put(`/rbac/apps/${appCode}/roles/${role.id}/permissions`, {
        permissionIds: [...assignedIds],
      });
    },
    onSuccess: () => {
      if (!role) return;
      toast.success('Role updated.');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['roles', appCode] });
      queryClient.invalidateQueries({ queryKey: ['role-permissions', appCode, role.id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save role changes.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!role) return;
      await api.delete(`/rbac/apps/${appCode}/roles/${role.id}`);
    },

    onSuccess: () => {
      toast.success('Role deleted.');
      queryClient.invalidateQueries({ queryKey: ['roles', appCode] });
      onClose();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to delete role.';
      toast.error(
        message.includes('assigned')
          ? 'Role is assigned to users. Remove all assignments first.'
          : message,
      );
    },
  });

  return (
    <DetailSheet
      open={open}
      onClose={onClose}
      title={role?.name ?? 'Role details'}
      description={role?.description ?? 'Review role permissions and access.'}
    >
      {role ? (
        <div className="space-y-6">
          {role.isSystem ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-400">
                System role — name cannot be changed, but permissions can be adjusted.
              </p>
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="detail-role-name">Role name</Label>
              <Input
                id="detail-role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEditMeta}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="detail-role-description">Description</Label>
              <Input
                id="detail-role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEditMeta}
              />
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(groupedPermissions).map(([resource, permissions]) => (
              <PermissionGroup
                key={resource}
                resource={resource}
                permissions={permissions}
                assignedIds={assignedIds}
                editable={canEditPermissions}
                onToggle={(permissionId, checked) => {
                  setAssignedIds((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(permissionId);
                    } else {
                      next.delete(permissionId);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-medium">Who has this role?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {role.userCount
                ? `${role.userCount} user${role.userCount === 1 ? '' : 's'} assigned to this role.`
                : 'No users are currently assigned to this role.'}
            </p>
          </div>

          {isEditing ? (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setName(role?.name ?? '');
                  setDescription(role?.description ?? '');
                  setAssignedIds(
                    new Set((rolePermissionsQuery.data ?? role?.permissions ?? []).map((p) => p.id)),
                  );
                  setIsEditing(false);
                }}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              {!role.isSystem ? (
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={role.userCount !== 0 || deleteMutation.isPending}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          ) : (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit Role
            </Button>
          )}
        </div>
      ) : null}
    </DetailSheet>
  );
}
