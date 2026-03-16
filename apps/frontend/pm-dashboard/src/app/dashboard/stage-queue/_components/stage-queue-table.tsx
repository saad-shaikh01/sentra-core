'use client';

import { useState } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Eye, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

function ExpandedTasks({ stageId }: { stageId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stages', stageId, 'tasks'],
    queryFn: () => api.getTasksByStage(stageId, { limit: 20 }),
    staleTime: 30_000,
  });

  const tasks = (data as any)?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-1 py-1">
        {[1, 2].map(i => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <p className="text-xs text-muted-foreground py-2 px-1">No tasks in this stage.</p>;
  }

  return (
    <div className="space-y-1 py-1">
      {tasks.map((task: any) => {
        const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED';
        return (
          <div key={task.id} className={cn('flex items-center justify-between px-3 py-2 rounded-lg text-xs', isOverdue ? 'bg-red-500/5 border border-red-500/20' : 'bg-white/[0.02] border border-white/5')}>
            <div className="flex items-center gap-2">
              <div className={cn('h-1.5 w-1.5 rounded-full', task.status === 'COMPLETED' ? 'bg-green-500' : task.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-muted-foreground/30')} />
              <span className={cn('font-medium', isOverdue ? 'text-red-400' : 'text-foreground/80')}>{task.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={task.status} />
              <span className="text-muted-foreground uppercase font-bold tracking-wider">{task.priority}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StageQueueTable({ stages, isLoading, isError }: StageQueueTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const columns: Column<StageItem>[] = [
    {
      key: 'expand',
      header: '',
      className: 'w-10',
      render: (s) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-white/10"
          onClick={(e) => { e.stopPropagation(); toggleExpand(s.id); }}
        >
          {expanded[s.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
      ),
    },
    {
      key: 'name',
      header: 'Stage Name',
      render: (s) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{s.name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {s.project.name} &bull; {s.project.serviceType}
          </span>
          {expanded[s.id] && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <ExpandedTasks stageId={s.id} />
            </div>
          )}
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
  ];

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
