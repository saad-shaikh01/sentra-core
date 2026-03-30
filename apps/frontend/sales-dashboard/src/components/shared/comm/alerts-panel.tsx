'use client';

import { useMemo, useState } from 'react';
import { Bell, BellDot, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useCommAlerts,
  useMarkAllCommAlertsRead,
  useMarkCommAlertRead,
} from '@/hooks/use-comm';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format-date';
import type { CommAlert } from '@/types/comm.types';

type CommAlertsPanelProps = {
  onSelectThread?: (threadId: string) => void;
  className?: string;
};

function severityClassName(alert: CommAlert): string {
  if (alert.severity === 'success') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  }
  if (alert.severity === 'warning') {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  }
  return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300';
}

export function CommAlertsPanel({ onSelectThread, className }: CommAlertsPanelProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useCommAlerts({ status: 'active', limit: 10 });
  const markRead = useMarkCommAlertRead();
  const markAllRead = useMarkAllCommAlertsRead();

  const alerts = useMemo(() => data?.data ?? [], [data]);
  const unreadCount = data?.unreadCount ?? 0;

  const handleAlertClick = async (alert: CommAlert) => {
    if (!alert.isRead) {
      await markRead.mutateAsync(alert.id);
    }
    if (alert.threadId && onSelectThread) {
      onSelectThread(alert.threadId);
    }
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((current) => !current)}
        className="relative h-9 w-9 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      >
        {unreadCount > 0 ? <BellDot className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d13] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Comm Alerts</p>
              <p className="text-[11px] text-muted-foreground">Signals are conservative and estimated where noted.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void markAllRead.mutateAsync()}
              disabled={markAllRead.isPending || unreadCount === 0}
              className="h-8 gap-1.5 text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">No active alerts right now.</p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Hot leads, repeated opens, and overdue follow-ups will surface here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {alerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => void handleAlertClick(alert)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.04]',
                      !alert.isRead && 'bg-white/[0.02]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', severityClassName(alert))}>
                            {alert.alertType.replace(/_/g, ' ')}
                          </span>
                          {!alert.isRead && (
                            <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">{alert.title}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{alert.body}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                        {timeAgo(alert.lastTriggeredAt ?? alert.firstTriggeredAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
