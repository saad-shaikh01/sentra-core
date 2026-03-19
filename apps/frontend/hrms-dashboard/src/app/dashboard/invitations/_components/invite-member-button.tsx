'use client';

import { CreateEmployeeModal } from '../../employees/_components/create-employee-modal';
import type { DepartmentOption } from '../../employees/_components/types';

export function InviteMemberButton({
  departments,
  isLoadingDepartments,
  onSuccess,
}: {
  departments: DepartmentOption[];
  isLoadingDepartments?: boolean;
  onSuccess?: () => void;
}) {
  return (
    <CreateEmployeeModal
      departments={departments}
      isLoadingDepartments={isLoadingDepartments}
      onSuccess={onSuccess}
    />
  );
}
