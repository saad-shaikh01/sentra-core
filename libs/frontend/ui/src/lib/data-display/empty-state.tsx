'use client';

import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className
      )}
      {...props}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mb-4 max-w-xs text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

