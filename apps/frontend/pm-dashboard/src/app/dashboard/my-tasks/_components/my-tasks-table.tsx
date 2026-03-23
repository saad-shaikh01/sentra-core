'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Eye, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MyTask {
  id?: string;
  taskId?: string;
  name: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  dueAt: string | null;
  project: { name: string; serviceType: string };
  projectStage: { name: string };
}

interface MyTasksTableProps {
  tasks: MyTask[];
  isLoading: boolean;
  isError?: boolean;
  onRowClick: (task: MyTask) => void;
}

export function MyTasksTable({ tasks, isLoading, isError, onRowClick }: MyTasksTableProps) {
  const resolveTaskId = (task: MyTask) =>
    task.id ?? task.taskId ?? `${task.name}-${task.dueAt ?? 'no-due'}`;

  const columns = useMemo<Column<MyTask>[]>(() => [
    {
      key: 'name',
      header: 'Task Name',
      className: 'min-w-[250px]',
      render: (t) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground/90 leading-tight">{t.name}</span>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold truncate">
            {t.project.name} &bull; {t.projectStage.name}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-[140px]',
      render: (t) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={t.status} />
          {t.isBlocked && (
            <span className="inline-flex items-center gap-1 text-[9px] text-red-400 font-black bg-red-400/10 px-1.5 py-0.5 rounded-sm w-fit border border-red-400/20">
              <AlertTriangle className="h-2.5 w-2.5" /> BLOCKED
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      className: 'w-[110px]',
      render: (t) => {
        const colors: Record<string, string> = {
          LOW: 'text-muted-foreground/70',
          MEDIUM: 'text-blue-400/90',
          HIGH: 'text-orange-400/90',
          URGENT: 'text-red-400/90',
        };
        return (
          <span className={cn('text-[11px] font-black uppercase tracking-widest', colors[t.priority])}>
            {t.priority}
          </span>
        );
      },
    },
    {
      key: 'dueAt',
      header: 'Due',
      className: 'w-[130px]',
      render: (t) => {
        if (!t.dueAt) return <span className="text-muted-foreground/30">—</span>;
        const isOverdue = new Date(t.dueAt) < new Date() && t.status !== 'COMPLETED';
        return (
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", isOverdue ? "text-red-400" : "text-muted-foreground/80")}>
            <Clock className={cn("h-3.5 w-3.5", isOverdue ? "animate-pulse" : "opacity-50")} />
            {new Date(t.dueAt).toLocaleDateString()}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (t) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onRowClick(t);
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ], [onRowClick]);

  return (
    <DataTable
      columns={columns}
      data={tasks}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(t) => resolveTaskId(t)}
      emptyTitle="No tasks assigned to you"
      emptyDescription="You're all caught up! Enjoy your day."
    />
  );
}
