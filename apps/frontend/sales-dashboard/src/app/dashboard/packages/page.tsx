'use client';

import { useCallback, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Eye } from 'lucide-react';
import { Column, DataTable, FilterBar, PageHeader, FilterGroup, FilterChips, FilterLabel, ActiveFilter } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePackages, useDeletePackage } from '@/hooks/use-packages';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/stores/ui-store';
import { IProductPackage, PackageCategory, UserRole } from '@sentra-core/types';
import { PackageFormModal } from './_components/package-form-modal';
import { cn } from '@/lib/utils';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PackageCategory, string> = {
  [PackageCategory.PUBLISHING]: 'Publishing',
  [PackageCategory.WRITING]:    'Writing',
  [PackageCategory.DESIGN]:     'Design',
  [PackageCategory.EDITING]:    'Editing',
};

const CATEGORY_COLORS: Record<PackageCategory, string> = {
  [PackageCategory.PUBLISHING]: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  [PackageCategory.WRITING]:    'bg-purple-500/15 text-purple-300 border-purple-500/20',
  [PackageCategory.DESIGN]:     'bg-pink-500/15 text-pink-300 border-pink-500/20',
  [PackageCategory.EDITING]:    'bg-amber-500/15 text-amber-300 border-amber-500/20',
};

function CategoryBadge({ category }: { category?: PackageCategory }) {
  if (!category) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        CATEGORY_COLORS[category],
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// ─── Detail dialog ────────────────────────────────────────────────────────────

interface PackageDetailDialogProps {
  pkg: IProductPackage | null;
  onClose: () => void;
}

function PackageDetailDialog({ pkg, onClose }: PackageDetailDialogProps) {
  if (!pkg) return null;

  const priceStr =
    pkg.price != null
      ? `${pkg.currency} ${pkg.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      : `${pkg.currency} —`;

  return (
    <Dialog open={!!pkg} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex-1 truncate">{pkg.name}</span>
            {pkg.category && <CategoryBadge category={pkg.category} />}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 space-y-4">
          {/* Price */}
          <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-4 py-3">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="text-lg font-bold text-foreground">{priceStr}</span>
          </div>

          {/* Description */}
          {pkg.description && (
            <p className="text-sm text-muted-foreground">{pkg.description}</p>
          )}

          {/* Services list */}
          {pkg.items && pkg.items.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                Services Included
              </h4>
              <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
                {pkg.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="text-emerald-400 text-sm">✓</span>
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pkg.items?.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No services listed for this package.
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [modalOpen, setModalOpen]         = useState(false);
  const [editPkg, setEditPkg]             = useState<IProductPackage | null>(null);
  const [detailPkg, setDetailPkg]         = useState<IProductPackage | null>(null);

  const { data: packages, isLoading, isError } = usePackages();
  const deletePackage   = useDeletePackage();
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);
  const { user }        = useAuth();

  const canManage =
    user?.role === UserRole.OWNER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.SALES_MANAGER;

  // Filter by category
  const filtered = useMemo(() => {
    const list = Array.isArray(packages) ? packages : [];
    if (categoryFilter === 'all') return list;
    return list.filter((p) => p.category === categoryFilter);
  }, [packages, categoryFilter]);

  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (categoryFilter !== 'all') {
      filters.push({
        key: 'category',
        label: 'Category',
        displayValue: CATEGORY_LABELS[categoryFilter as PackageCategory],
      });
    }
    return filters;
  }, [categoryFilter]);

  const handleClear = () => {
    setCategoryFilter('all');
  };

  const handleDelete = useCallback(
    (pkg: IProductPackage) => {
      openConfirmDialog({
        title:       `Delete "${pkg.name}"?`,
        description: 'This will permanently delete this package.',
        onConfirm:   () => deletePackage.mutate(pkg.id),
      });
    },
    [deletePackage, openConfirmDialog],
  );

  const columns = useMemo<Column<IProductPackage>[]>(
    () => [
      {
        key:    'name',
        header: 'Name',
        render: (pkg) => (
          <span className="font-medium text-foreground">{pkg.name}</span>
        ),
      },
      {
        key:    'category',
        header: 'Category',
        render: (pkg) => <CategoryBadge category={pkg.category} />,
      },
      {
        key:    'price',
        header: 'Price',
        render: (pkg) =>
          pkg.price != null ? (
            <span>
              {pkg.currency}{' '}
              {pkg.price.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key:    'items',
        header: 'Services',
        render: (pkg) => (
          <span className="text-muted-foreground text-sm">
            {pkg.items?.length ?? 0} service{(pkg.items?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        ),
      },
      {
        key:       'actions',
        header:    '',
        className: 'w-28',
        render:    (pkg) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              title="View details"
              onClick={(e) => {
                e.stopPropagation();
                setDetailPkg(pkg);
              }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>

            {canManage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-white/10"
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditPkg(pkg);
                    setModalOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(pkg);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canManage, handleDelete],
  );

  return (
    <div>
      <PageHeader
        title="Packages"
        description="Service packages available for sale."
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditPkg(null);
                setModalOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Package
            </Button>
          ) : null
        }
      />

      <FilterBar>
        <FilterGroup
          activeCount={activeFilters.length}
          onClear={handleClear}
        >
          <FilterLabel label="Category">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full bg-white/5 border-white/10">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(Object.values(PackageCategory) as PackageCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>
        </FilterGroup>
      </FilterBar>

      <FilterChips
        filters={activeFilters}
        onRemove={handleClear}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(pkg) => setDetailPkg(pkg)}
        keyExtractor={(pkg) => pkg.id}
        emptyTitle="No packages yet"
        emptyDescription="Create your first service package to get started."
      />

      <PackageFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        pkg={editPkg}
      />

      <PackageDetailDialog
        pkg={detailPkg}
        onClose={() => setDetailPkg(null)}
      />
    </div>
  );
}
