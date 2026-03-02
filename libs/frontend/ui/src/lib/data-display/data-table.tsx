'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../utils';
import { TableSkeleton } from './table-skeleton';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  loadingRows?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  onRowClick,
  keyExtractor,
  emptyTitle = 'No records found',
  emptyDescription = 'Get started by creating your first record.',
  emptyAction,
  loadingRows = 5,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return <TableSkeleton rows={loadingRows} cols={columns.length} />;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-white/[0.03] py-16">
        <div className="flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            Failed to load data
          </h3>
          <p className="text-xs text-muted-foreground">
            Check your connection and try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-16">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                    column.className,
                    column.headerClassName
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-white/5 transition-colors duration-150 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-white/[0.04]'
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-6 py-4 text-sm text-foreground',
                      column.className
                    )}
                  >
                    {column.render
                      ? column.render(row)
                      : String(
                          (row as Record<string, unknown>)[column.key] ?? '--'
                        )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

