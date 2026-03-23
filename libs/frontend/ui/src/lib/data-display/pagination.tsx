'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '../button';
import { cn } from '../utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

export interface PaginationProps {
  page: number;
  limit: number;
  total?: number;
  hasNextPage?: boolean;
  onChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  itemLabel?: string;
  className?: string;
  sticky?: boolean;
}

export function Pagination({
  page,
  total,
  limit,
  hasNextPage,
  onChange,
  onLimitChange,
  itemLabel = 'items',
  className,
  sticky = true,
}: PaginationProps) {
  const hasKnownTotal = typeof total === 'number';
  const totalPages = hasKnownTotal && total !== undefined ? Math.ceil(total / limit) : undefined;
  const canGoPrevious = page > 1;
  const canGoNext = totalPages ? page < totalPages : Boolean(hasNextPage);

  if (hasKnownTotal && totalPages !== undefined && totalPages <= 1 && !onLimitChange) {
    return null;
  }

  if (!hasKnownTotal && !canGoPrevious && !canGoNext && !onLimitChange) {
    return null;
  }

  const rangeStart = hasKnownTotal && total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd =
    hasKnownTotal && typeof total === 'number'
      ? Math.min(page * limit, total)
      : page * limit;

  const paginationContent = (
    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      {/* Left side: Range Info */}
      <div className="flex items-center gap-4 order-2 sm:order-1">
        <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {hasKnownTotal
            ? <>Showing <span className="text-foreground">{rangeStart}</span> to <span className="text-foreground">{rangeEnd}</span> of <span className="text-foreground">{total}</span> {itemLabel}</>
            : <>Showing <span className="text-foreground">{rangeStart}</span> to <span className="text-foreground">{rangeEnd}</span>{hasNextPage ? '+' : ''} {itemLabel}</>
          }
        </p>

        {onLimitChange && (
          <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Per page</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[70px] bg-white/5 border-white/10 text-xs">
                <SelectValue placeholder={String(limit)} />
              </SelectTrigger>
              <SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)} className="text-xs">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Right side: Controls */}
      <div className="flex items-center gap-2 order-1 sm:order-2">
        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(1)}
            disabled={!canGoPrevious}
            className="h-8 w-8 rounded-lg hover:bg-white/10 transition-colors"
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(page - 1)}
            disabled={!canGoPrevious}
            className="h-8 w-8 rounded-lg hover:bg-white/10 transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <div className="flex items-center px-3">
            <span className="text-sm font-semibold text-foreground">
              {page}
            </span>
            {totalPages && (
              <span className="text-sm text-muted-foreground ml-1">
                / {totalPages}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(page + 1)}
            disabled={!canGoNext}
            className="h-8 w-8 rounded-lg hover:bg-white/10 transition-colors"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {totalPages && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(totalPages)}
              disabled={!canGoNext}
              className="h-8 w-8 rounded-lg hover:bg-white/10 transition-colors"
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {onLimitChange && (
          <div className="md:hidden flex items-center gap-2">
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-10 w-[70px] bg-white/5 border-white/10 rounded-xl">
                <SelectValue placeholder={String(limit)} />
              </SelectTrigger>
              <SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );

  if (!sticky) {
    return (
      <div className={cn('mt-8 py-4 px-4 sm:px-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm', className)}>
        {paginationContent}
      </div>
    );
  }

  return (
    <div className={cn(
      'fixed bottom-6 left-0 right-0 z-40 px-4 sm:px-6 lg:px-8 pointer-events-none',
      className
    )}>
      <div className="max-w-7xl mx-auto pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl shadow-black/40 ring-1 ring-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {paginationContent}
        </div>
      </div>
    </div>
  );
}
