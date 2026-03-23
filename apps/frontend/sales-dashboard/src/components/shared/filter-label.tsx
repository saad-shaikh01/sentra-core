'use client';

import React from 'react';
import { Label } from '@/components/ui/label';

interface FilterLabelProps {
  label: string;
  children: React.ReactNode;
}

export function FilterLabel({ label, children }: FilterLabelProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
        {label}
      </Label>
      {children}
    </div>
  );
}
