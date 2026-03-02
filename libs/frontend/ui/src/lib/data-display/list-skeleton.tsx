'use client';

import { cn } from '../utils';

export interface ListSkeletonProps {
  items?: number;
  className?: string;
}

export function ListSkeleton({
  items = 4,
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: items }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="mb-3 h-4 w-1/3 animate-pulse rounded bg-white/10" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

