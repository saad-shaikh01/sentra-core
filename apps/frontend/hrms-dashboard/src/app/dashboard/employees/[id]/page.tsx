'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared';
import { cn } from '@/lib/utils';
import { hrmsApi } from '@/lib/api';
import { EmployeeDetailHeader } from './_components/employee-detail-header';
import { ProfileTab } from './_components/profile-tab';
import { AccessRolesTab } from './_components/access-roles-tab';
import { SessionsTab } from './_components/sessions-tab';
import { ActivityTab } from './_components/activity-tab';
import type { DepartmentOption, Employee } from '../_components/types';

const TAB_ITEMS = [
  { id: 'profile', label: 'Profile' },
  { id: 'access', label: 'Access & Roles' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'activity', label: 'Activity' },
] as const;

async function fetchEmployee(employeeId: string) {
  const response = await hrmsApi.get<{ data: Employee }>(`/employees/${employeeId}`);
  return response.data;
}

async function fetchDepartments() {
  try {
    const response = await hrmsApi.get<{ data: DepartmentOption[] }>('/departments');
    return response.data;
  } catch {
    return [];
  }
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [activeTab, setActiveTab] = useState<(typeof TAB_ITEMS)[number]['id']>('profile');

  const employeeQuery = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => fetchEmployee(employeeId),
    retry: false,
    enabled: Boolean(employeeId),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    staleTime: 5 * 60 * 1000,
  });

  if (employeeQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" description="Loading employee details..." />
        <div className="h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    );
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" description="Details unavailable" />
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm font-medium">Employee not found.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The employee may have been removed or you may no longer have access to view them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmployeeDetailHeader
        employee={employeeQuery.data}
        departments={departmentsQuery.data ?? []}
      />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm transition-colors',
              activeTab === tab.id
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? <ProfileTab employee={employeeQuery.data} /> : null}
      {activeTab === 'access' ? <AccessRolesTab userId={employeeId} /> : null}
      {activeTab === 'sessions' ? <SessionsTab userId={employeeId} /> : null}
      {activeTab === 'activity' ? <ActivityTab userId={employeeId} /> : null}
    </div>
  );
}
