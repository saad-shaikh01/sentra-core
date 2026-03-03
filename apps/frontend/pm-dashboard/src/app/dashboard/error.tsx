'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="h-[60vh] w-full flex flex-col items-center justify-center text-center px-4">
      <div className="h-20 w-20 rounded-3xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      
      <h2 className="text-2xl font-bold tracking-tight mb-2">Production Interrupted</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        We encountered an unexpected error while processing your request. 
        The system logs have been updated.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button onClick={() => reset()} className="shadow-lg shadow-primary/20">
          <RefreshCcw className="h-4 w-4 mr-2" /> Try Again
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">
            <Home className="h-4 w-4 mr-2" /> Back to Safety
          </Button>
        </Link>
      </div>

      <div className="mt-12 p-4 rounded-xl bg-black/40 border border-white/5 max-w-lg w-full">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 text-left">Error Diagnostics</p>
        <p className="text-xs font-mono text-red-400/80 break-all text-left">
          {error.message || 'Unknown runtime exception'}
        </p>
      </div>
    </div>
  );
}
