'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getCurrentJti } from '@/lib/tokens';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Session {
  id: string;
  appCode: string;
  appLabel: string;
  deviceInfo: {
    browser?: string;
    os?: string;
    deviceType?: string;
  } | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Just signed in';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MySessionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currentJti = getCurrentJti();

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ['my-sessions'],
    queryFn: () => api.getMySessions() as Promise<Session[]>,
    enabled: open,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-sessions'] }),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-sessions'] }),
  });

  const otherSessions = sessions?.filter((s) => s.id !== currentJti) ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Active Sessions</DialogTitle>
          <DialogDescription>Manage where you&apos;re signed in</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading sessions...</p>
          )}
          {!isLoading && (!sessions || sessions.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No active sessions</p>
          )}
          {sessions?.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.deviceInfo?.browser || 'Unknown browser'} on{' '}
                  {session.deviceInfo?.os || 'Unknown OS'}
                  {session.id === currentJti && (
                    <span className="ml-2 text-xs bg-green-500/20 text-green-400 rounded px-1 py-0.5">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.appLabel} · {formatRelativeTime(session.lastUsedAt)}
                </p>
              </div>
              {session.id !== currentJti && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeMutation.mutate(session.id)}
                  disabled={revokeMutation.isPending}
                >
                  Sign out
                </Button>
              )}
            </div>
          ))}
        </div>

        {otherSessions.length > 0 && (
          <>
            <hr className="border-white/10 my-1" />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => revokeOthersMutation.mutate()}
              disabled={revokeOthersMutation.isPending}
            >
              Sign out all other devices
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
