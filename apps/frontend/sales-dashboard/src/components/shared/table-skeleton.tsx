'use client';

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 5, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full animate-pulse">
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex gap-4 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 bg-white/10 rounded flex-1" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 px-6 py-4 border-b border-white/5 last:border-0"
          >
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-3 bg-white/[0.06] rounded flex-1"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
