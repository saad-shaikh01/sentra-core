'use client';

import { WifiOff } from 'lucide-react';
import { useCommSocket } from '@/hooks/use-comm-socket';
import { useUIStore } from '@/stores/ui-store';
import { COMM_ENABLED } from '@/lib/feature-flags';

/**
 * Mount once in the dashboard layout.
 * Activates the comm WebSocket connection and renders a subtle
 * reconnect banner when the connection drops.
 */
export function CommEventsWatcher() {
  useCommSocket();
  const status = useUIStore((s) => s.commConnectionStatus);

  if (!COMM_ENABLED) return null;
  if (status !== 'disconnected' && status !== 'error') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 border border-white/10 backdrop-blur-sm text-xs text-muted-foreground shadow-lg animate-pulse">
        <WifiOff className="h-3 w-3 text-amber-400" />
        <span>Reconnecting to mail...</span>
      </div>
    </div>
  );
}
