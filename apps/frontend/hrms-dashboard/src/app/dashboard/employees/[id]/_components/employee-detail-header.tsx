'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { ConfirmDialog, StatusBadge, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import type { DepartmentOption, Employee } from '../../_components/types';
import { SuspendDialog } from '../../_components/suspend-dialog';
import { EditEmployeeModal } from './edit-employee-modal';

export function EmployeeDetailHeader({
  employee,
  departments,
}: {
  employee: Employee;
  departments: DepartmentOption[];
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const unsuspendMutation = useMutation({
    mutationFn: () => hrmsApi.patch(`/employees/${employee.id}/unsuspend`),
    onSuccess: () => {
      toast.success(`${employee.fullName} has been unsuspended.`);
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
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
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to deactivate employee.');
    },
  });

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/employees" aria-label="Back to employees">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <UserAvatar
            name={employee.fullName}
            avatarUrl={employee.avatarUrl}
            className="h-14 w-14"
          />

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
              <StatusBadge status={employee.status} />
            </div>
            <p className="text-sm text-muted-foreground">{employee.email}</p>
            {employee.jobTitle ? (
              <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {hasPermission('hrms:users:edit') ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : null}

          {employee.status === 'ACTIVE' && hasPermission('hrms:users:suspend') ? (
            <Button variant="outline" onClick={() => setSuspendOpen(true)}>
              Suspend
            </Button>
          ) : null}

          {employee.status === 'SUSPENDED' && hasPermission('hrms:users:suspend') ? (
            <Button variant="outline" onClick={() => unsuspendMutation.mutate()}>
              {unsuspendMutation.isPending ? 'Unsuspending...' : 'Unsuspend'}
            </Button>
          ) : null}

          {employee.status !== 'DEACTIVATED' && hasPermission('hrms:users:deactivate') ? (
            <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      </div>

      <EditEmployeeModal
        open={editOpen}
        employee={employee}
        departments={departments}
        onOpenChange={setEditOpen}
      />

      <SuspendDialog
        open={suspendOpen}
        employeeId={employee.id}
        employeeName={employee.fullName}
        onOpenChange={setSuspendOpen}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Deactivate ${employee.fullName}?`}
        description="This will revoke all active sessions and prevent new logins."
        confirmLabel={deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
        onConfirm={() => deactivateMutation.mutate()}
      />
    </>
  );
}
