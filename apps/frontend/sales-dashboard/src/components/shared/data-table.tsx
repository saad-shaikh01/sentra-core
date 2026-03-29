'use client';

import React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TableSkeleton } from './table-skeleton';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sticky?: 'left' | 'right';
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
  renderMobileRow?: (row: T) => React.ReactNode;
  stickyHeader?: boolean;
  showDesktopScrollControls?: boolean;
  desktopScrollerClassName?: string;
  desktopScrollerStyle?: React.CSSProperties;
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
  renderMobileRow,
  stickyHeader = false,
  showDesktopScrollControls = false,
  desktopScrollerClassName,
  desktopScrollerStyle,
}: DataTableProps<T>) {
  const desktopScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [desktopScrollState, setDesktopScrollState] = React.useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  React.useEffect(() => {
    if (!showDesktopScrollControls) {
      return;
    }

    const updateScrollState = () => {
      const container = desktopScrollRef.current;

      if (!container) {
        return;
      }

      const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
      const hasOverflow = maxScrollLeft > 8;

      setDesktopScrollState({
        hasOverflow,
        canScrollLeft: container.scrollLeft > 8,
        canScrollRight: container.scrollLeft < maxScrollLeft - 8,
      });
    };

    updateScrollState();

    const container = desktopScrollRef.current;
    container?.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      container?.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [columns, data, showDesktopScrollControls]);

  const scrollDesktopTable = (direction: 'left' | 'right') => {
    const container = desktopScrollRef.current;

    if (!container) {
      return;
    }

    const offset = Math.max(container.clientWidth * 0.75, 260);
    container.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  const getStickyHeaderClasses = (sticky?: Column<T>['sticky']) => {
    if (!stickyHeader && !sticky) {
      return '';
    }

    if (sticky === 'left') {
      return cn(
        'sticky left-0 z-30 border-r border-white/10 bg-[#101014]/95',
        stickyHeader && 'top-0 backdrop-blur-xl',
      );
    }

    if (sticky === 'right') {
      return cn(
        'sticky right-0 z-30 border-l border-white/10 bg-[#101014]/95',
        stickyHeader && 'top-0 backdrop-blur-xl',
      );
    }

    return stickyHeader ? 'sticky top-0 z-20 bg-[#101014]/95 backdrop-blur-xl' : '';
  };

  const getStickyCellClasses = (sticky?: Column<T>['sticky']) => {
    if (sticky === 'left') {
      return 'sticky left-0 z-20 border-r border-white/10 bg-[#0b0b10] group-hover:bg-[#12121a]';
    }

    if (sticky === 'right') {
      return 'sticky right-0 z-20 border-l border-white/10 bg-[#0b0b10] group-hover:bg-[#12121a]';
    }

    return '';
  };

  if (isLoading) {
    return <TableSkeleton rows={5} cols={columns.length} />;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-white/[0.03] py-16">
        <div className="flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Failed to load data</h3>
          <p className="text-xs text-muted-foreground">Check your connection and try refreshing the page.</p>
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-16">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const defaultRenderMobileRow = (row: T) => (
    <div
      onClick={() => onRowClick?.(row)}
      className={cn(
        'space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4',
        onRowClick && 'cursor-pointer active:bg-white/[0.04]'
      )}
    >
      {columns.map((col) => (
        <div key={col.key} className="flex justify-between gap-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            {col.header}
          </span>
          <div className={cn('text-right text-xs font-medium text-foreground/90', col.className)}>
            {col.render
              ? col.render(row)
              : String((row as Record<string, unknown>)[col.key] ?? '—')}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 lg:hidden">
        {data.map((row) => (
          <React.Fragment key={keyExtractor(row)}>
            {renderMobileRow ? renderMobileRow(row) : defaultRenderMobileRow(row)}
          </React.Fragment>
        ))}
      </div>

      <div className="hidden lg:block space-y-3">
        {showDesktopScrollControls && desktopScrollState.hasOverflow && (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollDesktopTable('left')}
              disabled={!desktopScrollState.canScrollLeft}
              className="h-9 w-9 rounded-full"
              aria-label="Scroll table left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollDesktopTable('right')}
              disabled={!desktopScrollState.canScrollRight}
              className="h-9 w-9 rounded-full"
              aria-label="Scroll table right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02] shadow-xl ring-1 ring-white/[0.02]">
          {showDesktopScrollControls && desktopScrollState.hasOverflow && (
            <>
              <div
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-[#09090d] to-transparent transition-opacity duration-200',
                  desktopScrollState.canScrollLeft ? 'opacity-100' : 'opacity-0'
                )}
              />
              <div
                className={cn(
                  'pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-[#09090d] to-transparent transition-opacity duration-200',
                  desktopScrollState.canScrollRight ? 'opacity-100' : 'opacity-0'
                )}
              />
            </>
          )}

          <div
            ref={desktopScrollRef}
            className={cn('overflow-auto overscroll-contain', desktopScrollerClassName)}
            style={desktopScrollerStyle}
          >
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        'px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60',
                        col.className,
                        col.headerClassName,
                        getStickyHeaderClasses(col.sticky)
                      )}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {data.map((row) => (
                  <tr
                    key={keyExtractor(row)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'group transition-all duration-200',
                      onRowClick && 'cursor-pointer hover:bg-white/[0.03]'
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'whitespace-nowrap px-6 py-3.5 align-top text-[13px] font-medium text-foreground/80 transition-colors group-hover:text-foreground',
                          col.className,
                          getStickyCellClasses(col.sticky)
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
