'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Mail } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, DataTable, EmptyState, type Column } from '@/components/shared';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

export interface PendingInvitation {
  invitationId: string;
  userId: string;
  name: string;
  email: string;
  invitedAt: string;
  expiresAt: string;
  expiresIn?: string;
}

function differenceInHours(target: string) {
  const diffMs = new Date(target).getTime() - Date.now();
  return Math.floor(diffMs / (60 * 60 * 1000));
}

function formatDistanceToNow(target: string) {
  const diffMs = new Date(target).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const hours = Math.max(1, Math.round(absMs / (60 * 60 * 1000)));
  const days = Math.round(hours / 24);

  if (hours >= 24) {
    return `${diffMs >= 0 ? 'in ' : ''}${days} day${days === 1 ? '' : 's'}${diffMs < 0 ? ' ago' : ''}`;
  }

  return `${diffMs >= 0 ? 'in ' : ''}${hours} hour${hours === 1 ? '' : 's'}${diffMs < 0 ? ' ago' : ''}`;
}

function formatSentAt(value: string) {
  return formatDistanceToNow(value).replace(/^in /, '') + (formatDistanceToNow(value).startsWith('in ') ? '' : '');
}

export function InvitationsTable({
  invitations,
  isLoading,
  isError,
}: {
  invitations: PendingInvitation[];
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const [cancelUserId, setCancelUserId] = useState<string | null>(null);

  const resendMutation = useMutation({
    mutationFn: (userId: string) => hrmsApi.post(`/employees/${userId}/invite/resend`),
    onSuccess: () => {
      toast.success('Invitation resent. New link expires in 72 hours.');
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to resend invitation.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (userId: string) => hrmsApi.delete(`/employees/${userId}/invite`),
    onSuccess: () => {
      toast.success('Invitation cancelled.');
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
      setCancelUserId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel invitation.');
    },
  });

  const columns = useMemo<Column<PendingInvitation>[]>(
    () => [
      {
        key: 'employee',
        header: 'Employee',
        render: (invitation) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{invitation.name}</p>
            <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
          </div>
        ),
      },
      {
        key: 'invitedAt',
        header: 'Invited',
        render: (invitation) => (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(invitation.invitedAt).replace(/^in /, '')}
          </span>
        ),
      },
      {
        key: 'expiresAt',
        header: 'Expires In',
        render: (invitation) => {
          const hoursLeft = differenceInHours(invitation.expiresAt);
          const isUrgent = hoursLeft < 6;

          return (
            <span className={isUrgent ? 'text-sm font-medium text-red-300' : 'text-sm text-muted-foreground'}>
              {isUrgent ? 'Warning: ' : ''}
              {formatDistanceToNow(invitation.expiresAt)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        className: 'w-[12rem]',
        render: (invitation) => (
          <div
            className="flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => resendMutation.mutate(invitation.userId)}
              disabled={resendMutation.isPending}
            >
              Resend
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-300"
              onClick={() => setCancelUserId(invitation.userId)}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        ),
      },
    ],
    [cancelMutation.isPending, resendMutation.isPending],
  );

  const cancelInvitation = invitations.find((invitation) => invitation.userId === cancelUserId) ?? null;

  return (
    <>
      {isLoading || isError || invitations.length > 0 ? (
        <DataTable
          columns={columns}
          data={invitations}
          isLoading={isLoading}
          isError={isError}
          keyExtractor={(invitation) => invitation.invitationId}
          emptyTitle="No pending invitations"
          emptyDescription="Use 'Invite Member' to add team members."
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <EmptyState
            title="No pending invitations"
            description="Use 'Invite Member' to add team members."
            icon={<Mail className="h-6 w-6 text-muted-foreground" />}
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelInvitation)}
        onOpenChange={(open) => {
          if (!open) setCancelUserId(null);
        }}
        title="Cancel invitation?"
        description="The invitation link will stop working immediately."
        confirmLabel={cancelMutation.isPending ? 'Cancelling...' : 'Cancel Invitation'}
        onConfirm={() => {
          if (cancelInvitation) {
            cancelMutation.mutate(cancelInvitation.userId);
          }
        }}
      />
    </>
  );
}
