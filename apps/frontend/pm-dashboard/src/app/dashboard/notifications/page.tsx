'use client';

import { useMemo } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Pagination } from '@/components/shared';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
  }), [params.page, params.limit]);

  const { data, isLoading } = useNotifications(queryParams);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Task assignments, mentions, approvals, and PM activity alerts."
        action={
          <Button onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark All Read
          </Button>
        }
      />

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="divide-y divide-white/5">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : rows.length > 0 ? (
            rows.map((n: any) => (
              <button
                key={n.id}
                type="button"
                onClick={() => n.status === 'UNREAD' && markRead.mutate(n.id)}
                className={cn(
                  'w-full text-left p-4 hover:bg-white/[0.03] transition-colors',
                  n.status === 'UNREAD' && 'bg-primary/5',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{n.eventType}</p>
                      <p className="text-xs text-muted-foreground">
                        scope: {n.scopeType} / {n.scopeId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                    <p className={cn('text-[10px] mt-1', n.status === 'UNREAD' ? 'text-primary' : 'text-muted-foreground')}>
                      {n.status}
                    </p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-16 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p>No notifications yet.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
          />
        </div>
      </div>
    </div>
  );
}

