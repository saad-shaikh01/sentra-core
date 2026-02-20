'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { ILead } from '@sentra-core/types';
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
  const deleteLead        = useDeleteLead();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const columns = useMemo<Column<EnrichedLead>[]>(() => [
    { key: 'title',        header: 'Title' },
    {
      key:    'status',
      header: 'Status',
      render: (l) => <StatusBadge status={l.status} />,
    },
    { key: 'brandName',    header: 'Brand',    render: (l) => l.brandName    ?? '—' },
    { key: 'assigneeName', header: 'Assigned', render: (l) => l.assigneeName ?? '—' },
    { key: 'source',       header: 'Source',   render: (l) => l.source       ?? '—' },
    {
      key:    'createdAt',
      header: 'Created',
      render: (l) => new Date(l.createdAt).toLocaleDateString(),
    },
    {
      key:       'actions',
      header:    '',
      className: 'w-16',
      render:    (l) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            openConfirmDialog({
              title:       `Delete "${l.title}"?`,
              description: 'This action cannot be undone.',
              onConfirm:   () => deleteLead.mutate(l.id),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ], [deleteLead, openConfirmDialog]);

  return (
    <DataTable
      columns={columns}
      data={leads}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(l) => l.id}
      emptyTitle="No leads yet"
      emptyDescription="Create your first lead or switch to Kanban view."
    />
  );
}
