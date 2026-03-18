'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from 'nuqs';
import { PageHeader, Pagination } from '@/components/shared';
import { useDebounce } from '@/hooks/use-debounce';
import { hrmsApi } from '@/lib/api';
import { CreateEmployeeModal } from './_components/create-employee-modal';
import { EmployeeFilters } from './_components/employee-filters';
import { EmployeeTable } from './_components/employee-table';
import {
  EMPLOYEE_APP_FILTER_VALUES,
  EMPLOYEE_STATUS_VALUES,
  type DepartmentOption,
  type Employee,
  type EmployeesFilters,
  type PaginatedResponse,
} from './_components/types';

const PAGE_SIZE = 20;

async function fetchEmployees(filters: EmployeesFilters) {
  return hrmsApi.get<PaginatedResponse<Employee>>(
    '/employees',
    filters as unknown as Record<string, unknown>,
  );
}

async function fetchDepartments() {
  try {
    const response = await hrmsApi.get<{ data: DepartmentOption[] }>('/departments');
    return response.data;
  } catch {
    return [];
  }
}

export default function EmployeesPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    search: parseAsString.withDefault(''),
    status: parseAsStringEnum([...EMPLOYEE_STATUS_VALUES]),
    appCode: parseAsStringEnum([...EMPLOYEE_APP_FILTER_VALUES]),
    departmentId: parseAsString,
  });
  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    setSearchInput(params.search);
  }, [params.search]);

  const filters = useMemo<EmployeesFilters>(
    () => ({
      page: params.page,
      limit: PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      status: params.status ?? undefined,
      appCode: params.appCode ?? undefined,
      departmentId: params.departmentId ?? undefined,
    }),
    [debouncedSearch, params.appCode, params.departmentId, params.page, params.status],
  );

  const employeesQuery = useQuery({
    queryKey: ['employees', filters],
    queryFn: () => fetchEmployees(filters),
    placeholderData: keepPreviousData,
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const hasFilters =
    Boolean(debouncedSearch.trim()) ||
    Boolean(params.status) ||
    Boolean(params.appCode) ||
    Boolean(params.departmentId);

  const totalEmployees = employeesQuery.data?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={`${totalEmployees} total employee${totalEmployees === 1 ? '' : 's'}`}
        action={<CreateEmployeeModal departments={departmentsQuery.data ?? []} />}
      />

      <EmployeeFilters
        departments={departmentsQuery.data ?? []}
        search={searchInput}
        status={params.status ?? null}
        appCode={params.appCode ?? null}
        departmentId={params.departmentId ?? null}
        onSearchChange={(value) => {
          setSearchInput(value);
          setParams({ search: value || null, page: 1 });
        }}
        onStatusChange={(value) => setParams({ status: value, page: 1 })}
        onAppCodeChange={(value) => setParams({ appCode: value, page: 1 })}
        onDepartmentChange={(value) => setParams({ departmentId: value, page: 1 })}
        onClearSearch={() => {
          setSearchInput('');
          setParams({ search: null, page: 1 });
        }}
      />

      <EmployeeTable
        employees={employeesQuery.data?.data ?? []}
        isLoading={employeesQuery.isLoading}
        isError={employeesQuery.isError}
        emptyTitle={hasFilters ? 'No employees match these filters' : 'No employees yet'}
        emptyDescription={
          hasFilters
            ? 'Try broadening the search or clearing one of the active filters.'
            : 'Invite your first employee to start managing staff access.'
        }
      />

      <Pagination
        page={employeesQuery.data?.meta.page ?? params.page}
        total={employeesQuery.data?.meta.total ?? 0}
        limit={employeesQuery.data?.meta.limit ?? PAGE_SIZE}
        onChange={(page) => setParams({ page })}
      />
    </div>
  );
}
