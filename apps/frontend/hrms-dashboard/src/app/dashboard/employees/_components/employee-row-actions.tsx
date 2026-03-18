'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SuspendDialog } from './suspend-dialog';
import type { Employee } from './types';

export function EmployeeRowActions({
  employee,
}: {
  employee: Employee;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  const resendInviteMutation = useMutation({
    mutationFn: () => hrmsApi.post(`/employees/${employee.id}/invite/resend`),
    onSuccess: () => {
      toast.success(`Invitation resent to ${employee.email}`);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to resend invitation.');
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: () => hrmsApi.patch(`/employees/${employee.id}/unsuspend`),
    onSuccess: () => {
      toast.success(`${employee.fullName} has been unsuspended.`);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to unsuspend employee.');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => hrmsApi.patch(`/employees/${employee.id}/deactivate`),
    onSuccess: () => {
      toast.success(`${employee.fullName} has been deactivated.`);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to deactivate employee.');
    },
  });

  const isBusy =
    resendInviteMutation.isPending ||
    unsuspendMutation.isPending ||
    deactivateMutation.isPending;

  return (
    <>
      <div onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${employee.fullName}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/dashboard/employees/${employee.id}`)}>
              View Details
            </DropdownMenuItem>

            {employee.status === 'INVITED' && hasPermission('hrms:users:invite') ? (
              <DropdownMenuItem
                onClick={() => resendInviteMutation.mutate()}
                disabled={isBusy}
              >
                Resend Invitation
              </DropdownMenuItem>
            ) : null}

            {employee.status === 'ACTIVE' && hasPermission('hrms:users:suspend') ? (
              <DropdownMenuItem
                className="text-orange-300"
                onClick={() => setSuspendDialogOpen(true)}
                disabled={isBusy}
              >
                Suspend
              </DropdownMenuItem>
            ) : null}

            {employee.status === 'SUSPENDED' && hasPermission('hrms:users:suspend') ? (
              <DropdownMenuItem
                onClick={() => unsuspendMutation.mutate()}
                disabled={isBusy}
              >
                Unsuspend
              </DropdownMenuItem>
            ) : null}

            {employee.status !== 'DEACTIVATED' && hasPermission('hrms:users:deactivate') ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-300 focus:text-red-200"
                  onClick={() => setDeactivateDialogOpen(true)}
                  disabled={isBusy}
                >
                  Deactivate
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SuspendDialog
        open={suspendDialogOpen}
        employeeId={employee.id}
        employeeName={employee.fullName}
        onOpenChange={setSuspendDialogOpen}
      />

      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title={`Deactivate ${employee.fullName}?`}
        description="This will revoke all active sessions and prevent the account from signing in again."
        confirmLabel={deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
        onConfirm={() => deactivateMutation.mutate()}
      />
    </>
  );
}
