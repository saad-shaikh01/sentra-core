'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Pagination, FilterBar, Column } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { useUIStore } from '@/stores/ui-store';
import { IClient } from '@sentra-core/types';
import { ClientFormModal } from './_components/client-form-modal';
import { ClientDetailSheet } from './_components/client-detail-sheet';
import { useDebounce } from '@/hooks/use-debounce';

interface ClientRow extends IClient {
  brandName: string;
}

export default function ClientsPage() {
  const [params, setParams] = useQueryStates({
    page:   parseAsInteger.withDefault(1),
    limit:  parseAsInteger.withDefault(20),
    search: parseAsString.withDefault(''),
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const queryParams = useMemo(() => ({
    page:  params.page,
    limit: params.limit,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [params.page, params.limit, debouncedSearch]);

  const { data, isLoading, isError } = useClients(queryParams);
  const { data: brandsData }         = useBrands({ limit: 100 });
  const deleteClient                 = useDeleteClient();
  const openConfirmDialog            = useUIStore((s) => s.openConfirmDialog);

  const [modalOpen, setModalOpen]             = useState(false);
  const [editClient, setEditClient]           = useState<IClient | null>(null);
  const [detailClientId, setDetailClientId]   = useState<string | null>(null);

  const brandMap = useMemo(
    () => Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []),
    [brandsData?.data]
  );

  const clientRows = useMemo<ClientRow[]>(
    () => (data?.data ?? []).map((c) => ({
      ...c,
      brandName: brandMap[c.brandId] ?? '—',
    })),
    [data?.data, brandMap]
  );

  const handleDelete = useCallback((client: IClient) => {
    openConfirmDialog({
      title:       `Delete "${client.companyName}"?`,
      description: 'This will permanently delete this client.',
      onConfirm:   () => deleteClient.mutate(client.id),
    });
  }, [openConfirmDialog, deleteClient]);

  const columns = useMemo<Column<ClientRow>[]>(() => [
    { key: 'companyName', header: 'Company' },
    { key: 'contactName', header: 'Contact',  render: (c) => c.contactName ?? '—' },
    { key: 'email',       header: 'Email' },
    { key: 'phone',       header: 'Phone',    render: (c) => c.phone ?? '—' },
    { key: 'brandName',   header: 'Brand' },
    {
      key:    'createdAt',
      header: 'Created',
      render: (c) => new Date(c.createdAt).toLocaleDateString(),
    },
    {
      key:       'actions',
      header:    '',
      className: 'w-24',
      render:    (c) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); setEditClient(c); setModalOpen(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [handleDelete]);

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage your clients and their details."
        action={
          <Button onClick={() => { setEditClient(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Client
          </Button>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search clients…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParams({ search: e.target.value, page: 1 });
          }}
          className="max-w-xs bg-white/5 border-white/10"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={clientRows}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(c) => setDetailClientId(c.id)}
        keyExtractor={(c) => c.id}
        emptyTitle="No clients yet"
        emptyDescription="Add your first client to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(p) => setParams({ page: p })}
      />

      <ClientFormModal open={modalOpen} onOpenChange={setModalOpen} client={editClient} />

      <ClientDetailSheet clientId={detailClientId} onClose={() => setDetailClientId(null)} />
    </div>
  );
}
