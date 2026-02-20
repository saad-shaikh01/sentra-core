'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Pagination, FilterBar, Column } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBrands, useDeleteBrand } from '@/hooks/use-brands';
import { useUIStore } from '@/stores/ui-store';
import { IBrand } from '@sentra-core/types';
import { BrandFormModal } from './_components/brand-form-modal';
import { useDebounce } from '@/hooks/use-debounce';

export default function BrandsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    search: parseAsString.withDefault(''),
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [params.page, params.limit, debouncedSearch]);

  const { data, isLoading, isError } = useBrands(queryParams);
  const deleteBrand = useDeleteBrand();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const [modalOpen, setModalOpen] = useState(false);
  const [editBrand, setEditBrand] = useState<IBrand | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    setParams({ search: value, page: 1 });
  }, [setParams]);

  const handleDelete = useCallback((brand: IBrand) => {
    openConfirmDialog({
      title: `Delete "${brand.name}"?`,
      description: 'This action cannot be undone.',
      onConfirm: () => deleteBrand.mutate(brand.id),
    });
  }, [openConfirmDialog, deleteBrand]);

  const columns = useMemo<Column<IBrand>[]>(() => [
    {
      key: 'logoUrl',
      header: 'Logo',
      render: (b) => b.logoUrl
        ? <img src={b.logoUrl} alt={b.name} className="h-8 w-8 rounded-lg object-cover" />
        : <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold">{b.name[0]}</div>,
      className: 'w-16',
    },
    { key: 'name', header: 'Name' },
    { key: 'domain', header: 'Domain', render: (b) => b.domain ?? '—' },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (b) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); setEditBrand(b); setModalOpen(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); handleDelete(b); }}
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
        title="Brands"
        description="Manage your organization's brands."
        action={
          <Button onClick={() => { setEditBrand(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Brand
          </Button>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search brands…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs bg-white/5 border-white/10"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        keyExtractor={(b) => b.id}
        emptyTitle="No brands yet"
        emptyDescription="Create your first brand to get started."
      />

      <Pagination
        page={params.page}
        total={data?.meta.total ?? 0}
        limit={params.limit}
        onChange={(p) => setParams({ page: p })}
      />

      <BrandFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        brand={editBrand}
      />
    </div>
  );
}
