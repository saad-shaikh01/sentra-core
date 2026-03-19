'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Pagination } from '@/components/shared';
import { hrmsApi } from '@/lib/api';
import type { DepartmentOption } from '../employees/_components/types';
import { InviteMemberButton } from './_components/invite-member-button';
import { InvitationsTable, type PendingInvitation } from './_components/invitations-table';

type PendingInvitationsResponse = {
  data: PendingInvitation[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};

async function fetchPendingInvitations(page: number) {
  return hrmsApi.get<PendingInvitationsResponse>('/invitations/pending', {
    page,
    limit: 20,
  });
}

async function fetchDepartments() {
  try {
    const response = await hrmsApi.get<{ data: DepartmentOption[] }>('/departments');
    return response.data;
  } catch {
    return [];
  }
}

export default function InvitationsPage() {
  const [page, setPage] = useState(1);

  const invitationsQuery = useQuery({
    queryKey: ['pending-invitations', page],
    queryFn: () => fetchPendingInvitations(page),
    refetchInterval: 60_000,
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const total = invitationsQuery.data?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending Invitations"
        description={`${total} pending`}
        action={
          <InviteMemberButton
            departments={departmentsQuery.data ?? []}
            isLoadingDepartments={departmentsQuery.isLoading}
            onSuccess={() => invitationsQuery.refetch()}
          />
        }
      />

      <InvitationsTable
        invitations={invitationsQuery.data?.data ?? []}
        isLoading={invitationsQuery.isLoading}
        isError={invitationsQuery.isError}
      />

      <Pagination
        page={invitationsQuery.data?.meta.page ?? page}
        total={invitationsQuery.data?.meta.total ?? 0}
        limit={invitationsQuery.data?.meta.limit ?? 20}
        onChange={setPage}
      />
    </div>
  );
}
