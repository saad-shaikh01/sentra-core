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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      {/* Left side: Range Info */}
      <div className="flex items-center gap-4 order-2 sm:order-1">
        <p className="text-xs font-medium text-muted-foreground/70 whitespace-nowrap">
          {hasKnownTotal
            ? <>Showing <span className="text-foreground/90 font-semibold">{rangeStart}</span> to <span className="text-foreground/90 font-semibold">{rangeEnd}</span> of <span className="text-foreground/90 font-semibold">{total}</span> {itemLabel}</>
            : <>Showing <span className="text-foreground/90 font-semibold">{rangeStart}</span> to <span className="text-foreground/90 font-semibold">{rangeEnd}</span>{hasNextPage ? '+' : ''} {itemLabel}</>
          }
        </p>

        {onLimitChange && (
          <div className="hidden md:flex items-center gap-2 border-l border-white/5 pl-4 ml-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/50 whitespace-nowrap px-2">Per page</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-7 w-[65px] bg-white/[0.03] border-white/5 text-[11px] font-medium transition-colors hover:bg-white/[0.05]">
                <SelectValue placeholder={String(limit)} />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-white/10">
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
        <div className="flex items-center bg-white/[0.02] border border-white/5 rounded-xl p-1 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(1)}
            disabled={!canGoPrevious}
            className="h-7 w-7 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30"
            title="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(page - 1)}
            disabled={!canGoPrevious}
            className="h-7 w-7 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <div className="h-3 w-px bg-white/5 mx-1" />

          <div className="flex items-center px-3">
            <span className="text-xs font-bold text-foreground/90">
              {page}
            </span>
            {totalPages && (
              <span className="text-[11px] text-muted-foreground/50 ml-1.5 font-medium">
                of {totalPages}
              </span>
            )}
          </div>

          <div className="h-3 w-px bg-white/5 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(page + 1)}
            disabled={!canGoNext}
            className="h-7 w-7 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30"
            title="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          {totalPages && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(totalPages)}
              disabled={!canGoNext}
              className="h-7 w-7 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30"
              title="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {onLimitChange && (
          <div className="md:hidden flex items-center gap-2">
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-9 w-[65px] bg-white/[0.03] border-white/5 rounded-xl">
                <SelectValue placeholder={String(limit)} />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-white/10">
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

  const stickyStyles = sticky
    ? "sticky bottom-6 z-40 mt-10"
    : "mt-8";

  return (
    <div className={cn(
      stickyStyles,
      "w-full transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 ",
      className
    )}>
      <div className="bg-black/40 backdrop-blur-xl border border-white/[0.05] rounded-2xl px-4 py-2 mt-4 shadow-2xl shadow-black/40 ring-1 ring-white/[0.02]">
        {paginationContent}
      </div>
    </div>
  );
}
