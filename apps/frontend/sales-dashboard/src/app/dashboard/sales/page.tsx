'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Pagination, FilterBar, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSales, useDeleteSale } from '@/hooks/use-sales';
import { useClients } from '@/hooks/use-clients';
import { useBrands } from '@/hooks/use-brands';
import { useUIStore } from '@/stores/ui-store';
import { ISale, SaleStatus } from '@sentra-core/types';
import { SaleFormModal } from './_components/sale-form-modal';
import { SaleDetailSheet } from './_components/sale-detail-sheet';

// Enriched row type shown in the table
interface SaleRow extends ISale {
  clientName: string;
  brandName: string;
}

export default function SalesPage() {
  const [params, setParams] = useQueryStates({
    page:     parseAsInteger.withDefault(1),
    limit:    parseAsInteger.withDefault(20),
    status:   parseAsStringEnum<SaleStatus>(Object.values(SaleStatus)),
    clientId: parseAsString,
    brandId:  parseAsString,
    dateFrom: parseAsString,
    dateTo:   parseAsString,
  });

  const queryParams = useMemo(() => ({
    page:  params.page,
    limit: params.limit,
    ...(params.status   ? { status:   params.status }   : {}),
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.brandId  ? { brandId:  params.brandId }  : {}),
    ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
    ...(params.dateTo   ? { dateTo:   params.dateTo }   : {}),
  }), [params]);

  const { data, isLoading, isError } = useSales(queryParams);
  const { data: clientsData }    = useClients({ limit: 100 });
  const { data: brandsData }     = useBrands({ limit: 100 });
  const deleteSale               = useDeleteSale();
  const openConfirmDialog        = useUIStore((s) => s.openConfirmDialog);

  const [modalOpen, setModalOpen]         = useState(false);
  const [editSale, setEditSale]           = useState<ISale | null>(null);
  const [detailSaleId, setDetailSaleId]   = useState<string | null>(null);

  // Build lookup maps for human-readable names
  const clientMap = useMemo(
    () => Object.fromEntries(clientsData?.data.map((c) => [c.id, c.companyName]) ?? []),
    [clientsData?.data]
  );
  const brandMap = useMemo(
    () => Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []),
    [brandsData?.data]
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

  const handleDelete = useCallback(
    (sale: ISale) => {
      openConfirmDialog({
        title:       'Delete Sale?',
        description: 'This will permanently delete this sale and all related data.',
        onConfirm:   () => deleteSale.mutate(sale.id),
      });
    },
    [openConfirmDialog, deleteSale]
  );

  const columns = useMemo<Column<SaleRow>[]>(
    () => [
      { key: 'clientName', header: 'Client' },
      { key: 'brandName',  header: 'Brand' },
      {
        key:    'totalAmount',
        header: 'Amount',
        render: (s) => (
          <span className="font-bold">
            ${s.totalAmount}{' '}
            <span className="text-muted-foreground font-normal">{s.currency}</span>
          </span>
        ),
      },
      {
        key:    'status',
        header: 'Status',
        render: (s) => <StatusBadge status={s.status} />,
      },
      {
        key:    'createdAt',
        header: 'Created',
        render: (s) => new Date(s.createdAt).toLocaleDateString(),
      },
      {
        key:       'actions',
        header:    '',
        className: 'w-24',
        render:    (s) => (
          <div className="flex items-center gap-1 justify-end">
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
          </div>
        ),
      },
    ],
    [handleDelete]
  );

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Track sales, payments, and subscriptions."
        action={
          <Button
            onClick={() => {
              setEditSale(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Sale
          </Button>
        }
      />

      <FilterBar>
        {/* Status */}
        <Select
          value={params.status ?? 'all'}
          onValueChange={(v) =>
            setParams({ status: v === 'all' ? null : (v as SaleStatus), page: 1 })
          }
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.values(SaleStatus).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Client */}
        <Select
          value={params.clientId ?? 'all'}
          onValueChange={(v) =>
            setParams({ clientId: v === 'all' ? null : v, page: 1 })
          }
        >
          <SelectTrigger className="w-40 bg-white/5 border-white/10">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientsData?.data.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Brand */}
        <Select
          value={params.brandId ?? 'all'}
          onValueChange={(v) =>
            setParams({ brandId: v === 'all' ? null : v, page: 1 })
          }
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brandsData?.data.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <Input
          type="date"
          value={params.dateFrom ?? ''}
          onChange={(e) => setParams({ dateFrom: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="From date"
        />
        <Input
          type="date"
          value={params.dateTo ?? ''}
          onChange={(e) => setParams({ dateTo: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="To date"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={salesRows}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(s) => setDetailSaleId(s.id)}
        keyExtractor={(s) => s.id}
        emptyTitle="No sales yet"
        emptyDescription="Create your first sale to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(p) => setParams({ page: p })}
      />

      <SaleFormModal open={modalOpen} onOpenChange={setModalOpen} sale={editSale} />

      <SaleDetailSheet saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
    </div>
  );
}
