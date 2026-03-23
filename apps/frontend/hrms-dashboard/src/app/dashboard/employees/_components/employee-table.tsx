'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column, UserAvatar, StatusBadge } from '@/components/shared';
import { AppAccessBadges } from './app-access-badges';
import { EmployeeRowActions } from './employee-row-actions';
import type { Employee } from './types';

export function EmployeeTable({
  employees,
  isLoading,
  isError,
  emptyTitle,
  emptyDescription,
}: {
  employees: Employee[];
  isLoading: boolean;
  isError: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();

  const columns = useMemo<Column<Employee>[]>(
    () => [
      {
        key: 'employee',
        header: 'Employee',
        className: 'min-w-[250px]',
        render: (employee) => (
          <div className="flex items-center gap-3">
            <UserAvatar
              name={employee.fullName}
              avatarUrl={employee.avatarUrl}
              className="h-9 w-9 border border-white/10"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-[13px] text-foreground/90">{employee.fullName}</p>
              <p className="truncate text-[11px] text-muted-foreground/60 font-medium">{employee.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'jobTitle',
        header: 'Title',
        className: 'min-w-[150px]',
        render: (employee) => <span className="text-foreground/70">{employee.jobTitle || '-'}</span>,
      },
      {
        key: 'department',
        header: 'Department',
        className: 'min-w-[140px]',
        render: (employee) =>
          <span className="text-foreground/70">{employee.department?.name || '-'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[120px]',
        render: (employee) => <StatusBadge status={employee.status} />,
      },
      {
        key: 'apps',
        header: 'Apps',
        className: 'min-w-[120px]',
        render: (employee) => <AppAccessBadges apps={employee.appAccess} />,
      },
      {
        key: 'actions',
        header: '',
        className: 'w-[4rem]',
        render: (employee) => <EmployeeRowActions employee={employee} />,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={employees}
      isLoading={isLoading}
      isError={isError}
      keyExtractor={(employee) => employee.id}
      onRowClick={(employee) => router.push(`/dashboard/employees/${employee.id}`)}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}
