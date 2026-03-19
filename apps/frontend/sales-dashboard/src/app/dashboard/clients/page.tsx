'use client';

import { useCallback, useMemo, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Column, DataTable, FilterBar, PageHeader, Pagination } from '@/components/shared';
import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBrands } from '@/hooks/use-brands';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
import { useDebounce } from '@/hooks/use-debounce';
import { useUIStore } from '@/stores/ui-store';
import { IClient } from '@sentra-core/types';
import { ClientDetailSheet } from './_components/client-detail-sheet';
import { ClientFormModal } from './_components/client-form-modal';

interface ClientRow extends IClient {
  brandName: string;
}

export default function ClientsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    search: parseAsString.withDefault(''),
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<IClient | null>(null);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);
  const deleteClient = useDeleteClient();
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);

  const queryParams = useMemo(
    () => ({
      page: params.page,
      limit: params.limit,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [debouncedSearch, params.limit, params.page],
  );

  const { data, isLoading, isError } = useClients(queryParams);
  const { data: brandsData } = useBrands({ limit: 100 });

  const brandMap = useMemo(
    () => Object.fromEntries(brandsData?.data.map((brand) => [brand.id, brand.name]) ?? []),
    [brandsData?.data],
  );

  const clientRows = useMemo<ClientRow[]>(
    () =>
      (data?.data ?? []).map((client) => ({
        ...client,
        brandName: brandMap[client.brandId] ?? '-',
      })),
    [brandMap, data?.data],
  );

  const handleDelete = useCallback(
    (client: IClient) => {
      openConfirmDialog({
        title: `Delete "${client.companyName}"?`,
        description: 'This will permanently delete this client.',
        onConfirm: () => deleteClient.mutate(client.id),
      });
    },
    [deleteClient, openConfirmDialog],
  );

  const columns = useMemo<Column<ClientRow>[]>(
    () => [
      { key: 'companyName', header: 'Company' },
      { key: 'contactName', header: 'Contact', render: (client) => client.contactName ?? '-' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone', render: (client) => client.phone ?? '-' },
      { key: 'brandName', header: 'Brand' },
      {
        key: 'status',
        header: 'Status',
        render: (client) => <StatusBadge status={client.status} />,
      },
      {
        key: 'portal',
        header: 'Portal',
        render: (client) => <PortalCell client={client} />,
      },
      {
        key: 'upsellAgent',
        header: 'Upsell',
        render: (client) => <AssigneeCell assignee={client.upsellAgent} emptyLabel="Unassigned" />,
      },
      {
        key: 'projectManager',
        header: 'PM',
        render: (client) => (
          <AssigneeCell assignee={client.projectManager} emptyLabel="Unassigned" />
        ),
      },
      {
        key: 'createdAt',
        header: 'Created',
        render: (client) => new Date(client.createdAt).toLocaleDateString(),
      },
      {
        key: 'actions',
        header: '',
        className: 'w-24',
        render: (client) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation();
                setEditClient(client);
                setModalOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
              onClick={(event) => {
                event.stopPropagation();
                handleDelete(client);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage your clients and their details."
        action={
          <Button
            onClick={() => {
              setEditClient(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Client
          </Button>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search clients..."
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setParams({ search: event.target.value, page: 1 });
          }}
          className="w-full sm:max-w-xs border-white/10 bg-white/5"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={clientRows}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(client) => setDetailClientId(client.id)}
        keyExtractor={(client) => client.id}
        emptyTitle="No clients yet"
        emptyDescription="Add your first client to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(page) => setParams({ page })}
      />

      <ClientFormModal open={modalOpen} onOpenChange={setModalOpen} client={editClient} />
      <ClientDetailSheet clientId={detailClientId} onClose={() => setDetailClientId(null)} />
    </div>
  );
}

function PortalCell({ client }: { client: IClient }) {
  if (!client.portalAccess) {
    return <span className="text-xs font-medium text-muted-foreground">No Access</span>;
  }

  if (client.emailVerified) {
    return <span className="text-xs font-medium text-emerald-300">Active</span>;
  }

  return <span className="text-xs font-medium text-amber-300">Pending</span>;
}

function AssigneeCell({
  assignee,
  emptyLabel,
}: {
  assignee?: { id: string; name: string; avatarUrl?: string };
  emptyLabel: string;
}) {
  if (!assignee) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-7 w-7 border border-white/10">
        <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
        <AvatarFallback className="text-[10px]">{getInitials(assignee.name)}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{assignee.name}</span>
    </div>
  );
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}
