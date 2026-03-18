'use client';

import { Monitor, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionListResponse, SessionRecord } from '../../_components/types';
import { formatDateTime, formatDeviceInfo, formatRelativeTime } from '../../_components/utils';

function SessionCard({
  session,
  canManage,
  onRevoke,
  isPending,
}: {
  session: SessionRecord;
  canManage: boolean;
  onRevoke: () => void;
  isPending: boolean;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">{session.appLabel}</p>
          </div>
          <p className="text-sm text-muted-foreground">{formatDeviceInfo(session.deviceInfo)}</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>IP: {session.ipAddress || '-'}</p>
            <p>Last used: {session.lastUsedAt ? formatRelativeTime(session.lastUsedAt) : 'Never'}</p>
            <p>Created: {formatDateTime(session.createdAt)}</p>
            <p>Expires: {formatDateTime(session.expiresAt)}</p>
          </div>
        </div>

        {canManage && session.isActive ? (
          <Button variant="outline" size="sm" onClick={onRevoke} disabled={isPending}>
            Revoke Session
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SessionsTab({
  userId,
}: {
  userId: string;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManageSessions =
    hasPermission('hrms:users:manage_access') ||
    hasPermission('hrms:users:suspend') ||
    hasPermission('hrms:users:deactivate');

  const sessionsQuery = useQuery({
    queryKey: ['employee-sessions', userId],
    queryFn: () => api.get<SessionListResponse>(`/admin/users/${userId}/sessions`),
    retry: false,
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/admin/users/${userId}/sessions/${sessionId}`),
    onSuccess: () => {
      toast.success('Session revoked.');
      queryClient.invalidateQueries({ queryKey: ['employee-sessions', userId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke session.');
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${userId}/sessions`),
    onSuccess: () => {
      toast.success('All sessions revoked.');
      queryClient.invalidateQueries({ queryKey: ['employee-sessions', userId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke sessions.');
    },
  });

  if (sessionsQuery.isLoading) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Loading sessions...
        </CardContent>
      </Card>
    );
  }

  if (sessionsQuery.isError || !sessionsQuery.data) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm font-medium">Sessions unavailable</p>
          <p className="text-sm text-muted-foreground">
            Session management data is not available for this employee yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">{sessionsQuery.data.meta.active} active sessions</p>
          <p className="text-sm text-muted-foreground">
            Review current device sessions and revoke access when needed.
          </p>
        </div>

        {canManageSessions && sessionsQuery.data.meta.active > 0 ? (
          <Button variant="outline" onClick={() => revokeAllMutation.mutate()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Revoke All Sessions
          </Button>
        ) : null}
      </div>

      {sessionsQuery.data.data.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No active sessions.
          </CardContent>
        </Card>
      ) : (
        sessionsQuery.data.data.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            canManage={canManageSessions}
            isPending={revokeSessionMutation.isPending}
            onRevoke={() => revokeSessionMutation.mutate(session.id)}
          />
        ))
      )}
    </div>
  );
}
