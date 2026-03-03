'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../button';
import { cn } from '../utils';

export interface PaginationProps {
  page: number;
  limit: number;
  total?: number;
  hasNextPage?: boolean;
  onChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}

export function Pagination({
  page,
  total,
  limit,
  hasNextPage,
  onChange,
  itemLabel = 'items',
  className,
}: PaginationProps) {
  const hasKnownTotal = typeof total === 'number';
  const totalPages = hasKnownTotal && total !== undefined ? Math.ceil(total / limit) : undefined;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages ? page < totalPages : Boolean(hasNextPage);

  if (hasKnownTotal && totalPages !== undefined && totalPages <= 1) {
    return null;
  }

  if (!hasKnownTotal && !canGoPrevious && !canGoNext) {
    return null;
  }

  const rangeStart = hasKnownTotal && total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd =
    hasKnownTotal && typeof total === 'number'
      ? Math.min(page * limit, total)
      : page * limit;

  return (
    <div className={cn('mt-4 flex items-center justify-between px-1', className)}>
      <p className="text-xs text-muted-foreground">
        {hasKnownTotal
          ? `Showing ${rangeStart}-${rangeEnd} of ${total} ${itemLabel}`
          : `Showing ${rangeStart}-${rangeEnd}${hasNextPage ? '+' : ''} ${itemLabel}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={!canGoPrevious}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-muted-foreground">
          {totalPages ? `${page} / ${totalPages}` : `Page ${page}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={!canGoNext}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

