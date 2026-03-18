'use client';

import { useQuery } from '@tanstack/react-query';
import { hrmsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import type { ActivityLogItem } from '../../_components/types';
import { formatDateTime, formatRelativeTime } from '../../_components/utils';

export function ActivityTab({
  userId,
}: {
  userId: string;
}) {
  const activityQuery = useQuery({
    queryKey: ['employee-activity', userId],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: ActivityLogItem[] }>(`/employees/${userId}/activity`);
      return response.data;
    },
    retry: false,
  });

  if (activityQuery.isLoading) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Loading activity...
        </CardContent>
      </Card>
    );
  }

  if (activityQuery.isError || !activityQuery.data?.length) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No activity recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activityQuery.data.map((item) => {
        const action = item.action || item.event || 'Activity';
        const actor = item.actorName || item.adminName || item.performedByName || 'System';
        const description = item.description || item.reason || '';
        const timestamp = item.createdAt || item.timestamp || null;

        return (
          <Card key={item.id} className="border-white/10 bg-white/[0.03]">
            <CardContent className="space-y-1 pt-6">
              <p className="text-sm font-medium">{action}</p>
              <p className="text-sm text-muted-foreground">
                by {actor}
                {timestamp ? ` · ${formatRelativeTime(timestamp)}` : ''}
              </p>
              {description ? <p className="text-sm">{description}</p> : null}
              {timestamp ? (
                <p className="text-xs text-muted-foreground">{formatDateTime(timestamp)}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
