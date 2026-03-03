'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Eye, ExternalLink } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import Link from 'next/link';

export interface EnrichedProject {
  id: string;
  name: string;
  status: string;
  priority: string;
  healthStatus: string;
  serviceType: string;
  brandName?: string;
  clientName?: string;
  deliveryDueAt?: string | null;
  createdAt: string;
  _count?: {
    stages: number;
    tasks: number;
  };
}

interface ProjectsTableProps {
  projects: EnrichedProject[];
  isLoading: boolean;
  isError?: boolean;
  onRowClick: (project: EnrichedProject) => void;
}

export function ProjectsTable({ projects, isLoading, isError, onRowClick }: ProjectsTableProps) {
  const columns = useMemo<Column<EnrichedProject>[]>(() => [
    { 
      key: 'name', 
      header: 'Project Name',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{p.name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{p.serviceType}</span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'healthStatus',
      header: 'Health',
      render: (p) => <StatusBadge status={p.healthStatus} />,
    },
    { key: 'brandName', header: 'Brand', render: (p) => p.brandName ?? '—' },
    { key: 'clientName', header: 'Client', render: (p) => p.clientName ?? '—' },
    {
      key: 'deliveryDueAt',
      header: 'Due Date',
      render: (p) => p.deliveryDueAt ? new Date(p.deliveryDueAt).toLocaleDateString() : '—',
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{p._count?.stages ?? 0} Stages</span>
          <span className="text-[10px] text-muted-foreground">/</span>
          <span className="text-xs font-medium">{p._count?.tasks ?? 0} Tasks</span>
        </div>
      )
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (p) => (
        <Link href={`/dashboard/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={projects}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(p) => p.id}
      emptyTitle="No projects yet"
      emptyDescription="Create your first project from an engagement or template."
    />
  );
}
