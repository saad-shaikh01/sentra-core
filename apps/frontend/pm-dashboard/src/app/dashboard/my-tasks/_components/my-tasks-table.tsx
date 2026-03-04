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
      render: (t) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{t.name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {t.project.name} &bull; {t.projectStage.name}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={t.status} />
          {t.isBlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-400/10 px-1.5 py-0.5 rounded w-fit">
              <AlertTriangle className="h-3 w-3" /> BLOCKED
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (t) => {
        const colors: Record<string, string> = {
          LOW: 'text-muted-foreground',
          MEDIUM: 'text-blue-400',
          HIGH: 'text-orange-400',
          URGENT: 'text-red-400',
        };
        return (
          <span className={cn('text-xs font-bold uppercase tracking-wider', colors[t.priority])}>
            {t.priority}
          </span>
        );
      },
    },
    {
      key: 'dueAt',
      header: 'Due',
      render: (t) => {
        if (!t.dueAt) return '—';
        const isOverdue = new Date(t.dueAt) < new Date() && t.status !== 'COMPLETED';
        return (
          <div className={cn("flex items-center gap-1.5 text-xs", isOverdue ? "text-red-400 font-bold" : "text-muted-foreground")}>
            <Clock className="h-3.5 w-3.5" />
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
