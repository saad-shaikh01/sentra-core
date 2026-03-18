'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import type { DepartmentOption, Employee } from '../../_components/types';

type EditEmployeeFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  jobTitle: string;
  departmentId: string | null;
};

function getInitialState(employee: Employee): EditEmployeeFormState {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone ?? '',
    jobTitle: employee.jobTitle ?? '',
    departmentId: employee.departmentId ?? null,
  };
}

export function EditEmployeeModal({
  open,
  employee,
  departments,
  onOpenChange,
}: {
  open: boolean;
  employee: Employee;
  departments: DepartmentOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditEmployeeFormState>(getInitialState(employee));

  useEffect(() => {
    if (open) {
      setForm(getInitialState(employee));
    }
  }, [employee, open]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return hrmsApi.patch(`/employees/${employee.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        departmentId: form.departmentId || null,
      });
    },
    onSuccess: () => {
      toast.success('Employee profile updated.');
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update employee.');
    },
  });

  const canSubmit = form.firstName.trim() && form.lastName.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>Update the employee profile fields below.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-employee-first-name">First name</Label>
            <Input
              id="edit-employee-first-name"
              value={form.firstName}
              onChange={(event) =>
                setForm((current) => ({ ...current, firstName: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-employee-last-name">Last name</Label>
            <Input
              id="edit-employee-last-name"
              value={form.lastName}
              onChange={(event) =>
                setForm((current) => ({ ...current, lastName: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-employee-phone">Phone</Label>
            <Input
              id="edit-employee-phone"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="+1 555 000 0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-employee-job-title">Job title</Label>
            <Input
              id="edit-employee-job-title"
              value={form.jobTitle}
              onChange={(event) =>
                setForm((current) => ({ ...current, jobTitle: event.target.value }))
              }
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
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!canSubmit || updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
