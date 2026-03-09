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
      { key: 'title', header: 'Title' },
      { key: 'name', header: 'Contact', render: (lead) => lead.name ?? '—' },
      { key: 'email', header: 'Email', render: (lead) => lead.email ?? '—' },
      {
        key: 'status',
        header: 'Status',
        render: (lead) => <StatusBadge status={lead.status} />,
      },
      { key: 'brandName', header: 'Brand', render: (lead) => lead.brandName ?? '—' },
      { key: 'assigneeName', header: 'Assigned', render: (lead) => lead.assigneeName ?? '—' },
      { key: 'source', header: 'Source', render: (lead) => lead.source ?? '—' },
      {
        key: 'createdAt',
        header: 'Created',
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
                title: `Delete "${lead.title}"?`,
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
    />
  );
}
