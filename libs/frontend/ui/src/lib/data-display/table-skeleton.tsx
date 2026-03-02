'use client';

import { cn } from '../utils';

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn('w-full animate-pulse', className)}>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex gap-4 border-b border-white/10 bg-white/[0.02] px-6 py-4">
          {Array.from({ length: cols }).map((_, index) => (
            <div key={index} className="h-3 flex-1 rounded bg-white/10" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex gap-4 border-b border-white/5 px-6 py-4 last:border-0"
          >
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="h-3 flex-1 rounded bg-white/[0.06]"
                style={{ opacity: 1 - rowIndex * 0.15 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

