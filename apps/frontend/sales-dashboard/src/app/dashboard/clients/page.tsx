'use client';

import { useCallback, useMemo, useState } from 'react';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import { DollarSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { ActiveFilter, Column, DataTable, FilterBar, FilterChips, FilterGroup, FilterLabel, PageHeader, Pagination } from '@/components/shared';
import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBrands } from '@/hooks/use-brands';
import { useClients, useDeleteClient } from '@/hooks/use-clients';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import { useUIStore } from '@/stores/ui-store';
import { ClientStatus, IClient, IOrganizationMember, SaleType, UserRole } from '@sentra-core/types';
import { ClientDetailSheet } from './_components/client-detail-sheet';
import { ClientFormModal } from './_components/client-form-modal';
import { SaleFormModal } from '../sales/_components/sale-form-modal';

interface ClientRow extends IClient {
  brandName: string;
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function ClientsPage() {
  const [params, setParams] = useQueryStates({
    page:            parseAsInteger.withDefault(1),
    limit:           parseAsInteger.withDefault(20),
    search:          parseAsString.withDefault(''),
    status:          parseAsStringEnum<ClientStatus>(Object.values(ClientStatus)),
    brandId:         parseAsString,
    upsellAgentId:   parseAsString,
    projectManagerId: parseAsString,
    dateFrom:        parseAsString,
    dateTo:          parseAsString,
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editClient, setEditClient] = useState<IClient | null>(null);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);
  const [saleModalClient, setSaleModalClient] = useState<IClient | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);
  const deleteClient = useDeleteClient();
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);
  const { user } = useAuth();
  const canManageClients =
    user?.role === UserRole.OWNER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.SALES_MANAGER;

  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: upsellAgents } = useMembers(UserRole.UPSELL_AGENT);
  const { data: projectManagers } = useMembers(UserRole.PROJECT_MANAGER);

  const queryParams = useMemo(
    () => ({
      page: params.page,
      limit: params.limit,
      ...(debouncedSearch       ? { search: debouncedSearch }               : {}),
      ...(params.status         ? { status: params.status }                 : {}),
      ...(params.brandId        ? { brandId: params.brandId }               : {}),
      ...(params.upsellAgentId  ? { upsellAgentId: params.upsellAgentId }   : {}),
      ...(params.projectManagerId ? { projectManagerId: params.projectManagerId } : {}),
      ...(params.dateFrom       ? { dateFrom: params.dateFrom }             : {}),
      ...(params.dateTo         ? { dateTo: params.dateTo }                 : {}),
    }),
    [debouncedSearch, params.page, params.limit, params.status, params.brandId,
     params.upsellAgentId, params.projectManagerId, params.dateFrom, params.dateTo],
  );

  const { data, isLoading, isError } = useClients(queryParams);

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

  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (params.status) {
      filters.push({ key: 'status', label: 'Status', displayValue: formatEnumLabel(params.status) });
    }
    if (params.brandId) {
      const brand = brandsData?.data.find((b) => b.id === params.brandId);
      filters.push({ key: 'brandId', label: 'Brand', displayValue: brand?.name ?? params.brandId });
    }
    if (params.upsellAgentId) {
      const agent = (upsellAgents ?? []).find((a) => a.id === params.upsellAgentId);
      filters.push({ key: 'upsellAgentId', label: 'Upsell Agent', displayValue: agent?.name ?? params.upsellAgentId });
    }
    if (params.projectManagerId) {
      const pm = (projectManagers ?? []).find((a) => a.id === params.projectManagerId);
      filters.push({ key: 'projectManagerId', label: 'PM', displayValue: pm?.name ?? params.projectManagerId });
    }
    if (params.dateFrom) {
      filters.push({ key: 'dateFrom', label: 'From', displayValue: params.dateFrom });
    }
    if (params.dateTo) {
      filters.push({ key: 'dateTo', label: 'To', displayValue: params.dateTo });
    }
    return filters;
  }, [params, brandsData, upsellAgents, projectManagers]);

  const handleClearFilters = () => {
    setParams({
      status: null,
      brandId: null,
      upsellAgentId: null,
      projectManagerId: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });
  };

  const handleDelete = useCallback(
    (client: IClient) => {
      openConfirmDialog({
        title: `Delete "${client.contactName ?? client.email}"?`,
        description: 'This will permanently delete this client.',
        onConfirm: () => deleteClient.mutate(client.id),
      });
    },
    [deleteClient, openConfirmDialog],
  );

  const columns = useMemo<Column<ClientRow>[]>(
    () => [
      { key: 'contactName', header: 'NAME', render: (client) => client.contactName ?? '-', className: 'min-w-[180px] font-semibold' },
      { key: 'email', header: 'Email', className: 'min-w-[200px] text-primary/70' },
      { key: 'brandName', header: 'Brand', className: 'min-w-[120px]' },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[120px]',
        render: (client) => <StatusBadge status={client.status} />,
      },
      {
        key: 'upsellAgent',
        header: 'Upsell',
        className: 'min-w-[150px]',
        render: (client) => <AssigneeCell assignee={client.upsellAgent} emptyLabel="Unassigned" />,
      },
      {
        key: 'projectManager',
        header: 'PM',
        className: 'min-w-[150px]',
        render: (client) => (
          <AssigneeCell assignee={client.projectManager} emptyLabel="Unassigned" />
        ),
      },
      {
        key: 'createdAt',
        header: 'Created',
        className: 'w-[120px]',
        render: (client) => new Date(client.createdAt).toLocaleDateString(),
      },
      {
        key: 'actions',
        header: '',
        className: 'w-32',
        render: (client) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-emerald-500/10 hover:text-emerald-400"
              title="Create sale"
              onClick={(event) => {
                event.stopPropagation();
                setSaleModalClient(client);
              }}
            >
              <DollarSign className="h-3.5 w-3.5" />
            </Button>
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
          canManageClients ? (
            <Button
              onClick={() => {
                setEditClient(null);
                setModalOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Client
            </Button>
          ) : null
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
          className="w-full sm:max-w-xs bg-white/[0.03] border-white/[0.05] focus:bg-white/[0.05] transition-all"
        />

        <FilterGroup
          activeCount={activeFilters.length}
          onClear={handleClearFilters}
        >
          <FilterLabel label="Status">
            <Select
              value={params.status ?? 'all'}
              onValueChange={(v) =>
                setParams({ status: v === 'all' ? null : (v as ClientStatus), page: 1 })
              }
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.values(ClientStatus).map((s) => (
                  <SelectItem key={s} value={s}>{formatEnumLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="Brand">
            <Select
              value={params.brandId ?? 'all'}
              onValueChange={(v) => setParams({ brandId: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="Upsell Agent">
            <Select
              value={params.upsellAgentId ?? 'all'}
              onValueChange={(v) => setParams({ upsellAgentId: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {(upsellAgents ?? []).map((a: Pick<IOrganizationMember, 'id' | 'name'>) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="Project Manager">
            <Select
              value={params.projectManagerId ?? 'all'}
              onValueChange={(v) => setParams({ projectManagerId: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All PMs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All PMs</SelectItem>
                {(projectManagers ?? []).map((a: Pick<IOrganizationMember, 'id' | 'name'>) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="From Date">
            <Input
              type="date"
              value={params.dateFrom ?? ''}
              onChange={(e) => setParams({ dateFrom: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
            />
          </FilterLabel>

          <FilterLabel label="To Date">
            <Input
              type="date"
              value={params.dateTo ?? ''}
              onChange={(e) => setParams({ dateTo: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
            />
          </FilterLabel>
        </FilterGroup>
      </FilterBar>

      <FilterChips
        filters={activeFilters}
        onRemove={(key: string) => setParams({ [key]: null, page: 1 })}
        onClear={handleClearFilters}
      />

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
        onLimitChange={(limit) => setParams({ limit, page: 1 })}
      />

      <ClientFormModal open={modalOpen} onOpenChange={setModalOpen} client={editClient} />
      <ClientDetailSheet clientId={detailClientId} onClose={() => setDetailClientId(null)} />
      <SaleFormModal
        open={!!saleModalClient}
        onOpenChange={(open) => { if (!open) setSaleModalClient(null); }}
        prefillClientId={saleModalClient?.id}
        prefillClientName={saleModalClient?.contactName ?? saleModalClient?.email}
        prefillBrandId={saleModalClient?.brandId}
        prefillSaleType={SaleType.UPSELL}
        prefillSalesAgentId={saleModalClient?.upsellAgentId ?? undefined}
      />
    </div>
  );
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
