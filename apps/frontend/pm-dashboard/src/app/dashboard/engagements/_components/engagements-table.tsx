'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Edit2, Archive } from 'lucide-react';

export interface EnrichedEngagement {
  id: string;
  name: string;
  status: string;
  engagementType: string;
  brandName?: string;
  clientName?: string;
  startDate?: string | null;
  endDate?: string | null;
  _count?: {
    projects: number;
  };
}

interface EngagementsTableProps {
  engagements: EnrichedEngagement[];
  isLoading: boolean;
  isError?: boolean;
  onEdit: (e: EnrichedEngagement) => void;
  onArchive: (e: EnrichedEngagement) => void;
}

export function EngagementsTable({
  engagements,
  isLoading,
  isError,
  onEdit,
  onArchive,
}: EngagementsTableProps) {
  const columns = useMemo<Column<EnrichedEngagement>[]>(() => [
    { 
      key: 'name', 
      header: 'Engagement Name',
      render: (e) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{e.name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{e.engagementType}</span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <StatusBadge status={e.status} />,
    },
    { key: 'brandName', header: 'Brand', render: (e) => e.brandName ?? '—' },
    { key: 'clientName', header: 'Client', render: (e) => e.clientName ?? '—' },
    {
      key: 'projects',
      header: 'Projects',
      render: (e) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{e._count?.projects ?? 0} active</span>
        </div>
      )
    },
    {
      key: 'dates',
      header: 'Timeline',
      render: (e) => (
        <div className="flex flex-col text-[10px] text-muted-foreground uppercase tracking-tighter">
          <span>S: {e.startDate ? new Date(e.startDate).toLocaleDateString() : '—'}</span>
          <span>E: {e.endDate ? new Date(e.endDate).toLocaleDateString() : '—'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (e) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
            onClick={() => onEdit(e)}
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => onArchive(e)}
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [onArchive, onEdit]);

  return (
    <DataTable
      columns={columns}
      data={engagements}
      isLoading={isLoading}
      isError={isError}
      keyExtractor={(e) => e.id}
      emptyTitle="No engagements yet"
      emptyDescription="Engagements are synced from the sales dashboard."
    />
  );
}
