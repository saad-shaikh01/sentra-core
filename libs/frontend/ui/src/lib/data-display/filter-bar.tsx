'use client';

import * as React from 'react';
import { cn } from '../utils';

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function FilterBar({ className, ...props }: FilterBarProps) {
  return (
    <div
      className={cn('mb-6 flex flex-wrap items-center gap-3', className)}
      {...props}
    />
  );
}

