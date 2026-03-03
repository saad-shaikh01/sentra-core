'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Eye, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface StageItem {
  id: string;
  name: string;
  departmentCode: string;
  status: string;
  dueAt: string | null;
  project: { id: string; name: string; serviceType: string };
  _count?: { tasks: number };
}

interface StageQueueTableProps {
  stages: StageItem[];
  isLoading: boolean;
  isError?: boolean;
}

export function StageQueueTable({ stages, isLoading, isError }: StageQueueTableProps) {
  const getDepartmentColor = (code: string) => {
    const colors: Record<string, string> = {
      DESIGN: 'text-pink-400 bg-pink-400/10',
      EDITING: 'text-blue-400 bg-blue-400/10',
      MARKETING: 'text-purple-400 bg-purple-400/10',
      DEVELOPMENT: 'text-green-400 bg-green-400/10',
      QC: 'text-amber-400 bg-amber-400/10',
      OPERATIONS: 'text-indigo-400 bg-indigo-400/10',
    };
    return colors[code] || 'text-muted-foreground bg-white/5';
  };

  const columns = useMemo<Column<StageItem>[]>(() => [
    {
      key: 'name',
      header: 'Stage Name',
      render: (s) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{s.name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {s.project.name} &bull; {s.project.serviceType}
          </span>
        </div>
      ),
    },
    {
      key: 'departmentCode',
      header: 'Department',
      render: (s) => (
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", getDepartmentColor(s.departmentCode))}>
          {s.departmentCode}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'dueAt',
      header: 'Due',
      render: (s) => {
        if (!s.dueAt) return '—';
        const isOverdue = new Date(s.dueAt) < new Date() && s.status !== 'COMPLETED';
        return (
          <div className={cn("flex items-center gap-1.5 text-xs", isOverdue ? "text-red-400 font-bold" : "text-muted-foreground")}>
            <Clock className="h-3.5 w-3.5" />
            {new Date(s.dueAt).toLocaleDateString()}
          </div>
        );
      },
    },
    {
      key: 'tasks',
      header: 'Tasks',
      render: (s) => (
        <span className="text-xs font-medium text-muted-foreground">
          {s._count?.tasks ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (s) => (
        <Link href={`/dashboard/projects/${s.project.id}`} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={stages}
      isLoading={isLoading}
      isError={isError}
      keyExtractor={(s) => s.id}
      emptyTitle="No stages in queue"
      emptyDescription="There are currently no stages matching your criteria."
    />
  );
}
