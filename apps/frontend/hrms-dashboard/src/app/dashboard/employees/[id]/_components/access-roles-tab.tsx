'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppAccessCard } from './app-access-card';
import type { EmployeeAccessSummary, EmployeeAppFilter } from '../../_components/types';

const ALL_APPS: EmployeeAppFilter[] = ['SALES', 'PM', 'HRMS'];

export function AccessRolesTab({
  userId,
}: {
  userId: string;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManageAccess = hasPermission('hrms:users:manage_access');

  const accessQuery = useQuery({
    queryKey: ['employee-access', userId],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: EmployeeAccessSummary }>(`/employees/${userId}/access`);
      return response.data;
    },
    retry: false,
  });

  const grantAccessMutation = useMutation({
    mutationFn: (appCode: EmployeeAppFilter) => hrmsApi.post(`/employees/${userId}/access`, { appCode }),
    onSuccess: (_, appCode) => {
      toast.success(`${appCode} access granted.`);
      queryClient.invalidateQueries({ queryKey: ['employee-access', userId] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to grant access.');
    },
  });

  const grantedAppCodes = useMemo(
    () => new Set((accessQuery.data?.apps ?? []).map((app) => app.appCode)),
    [accessQuery.data?.apps],
  );

  const ungrantedApps = ALL_APPS.filter((appCode) => !grantedAppCodes.has(appCode));

  if (accessQuery.isLoading) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Loading access summary...
        </CardContent>
      </Card>
    );
  }

  if (accessQuery.isError) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Access data is unavailable for this employee.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {(accessQuery.data?.apps ?? []).map((app) => (
        <AppAccessCard key={app.appCode} userId={userId} app={app} canManage={canManageAccess} />
      ))}

      {ungrantedApps.length > 0 ? (
        <Card className="border-dashed border-white/20 bg-white/[0.02]">
          <CardContent className="space-y-3 pt-6">
            <div>
              <p className="text-sm font-medium">Available app access</p>
              <p className="text-sm text-muted-foreground">
                Grant access to additional Sentra apps for this employee.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {ungrantedApps.map((appCode) => (
                <Button
                  key={appCode}
                  variant="outline"
                  onClick={() => grantAccessMutation.mutate(appCode)}
                  disabled={!canManageAccess || grantAccessMutation.isPending}
                >
                  Grant {appCode}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
