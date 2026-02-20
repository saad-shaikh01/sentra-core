'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Pagination, FilterBar, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInvoices, useDeleteInvoice } from '@/hooks/use-invoices';
import { useSales } from '@/hooks/use-sales';
import { useUIStore } from '@/stores/ui-store';
import { IInvoice, InvoiceStatus } from '@sentra-core/types';
import { InvoiceFormModal } from './_components/invoice-form-modal';
import { InvoiceDetailSheet } from './_components/invoice-detail-sheet';

export default function InvoicesPage() {
  const [params, setParams] = useQueryStates({
    page:       parseAsInteger.withDefault(1),
    limit:      parseAsInteger.withDefault(20),
    status:     parseAsStringEnum<InvoiceStatus>(Object.values(InvoiceStatus)),
    saleId:     parseAsString,
    dueBefore:  parseAsString,
    dueAfter:   parseAsString,
  });

  const queryParams = useMemo(() => ({
    page:  params.page,
    limit: params.limit,
    ...(params.status    ? { status:    params.status }    : {}),
    ...(params.saleId    ? { saleId:    params.saleId }    : {}),
    ...(params.dueBefore ? { dueBefore: params.dueBefore } : {}),
    ...(params.dueAfter  ? { dueAfter:  params.dueAfter }  : {}),
  }), [params]);

  const { data, isLoading, isError } = useInvoices(queryParams);
  const { data: salesData }          = useSales({ limit: 100 });
  const deleteInvoice          = useDeleteInvoice();
  const openConfirmDialog      = useUIStore((s) => s.openConfirmDialog);

  const [modalOpen, setModalOpen]             = useState(false);
  const [editInvoice, setEditInvoice]         = useState<IInvoice | null>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);

  const handleDelete = useCallback(
    (invoice: IInvoice) => {
      openConfirmDialog({
        title:       `Delete invoice ${invoice.invoiceNumber}?`,
        description: 'This action cannot be undone.',
        onConfirm:   () => deleteInvoice.mutate(invoice.id),
      });
    },
    [openConfirmDialog, deleteInvoice]
  );

  const columns = useMemo<Column<IInvoice>[]>(
    () => [
      {
        key:    'invoiceNumber',
        header: 'Invoice #',
        render: (inv) => <span className="font-mono text-xs">{inv.invoiceNumber}</span>,
      },
      {
        key:    'amount',
        header: 'Amount',
        render: (inv) => <span className="font-bold">${inv.amount}</span>,
      },
      {
        key:    'dueDate',
        header: 'Due Date',
        render: (inv) => new Date(inv.dueDate).toLocaleDateString(),
      },
      {
        key:    'status',
        header: 'Status',
        render: (inv) => <StatusBadge status={inv.status} />,
      },
      {
        key:       'actions',
        header:    '',
        className: 'w-24',
        render:    (inv) => (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                setEditInvoice(inv);
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
                handleDelete(inv);
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
        title="Invoices"
        description="Manage invoices and track payments."
        action={
          <Button
            onClick={() => {
              setEditInvoice(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Invoice
          </Button>
        }
      />

      <FilterBar>
        {/* Status */}
        <Select
          value={params.status ?? 'all'}
          onValueChange={(v) =>
            setParams({ status: v === 'all' ? null : (v as InvoiceStatus), page: 1 })
          }
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.values(InvoiceStatus).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sale */}
        <Select
          value={params.saleId ?? 'all'}
          onValueChange={(v) =>
            setParams({ saleId: v === 'all' ? null : v, page: 1 })
          }
        >
          <SelectTrigger className="w-48 bg-white/5 border-white/10">
            <SelectValue placeholder="All sales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            {salesData?.data.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                ${s.totalAmount} {s.currency} · {s.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Due date range */}
        <Input
          type="date"
          value={params.dueAfter ?? ''}
          onChange={(e) => setParams({ dueAfter: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="Due after"
        />
        <Input
          type="date"
          value={params.dueBefore ?? ''}
          onChange={(e) => setParams({ dueBefore: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="Due before"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(inv) => setDetailInvoiceId(inv.id)}
        keyExtractor={(inv) => inv.id}
        emptyTitle="No invoices yet"
        emptyDescription="Create your first invoice to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(p) => setParams({ page: p })}
      />

      <InvoiceFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        invoice={editInvoice}
      />

      <InvoiceDetailSheet
        invoiceId={detailInvoiceId}
        onClose={() => setDetailInvoiceId(null)}
      />
    </div>
  );
}
