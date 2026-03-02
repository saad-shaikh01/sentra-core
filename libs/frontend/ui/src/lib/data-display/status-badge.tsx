'use client';

import type { ReactNode } from 'react';
import { Badge } from '../badge';
import { cn } from '../utils';

const toneStyles = {
  neutral: 'border-white/10 bg-white/5 text-muted-foreground',
  info: 'border-blue-500/20 bg-blue-500/15 text-blue-300',
  success: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-300',
  warning: 'border-amber-500/20 bg-amber-500/15 text-amber-300',
  danger: 'border-red-500/20 bg-red-500/15 text-red-300',
  accent: 'border-indigo-500/20 bg-indigo-500/15 text-indigo-300',
} as const;

export type StatusTone = keyof typeof toneStyles;

export interface StatusBadgeProps {
  label: ReactNode;
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border text-[10px] font-bold uppercase tracking-wider',
        toneStyles[tone],
        className
      )}
    >
      {label}
    </Badge>
  );
}

