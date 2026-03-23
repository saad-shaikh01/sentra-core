'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface ActiveFilter {
  key: string;
  label: string;
  displayValue: string;
}

interface FilterChipsProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClear: () => void;
}

export function FilterChips({ filters, onRemove, onClear }: FilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {filters.map((filter) => (
        <Badge
          key={filter.key}
          variant="outline"
          className="flex items-center gap-1.5 pl-3 pr-1 py-1 bg-primary/10 border-primary/20 text-primary lowercase tracking-normal font-medium text-xs hover:bg-primary/20 transition-all rounded-full group"
        >
          <span className="text-muted-foreground/60 font-semibold">{filter.label}:</span>
          <span className="text-primary-foreground font-semibold">{filter.displayValue}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(filter.key)}
            className="h-5 w-5 rounded-full hover:bg-primary/30 p-0 text-primary hover:text-white transition-colors ml-1"
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
      >
        Clear all
      </Button>
    </div>
  );
}
