'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { TeamStats } from '@/hooks/use-teams';

const statConfig: Array<{
  key: keyof TeamStats;
  label: string;
  suffix?: string;
  prefix?: string;
}> = [
  { key: 'totalLeads', label: 'Total Leads' },
  { key: 'wonLeads', label: 'Won Leads' },
  { key: 'lostLeads', label: 'Lost Leads' },
  { key: 'conversionRate', label: 'Conversion Rate', suffix: '%' },
  { key: 'totalSales', label: 'Total Sales' },
  { key: 'totalRevenue', label: 'Revenue', prefix: '$' },
];

export function TeamStatsCards({
  stats,
  isLoading,
  isError,
}: {
  stats?: TeamStats;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {statConfig.map((stat) => (
        <Card key={stat.key} hover={false}>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {stat.label}
            </p>
            {isLoading ? (
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-white/10" />
            ) : (
              <p className="mt-3 text-3xl font-semibold">
                {isError || !stats
                  ? '—'
                  : `${stat.prefix ?? ''}${stat.key === 'totalRevenue' ? Number(stats[stat.key]).toLocaleString() : stats[stat.key]}${stat.suffix ?? ''}`}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
