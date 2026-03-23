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
      className: 'min-w-[220px]',
      render: (p) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground/90 leading-none">{p.name}</span>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold">{p.serviceType}</span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-[130px]',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'healthStatus',
      header: 'Health',
      className: 'w-[110px]',
      render: (p) => <StatusBadge status={p.healthStatus} />,
    },
    { key: 'brandName', header: 'Brand', className: 'min-w-[120px]', render: (p) => p.brandName ?? '—' },
    { key: 'clientName', header: 'Client', className: 'min-w-[150px]', render: (p) => p.clientName ?? '—' },
    {
      key: 'deliveryDueAt',
      header: 'Due Date',
      className: 'w-[120px]',
      render: (p) => p.deliveryDueAt ? new Date(p.deliveryDueAt).toLocaleDateString() : '—',
    },
    {
      key: 'progress',
      header: 'Progress',
      className: 'w-[140px]',
      render: (p) => (
        <div className="flex items-center gap-1.5 font-medium">
          <span className="text-[12px]">{p._count?.stages ?? 0} <span className="text-[10px] text-muted-foreground uppercase font-bold">Stg</span></span>
          <div className="h-2.5 w-px bg-white/10" />
          <span className="text-[12px]">{p._count?.tasks ?? 0} <span className="text-[10px] text-muted-foreground uppercase font-bold">Tsk</span></span>
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
