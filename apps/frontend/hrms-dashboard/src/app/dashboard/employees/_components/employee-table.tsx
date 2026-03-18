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
        render: (employee) => (
          <div className="flex items-center gap-3">
            <UserAvatar
              name={employee.fullName}
              avatarUrl={employee.avatarUrl}
              className="h-10 w-10"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{employee.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'jobTitle',
        header: 'Title',
        render: (employee) => employee.jobTitle || <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'department',
        header: 'Department',
        render: (employee) =>
          employee.department?.name || <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (employee) => <StatusBadge status={employee.status} />,
      },
      {
        key: 'apps',
        header: 'Apps',
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
