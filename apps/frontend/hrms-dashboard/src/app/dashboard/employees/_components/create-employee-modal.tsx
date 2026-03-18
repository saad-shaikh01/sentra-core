'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { DepartmentOption, Employee } from './types';

type EmployeeFormState = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  departmentId: string | null;
};

const INITIAL_STATE: EmployeeFormState = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  departmentId: null,
};

class InviteAfterCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteAfterCreateError';
  }
}

export function CreateEmployeeModal({
  departments,
  onSuccess,
}: {
  departments: DepartmentOption[];
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(INITIAL_STATE);

  useEffect(() => {
    if (!open) {
      setForm(INITIAL_STATE);
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await hrmsApi.post<{ data: Employee }>('/employees', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        jobTitle: form.jobTitle.trim() || undefined,
        departmentId: form.departmentId || undefined,
      });

      try {
        await hrmsApi.post(`/employees/${created.data.id}/invite`);
      } catch (error) {
        throw new InviteAfterCreateError(
          error instanceof Error
            ? error.message
            : 'Employee was created but the invitation could not be sent.',
        );
      }

      return created.data;
    },
    onSuccess: (employee) => {
      toast.success(`Invitation sent to ${employee.email}`);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onSuccess?.();
      setOpen(false);
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (error instanceof InviteAfterCreateError) {
        toast.error(
          'Employee created, but the invitation could not be sent.',
          'Use resend from the row actions after the list refreshes.',
        );
        onSuccess?.();
        setOpen(false);
        return;
      }

      toast.error(error instanceof Error ? error.message : 'Failed to create employee.');
    },
  });

  if (!hasPermission('hrms:users:create')) {
    return null;
  }

  const canSubmit =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Invite Member
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a New Employee</DialogTitle>
            <DialogDescription>
              Create the employee record and send an invitation email in one step.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-first-name">First name</Label>
              <Input
                id="employee-first-name"
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, firstName: event.target.value }))
                }
                placeholder="John"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-last-name">Last name</Label>
              <Input
                id="employee-last-name"
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lastName: event.target.value }))
                }
                placeholder="Doe"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employee-email">Email</Label>
              <Input
                id="employee-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-job-title">Job title</Label>
              <Input
                id="employee-job-title"
                value={form.jobTitle}
                onChange={(event) =>
                  setForm((current) => ({ ...current, jobTitle: event.target.value }))
                }
                placeholder="HR Manager"
              />
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={form.departmentId ?? 'none'}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    departmentId: value === 'none' ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? 'Sending invite...' : 'Invite Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
