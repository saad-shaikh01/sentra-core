'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddRoleModal } from './add-role-modal';
import type { EmployeeAccessApp } from '../../_components/types';

export function AppAccessCard({
  userId,
  app,
  canManage,
}: {
  userId: string;
  app: EmployeeAccessApp;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);

  const removeRoleMutation = useMutation({
    mutationFn: (userAppRoleId: string) => hrmsApi.delete(`/employees/${userId}/roles/${userAppRoleId}`),
    onSuccess: () => {
      toast.success('Role removed.');
      queryClient.invalidateQueries({ queryKey: ['employee-access', userId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove role.');
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: () => hrmsApi.delete(`/employees/${userId}/access/${app.appCode}`),
    onSuccess: () => {
      toast.success(`${app.appCode} access revoked.`);
      queryClient.invalidateQueries({ queryKey: ['employee-access', userId] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke access.');
    },
  });

  return (
    <>
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{app.appLabel}</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {app.appCode}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {app.effectivePermissionCount} effective permissions
                {app.grantedBy ? ` · Granted by ${app.grantedBy}` : ''}
              </p>
            </div>

            {canManage ? (
              <Button variant="ghost" className="text-red-300" onClick={() => setRevokeDialogOpen(true)}>
                Revoke Access
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {app.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          ) : (
            app.roles.map((role) => (
              <div
                key={role.userAppRoleId}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{role.roleName}</span>
                  {role.isSystem ? (
                    <Badge variant="outline" className="text-[10px]">
                      system
                    </Badge>
                  ) : null}
                </div>

                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRoleMutation.mutate(role.userAppRoleId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))
          )}

          {canManage ? (
            <Button variant="outline" onClick={() => setAddRoleOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <AddRoleModal
        open={addRoleOpen}
        userId={userId}
        appCode={app.appCode}
        existingRoleIds={app.roles.map((role) => role.roleId)}
        onOpenChange={setAddRoleOpen}
      />

      <ConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title={`Revoke ${app.appLabel} access?`}
        description={`This will also remove all ${app.appCode} role assignments for this employee.`}
        confirmLabel={revokeAccessMutation.isPending ? 'Revoking...' : 'Revoke Access'}
        onConfirm={() => revokeAccessMutation.mutate()}
      />
    </>
  );
}
