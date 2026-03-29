'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs';
import { useDebounce } from '@/hooks/use-debounce';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Pagination, FilterBar, Column, StatusBadge, FilterGroup, FilterChips, FilterLabel, ActiveFilter } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSales, useDeleteSale } from '@/hooks/use-sales';
import { useClients } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import { useUIStore } from '@/stores/ui-store';
import { ISale, InstallmentMode, SaleStatus, SaleType } from '@sentra-core/types';
import { SaleFormModal } from './_components/sale-form-modal';
import { SaleDetailSheet } from './_components/sale-detail-sheet';
import { QuickSaleModal } from './_components/quick-sale-modal';
import { RevenueSummaryCards } from './_components/revenue-summary-cards';
import { InvoiceOverviewWidget } from './_components/invoice-overview-widget';

// Enriched row type shown in the table
interface SaleRow extends ISale {
  clientName: string;
  brandName: string;
}

export default function SalesPage() {
  const [params, setParams] = useQueryStates({
    page:         parseAsInteger.withDefault(1),
    limit:        parseAsInteger.withDefault(20),
    search:       parseAsString.withDefault(''),
    status:       parseAsStringEnum<SaleStatus>(Object.values(SaleStatus)),
    clientId:     parseAsString,
    brandId:      parseAsString,
    dateFrom:     parseAsString,
    dateTo:       parseAsString,
    salesAgentId: parseAsString,
    saleType:     parseAsString,
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const queryParams = useMemo(() => ({
    page:  params.page,
    limit: params.limit,
    ...(debouncedSearch     ? { search:       debouncedSearch }     : {}),
    ...(params.status       ? { status:       params.status }       : {}),
    ...(params.clientId     ? { clientId:     params.clientId }     : {}),
    ...(params.brandId      ? { brandId:      params.brandId }      : {}),
    ...(params.dateFrom     ? { dateFrom:     params.dateFrom }     : {}),
    ...(params.dateTo       ? { dateTo:       params.dateTo }       : {}),
    ...(params.salesAgentId ? { salesAgentId: params.salesAgentId } : {}),
    ...(params.saleType     ? { saleType:     params.saleType }     : {}),
  }), [debouncedSearch, params.page, params.limit, params.status, params.clientId,
       params.brandId, params.dateFrom, params.dateTo, params.salesAgentId, params.saleType]);

  const router = useRouter();
  const { data, isLoading, isError } = useSales(queryParams);
  const { data: clientsData }    = useClients({ limit: 100 });
  const { data: brandsData }     = useBrands({ limit: 100 });
  const { data: allAgentsData } = useMembers();
  const allAgents = allAgentsData ?? [];
  const { isLoading: isAuthLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const deleteSale               = useDeleteSale();
  const openConfirmDialog        = useUIStore((s) => s.openConfirmDialog);

  const [modalOpen, setModalOpen]         = useState(false);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [editSale, setEditSale]           = useState<ISale | null>(null);
  const [detailSaleId, setDetailSaleId]   = useState<string | null>(null);
  const canCreateEdit = hasPermission('sales:sales:create');
  const canDelete = hasPermission('sales:sales:delete');

  // Build lookup maps for human-readable names
  const clientMap = useMemo(
    () => Object.fromEntries(clientsData?.data.map((c) => [c.id, c.contactName ?? c.email]) ?? []),
    [clientsData?.data]
  );
  const brandMap = useMemo(
    () => Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []),
    [brandsData?.data]
  );

  const agentMap = useMemo(
    () => {
      const map: Record<string, string> = {};
      allAgents.forEach((a) => {
        if (a.id) map[a.id] = a.name;
      });
      return map;
    },
    [allAgents]
  );

  // Enrich raw sales rows with display names
  const salesRows = useMemo<SaleRow[]>(
    () =>
      (data?.data ?? []).map((s) => ({
        ...s,
        clientName: clientMap[s.clientId] ?? s.clientId,
        brandName:  brandMap[s.brandId]   ?? s.brandId,
      })),
    [data?.data, clientMap, brandMap]
  );

  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (params.status) {
      filters.push({ key: 'status', label: 'Status', displayValue: params.status });
    }
    if (params.clientId) {
      const client = clientsData?.data.find((c) => c.id === params.clientId);
      filters.push({ key: 'clientId', label: 'Client', displayValue: client?.contactName ?? client?.email ?? params.clientId });
    }
    if (params.brandId) {
      const brand = brandsData?.data.find((b) => b.id === params.brandId);
      filters.push({ key: 'brandId', label: 'Brand', displayValue: brand?.name ?? params.brandId });
    }
    if (params.salesAgentId) {
      const agent = allAgents.find((a) => a.id === params.salesAgentId);
      filters.push({ key: 'salesAgentId', label: 'Agent', displayValue: agent?.name ?? params.salesAgentId });
    }
    if (params.saleType) {
      filters.push({ key: 'saleType', label: 'Type', displayValue: params.saleType === SaleType.FRONTSELL ? 'Frontsell' : 'Upsell' });
    }
    if (params.dateFrom) {
      filters.push({ key: 'dateFrom', label: 'From', displayValue: params.dateFrom });
    }
    if (params.dateTo) {
      filters.push({ key: 'dateTo', label: 'To', displayValue: params.dateTo });
    }
    return filters;
  }, [params, clientsData, brandsData, allAgents]);

  const handleClearFilters = () => {
    setParams({
      status: null,
      clientId: null,
      brandId: null,
      salesAgentId: null,
      saleType: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });
  };

  const handleDelete = useCallback(
    (sale: ISale) => {
      openConfirmDialog({
        title:       'Delete Sale?',
        description: 'This will permanently delete this sale. Sales with invoice(s) cannot be deleted until those invoice(s) are removed.',
        onConfirm:   () => deleteSale.mutate(sale.id),
      });
    },
    [openConfirmDialog, deleteSale]
  );

  const columns = useMemo<Column<SaleRow>[]>(
    () => {
      const baseColumns: Column<SaleRow>[] = [
        { key: 'clientName', header: 'Client', className: 'min-w-[180px]' },
        { key: 'brandName',  header: 'Brand',  className: 'min-w-[120px]' },
        { 
          key: 'salesAgentId', 
          header: 'Agent', 
          className: 'min-w-[140px]',
          render: (s) => {
            const agent = allAgents.find((a) => a.id === s.salesAgentId);
            return <span className="font-medium text-foreground/90">{agent?.name || 'Unassigned'}</span>;
          }
        },
        {
          key:    'totalAmount',
          header: 'Amount',
          className: 'w-[180px]',
          render: (s) => (
            <div>
              <span className="font-bold">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency ?? 'USD' }).format(s.totalAmount)}
              </span>
              {s.discountedTotal != null && s.discountedTotal !== s.totalAmount ? (
                <div className="text-[11px] text-emerald-400/90 font-semibold leading-tight">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency ?? 'USD' }).format(s.discountedTotal)} net
                </div>
              ) : null}
              <div className="text-[11px] text-muted-foreground/80 leading-tight">
                Collected {new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency ?? 'USD' }).format(s.collectedAmount ?? 0)}
                {' · '}
                Outstanding {new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency ?? 'USD' }).format(s.outstandingAmount ?? 0)}
              </div>
            </div>
          ),
        },
        {
          key:    'paymentPlan',
          header: 'Plan',
          className: 'w-[100px]',
          render: (s) => (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-muted-foreground/80">
              {s.paymentPlan === 'ONE_TIME'
                ? 'One-Time'
                : s.paymentPlan === 'INSTALLMENTS'
                  ? (s.installmentMode === InstallmentMode.CUSTOM ? 'Custom' : `${s.installmentCount ?? '?'}x`)
                  : 'Sub'}
            </span>
          ),
        },
        {
          key:    'status',
          header: 'Lifecycle',
          className: 'w-[120px]',
          render: (s) => <StatusBadge status={s.status} />,
        },
        {
          key:    'paymentStatus',
          header: 'Payment',
          className: 'w-[150px]',
          render: (s) => <StatusBadge status={s.paymentStatus ?? 'UNPAID'} />,
        },
        {
          key:    'saleDate',
          header: 'Sale Date',
          className: 'w-[120px]',
          render: (s) => new Date(s.saleDate ?? s.createdAt).toLocaleDateString(),
        },
      ];

      if (isAuthLoading || (!canCreateEdit && !canDelete)) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          key:       'actions',
          header:    '',
          className: 'w-24',
          render:    (s) => (
            <div className="flex items-center gap-1 justify-end">
              {canCreateEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditSale(s);
                    setModalOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(s);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ),
        },
      ];
    },
    [canCreateEdit, canDelete, handleDelete, isAuthLoading, allAgents]
  );

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Track sales, payments, and subscriptions."
        action={isAuthLoading || !canCreateEdit ? null : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditSale(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Simple Sale
            </Button>
            <Button onClick={() => setQuickSaleOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Quick Sale
            </Button>
          </div>
        )}
      />

      <RevenueSummaryCards
        brandId={params.brandId ?? undefined}
        dateFrom={params.dateFrom ?? undefined}
        dateTo={params.dateTo ?? undefined}
      />
      <InvoiceOverviewWidget brandId={params.brandId ?? undefined} />

      <FilterBar>
        <Input
          placeholder="Search sales..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParams({ search: e.target.value, page: 1 });
          }}
          className="w-full sm:max-w-xs bg-white/[0.03] border-white/[0.05] focus:bg-white/[0.05] transition-all"
        />

        <FilterGroup
          activeCount={activeFilters.length}
          onClear={handleClearFilters}
        >
          {/* Status */}
          <FilterLabel label="Status">
            <Select
              value={params.status ?? 'all'}
              onValueChange={(v) =>
                setParams({ status: v === 'all' ? null : (v as SaleStatus), page: 1 })
              }
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.values(SaleStatus).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          {/* Client */}
          <FilterLabel label="Client">
            <Select
              value={params.clientId ?? 'all'}
              onValueChange={(v) =>
                setParams({ clientId: v === 'all' ? null : v, page: 1 })
              }
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientsData?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.contactName ?? c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          {/* Brand */}
          <FilterLabel label="Brand">
            <Select
              value={params.brandId ?? 'all'}
              onValueChange={(v) =>
                setParams({ brandId: v === 'all' ? null : v, page: 1 })
              }
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

          {/* Sales Agent */}
          <FilterLabel label="Sales Agent">
            <Select
              value={params.salesAgentId ?? 'all'}
              onValueChange={(v) => setParams({ salesAgentId: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {allAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          {/* Sale Type */}
          <FilterLabel label="Sale Type">
            <Select
              value={params.saleType ?? 'all'}
              onValueChange={(v) => setParams({ saleType: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value={SaleType.FRONTSELL}>Frontsell</SelectItem>
                <SelectItem value={SaleType.UPSELL}>Upsell</SelectItem>
              </SelectContent>
            </Select>
          </FilterLabel>

          {/* Date range */}
          <FilterLabel label="From Date">
            <Input
              type="date"
              value={params.dateFrom ?? ''}
              onChange={(e) => setParams({ dateFrom: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
              title="From date"
            />
          </FilterLabel>
          <FilterLabel label="To Date">
            <Input
              type="date"
              value={params.dateTo ?? ''}
              onChange={(e) => setParams({ dateTo: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
              title="To date"
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
        data={salesRows}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(s) => router.push(`/dashboard/sales/${s.id}`)}
        keyExtractor={(s) => s.id}
        emptyTitle="No sales yet"
        emptyDescription="Create your first sale to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(p) => setParams({ page: p })}
        onLimitChange={(l) => setParams({ limit: l, page: 1 })}
      />

      <SaleFormModal open={modalOpen} onOpenChange={setModalOpen} sale={editSale} />
      <QuickSaleModal open={quickSaleOpen} onOpenChange={setQuickSaleOpen} />

      <SaleDetailSheet saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
    </div>
  );
}
