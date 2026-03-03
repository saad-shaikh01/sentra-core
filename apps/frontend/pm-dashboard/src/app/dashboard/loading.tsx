'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="h-[60vh] w-full flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full bg-primary/20 animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Production Environment...</p>
    </div>
  );
}
