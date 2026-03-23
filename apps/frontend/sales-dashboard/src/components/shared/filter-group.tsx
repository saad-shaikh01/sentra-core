'use client';

import React, { useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface FilterGroupProps {
  children: React.ReactNode;
  activeCount?: number;
  onClear?: () => void;
}

export function FilterGroup({ children, activeCount = 0, onClear }: FilterGroupProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'flex items-center gap-2 bg-white/5 border-white/10 hover:bg-white/10 transition-all',
            activeCount > 0 && 'border-primary/50 bg-primary/5 text-primary'
          )}
        >
          <Filter className="h-4 w-4" />
          <span>Filter</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4">
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 opacity-50 transition-transform', open && 'rotate-180')} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-black/90 backdrop-blur-2xl border-white/10">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </DialogTitle>
          {onClear && activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground h-8"
            >
              Clear all
            </Button>
          )}
        </DialogHeader>
        <div className="py-6 space-y-6 max-h-[60vh] overflow-y-auto px-1">
          {children}
        </div>
        <div className="flex justify-end pt-4 border-t border-white/5">
          <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Apply Filters
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
