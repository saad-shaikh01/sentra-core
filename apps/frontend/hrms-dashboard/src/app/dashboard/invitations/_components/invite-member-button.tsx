'use client';

import { CreateEmployeeModal } from '../../employees/_components/create-employee-modal';
import type { DepartmentOption } from '../../employees/_components/types';

export function InviteMemberButton({
  departments,
  onSuccess,
}: {
  departments: DepartmentOption[];
  onSuccess?: () => void;
}) {
  return <CreateEmployeeModal departments={departments} onSuccess={onSuccess} />;
}
