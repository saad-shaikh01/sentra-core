'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Eye, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubmissionItem {
  id: string;
  status: string;
  submissionNumber: number;
  submittedAt: string;
  task: {
    name: string;
    project: { name: string; serviceType: string };
    projectStage: { name: string; departmentCode: string };
  };
}

interface QcQueueTableProps {
  submissions: SubmissionItem[];
  isLoading: boolean;
  isError?: boolean;
  onRowClick: (submission: SubmissionItem) => void;
}

export function QcQueueTable({ submissions, isLoading, isError, onRowClick }: QcQueueTableProps) {
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

  const columns = useMemo<Column<SubmissionItem>[]>(() => [
    {
      key: 'taskName',
      header: 'Task / Project',
      className: 'min-w-[250px]',
      render: (s) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground/90 leading-tight">{s.task.name}</span>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold truncate">
            {s.task.project.name} &bull; {s.task.projectStage.name}
          </span>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      className: 'w-[140px]',
      render: (s) => (
        <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border", getDepartmentColor(s.task.projectStage.departmentCode).replace('text-', 'border-').replace('bg-', 'bg-').split(' ')[0] + '/20', getDepartmentColor(s.task.projectStage.departmentCode))}>
          {s.task.projectStage.departmentCode}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-[130px]',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'submissionNumber',
      header: 'Attempt',
      className: 'w-[100px]',
      render: (s) => (
        <span className="text-xs font-bold text-foreground/70">
          Trial #{s.submissionNumber}
        </span>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      className: 'w-[130px]',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
          <Clock className="h-3.5 w-3.5 opacity-50" />
          {new Date(s.submittedAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (s) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onRowClick(s);
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
      data={submissions}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(s) => s.id}
      emptyTitle="Queue is empty"
      emptyDescription="No tasks are currently waiting for quality control review."
    />
  );
}
