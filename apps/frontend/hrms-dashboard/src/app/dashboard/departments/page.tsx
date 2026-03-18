'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, DataTable, PageHeader, type Column } from '@/components/shared';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DepartmentRecord } from '../teams/_components/types';
import { DepartmentRowActions } from './_components/department-row-actions';

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:departments:manage');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DepartmentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: DepartmentRecord[] }>('/departments');
      return response.data;
    },
  });

  useEffect(() => {
    if (dialogOpen) {
      setName(editTarget?.name ?? '');
      setDescription(editTarget?.description ?? '');
    }
  }, [dialogOpen, editTarget]);

  const saveMutation = useMutation({
    mutationFn: () =>
      editTarget
        ? hrmsApi.patch(`/departments/${editTarget.id}`, {
            name: name.trim(),
            description: description.trim() || undefined,
          })
        : hrmsApi.post('/departments', {
            name: name.trim(),
            description: description.trim() || undefined,
          }),
    onSuccess: () => {
      toast.success(editTarget ? 'Department updated.' : 'Department created.');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setDialogOpen(false);
      setEditTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save department.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (departmentId: string) => hrmsApi.delete(`/departments/${departmentId}`),
    onSuccess: () => {
      toast.success('Department deleted.');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete department.');
    },
  });

  const columns: Column<DepartmentRecord>[] = [
    { key: 'name', header: 'Name' },
    {
      key: 'description',
      header: 'Description',
      render: (department) => department.description || '-',
    },
    {
      key: 'employeeCount',
      header: 'Employees',
      render: (department) => String(department.employeeCount),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[6rem]',
      render: (department) => (
        <DepartmentRowActions
          department={department}
          canManage={canManage}
          onEdit={() => {
            setEditTarget(department);
            setDialogOpen(true);
          }}
          onDelete={() => setDeleteTarget(department)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description={`${departmentsQuery.data?.length ?? 0} departments`}
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditTarget(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Department
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        data={departmentsQuery.data ?? []}
        isLoading={departmentsQuery.isLoading}
        isError={departmentsQuery.isError}
        keyExtractor={(department) => department.id}
        emptyTitle="No departments yet"
        emptyDescription="Add a department to organize employee records."
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Department' : 'Create Department'}</DialogTitle>
            <DialogDescription>Manage department names and descriptions.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="department-name">Name</Label>
              <Input
                id="department-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department-description">Description</Label>
              <Input
                id="department-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Department'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.name ?? 'department'}?`}
        description="This cannot be undone once the department is removed."
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
