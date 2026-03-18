'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreateRoleModal } from './create-role-modal';
import { RoleCard } from './role-card';
import { RoleDetailSheet } from './role-detail-sheet';
import type { EmployeeAppFilter, RbacRole } from '../../employees/_components/types';

type RoleRecord = RbacRole & { userCount?: number | null };

export function RolesAppTab({
  appCode,
}: {
  appCode: EmployeeAppFilter;
}) {
  const { hasPermission } = usePermissions();
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ['roles', appCode],
    queryFn: async () => {
      const response = await api.get<{ data: RoleRecord[] }>(`/rbac/apps/${appCode}/roles`);
      return response.data;
    },
  });

  const roles = rolesQuery.data ?? [];
  const systemRoles = roles.filter((role) => role.isSystem);
  const customRoles = roles.filter((role) => !role.isSystem);

  if (rolesQuery.isLoading) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">Loading roles...</CardContent>
      </Card>
    );
  }

  if (rolesQuery.isError) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Roles could not be loaded for this app.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">System Roles</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {systemRoles.map((role) => (
            <RoleCard key={role.id} role={role} onClick={() => setSelectedRole(role)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Custom Roles</h3>
          {hasPermission('hrms:roles:manage') ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Role
            </Button>
          ) : null}
        </div>

        {customRoles.length === 0 ? (
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No custom roles yet. Create one to customize access for your team.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {customRoles.map((role) => (
              <RoleCard key={role.id} role={role} onClick={() => setSelectedRole(role)} />
            ))}
          </div>
        )}
      </section>

      <CreateRoleModal appCode={appCode} open={createOpen} onOpenChange={setCreateOpen} />
      <RoleDetailSheet
        role={selectedRole}
        appCode={appCode}
        open={Boolean(selectedRole)}
        onClose={() => setSelectedRole(null)}
      />
    </div>
  );
}
