'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DepartmentRecord } from '../../teams/_components/types';

export function DepartmentRowActions({
  department,
  canManage,
  onEdit,
  onDelete,
}: {
  department: DepartmentRecord;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!canManage) return null;

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-300"
        disabled={department.employeeCount > 0}
        onClick={onDelete}
        title={department.employeeCount > 0 ? 'Cannot delete: has employees' : 'Delete'}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
