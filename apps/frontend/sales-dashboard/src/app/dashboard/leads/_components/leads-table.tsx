'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { hasMinimumRole, ILead, UserRole } from '@sentra-core/types';
import { useAuth } from '@/hooks/use-auth';
import { useDeleteLead } from '@/hooks/use-leads';
import { useUIStore } from '@/stores/ui-store';

// Accepts enriched leads with optional display names
export interface EnrichedLead extends ILead {
  brandName?: string;
  assigneeName?: string;
}

interface LeadsTableProps {
  leads: EnrichedLead[];
  isLoading: boolean;
  isError?: boolean;
  onRowClick: (lead: ILead) => void;
}

export function LeadsTable({ leads, isLoading, isError, onRowClick }: LeadsTableProps) {
  const deleteLead = useDeleteLead();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);
  const { user } = useAuth();
  const canDelete = user?.role ? hasMinimumRole(user.role, UserRole.ADMIN) : false;

  const columns = useMemo<Column<EnrichedLead>[]>(() => {
    const baseColumns: Column<EnrichedLead>[] = [
      { key: 'name', header: 'NAME', render: (lead) => lead.name ?? '—', className: 'min-w-[150px] font-semibold' },
      { key: 'email', header: 'Email', render: (lead) => lead.email ?? '—', className: 'min-w-[200px]' },
      { key: 'phone', header: 'Phone', render: (lead) => lead.phone ?? '—', className: 'min-w-[150px]' },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[120px]',
        render: (lead) => <StatusBadge status={lead.status} />,
      },
      { key: 'brandName', header: 'Brand', render: (lead) => lead.brandName ?? '—', className: 'min-w-[120px]' },
      { key: 'assigneeName', header: 'Assigned', render: (lead) => lead.assigneeName ?? '—', className: 'min-w-[150px]' },
      { key: 'source', header: 'Source', render: (lead) => lead.source ?? '—', className: 'w-[100px]' },
      {
        key: 'createdAt',
        header: 'Created',
        className: 'w-[120px]',
        render: (lead) => new Date(lead.createdAt).toLocaleDateString(),
      },
    ];

    if (!canDelete) {
      return baseColumns;
    }

    return [
      ...baseColumns,
      {
        key: 'actions',
        header: '',
        className: 'w-16',
        render: (lead) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
            onClick={(event) => {
              event.stopPropagation();
              openConfirmDialog({
                title: `Delete lead "${lead.name || lead.email}"?`,
                description: 'This action cannot be undone.',
                onConfirm: () => deleteLead.mutate(lead.id),
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ];
  }, [canDelete, deleteLead, openConfirmDialog]);

  return (
    <DataTable
      columns={columns}
      data={leads}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(lead) => lead.id}
      emptyTitle="No leads yet"
      emptyDescription="Create your first lead or switch to Kanban view."
      renderMobileRow={(lead: EnrichedLead) => (
        <div
          onClick={() => onRowClick(lead)}
          className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:bg-white/[0.04]"
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate">{lead.name || '—'}</p>
              <p className="text-xs text-muted-foreground truncate">{lead.email || lead.phone || 'No contact info'}</p>
            </div>
            <StatusBadge status={lead.status} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground border-t border-white/5 pt-3">
            <div>
              <p className="opacity-50">Brand</p>
              <p className="text-foreground mt-0.5">{lead.brandName || '—'}</p>
            </div>
            <div>
              <p className="opacity-50">Assigned</p>
              <p className="text-foreground mt-0.5">{lead.assigneeName || '—'}</p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
