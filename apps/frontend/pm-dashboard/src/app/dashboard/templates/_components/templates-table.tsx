'use client';

import { useMemo } from 'react';
import { DataTable, Column, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Edit, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

export interface TemplateItem {
  id: string;
  name: string;
  serviceType: string;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  _count?: { stages: number };
}

interface TemplatesTableProps {
  templates: TemplateItem[];
  isLoading: boolean;
  isError?: boolean;
  onRowClick: (template: TemplateItem) => void;
  onEdit: (template: TemplateItem) => void;
  onDuplicate: (template: TemplateItem) => void;
  onArchive: (template: TemplateItem) => void;
}

export function TemplatesTable({ templates, isLoading, isError, onRowClick, onEdit, onDuplicate, onArchive }: TemplatesTableProps) {
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const columns = useMemo<Column<TemplateItem>[]>(() => [
    {
      key: 'name',
      header: 'Template Name',
      render: (t) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground flex items-center gap-2">
            {t.name}
            {t.isDefault && <span className="bg-primary/20 text-primary text-[9px] uppercase px-1.5 py-0.5 rounded font-bold">Default</span>}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            v{t.version} &bull; {t.serviceType}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-xs font-medium",
          t.isActive ? "bg-green-500/10 text-green-400" : "bg-white/5 text-muted-foreground"
        )}>
          {t.isActive ? 'Active' : 'Archived'}
        </span>
      ),
    },
    {
      key: 'stages',
      header: 'Stages',
      render: (t) => (
        <span className="text-xs font-medium text-muted-foreground">
          {t._count?.stages ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (t) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={() => onEdit(t)}>
            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={() => onDuplicate(t)}>
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => {
            openConfirmDialog({
              title: `Archive "${t.name}"?`,
              description: 'This template will no longer be available for new projects.',
              onConfirm: () => onArchive(t),
            });
          }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [onEdit, onDuplicate, onArchive, openConfirmDialog]);

  return (
    <DataTable
      columns={columns}
      data={templates}
      isLoading={isLoading}
      isError={isError}
      onRowClick={onRowClick}
      keyExtractor={(t) => t.id}
      emptyTitle="No templates found"
      emptyDescription="Create a template to standardize your project workflows."
    />
  );
}
