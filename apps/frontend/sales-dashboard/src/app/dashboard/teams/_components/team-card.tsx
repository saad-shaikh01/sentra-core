'use client';

import Link from 'next/link';
import { Users, UserRound, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TeamTypeBadge } from './team-type-badge';
import type { TeamStats, TeamSummary } from '@/hooks/use-teams';

function StatLine({
  stats,
  isLoading,
}: {
  stats?: TeamStats | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div className="h-4 w-40 animate-pulse rounded bg-white/10" />;
  }

  if (!stats) {
    return <p className="text-sm text-muted-foreground">This month: stats unavailable</p>;
  }

  return (
    <p className="text-sm text-muted-foreground">
      This month: <span className="text-foreground">{stats.totalLeads} leads</span> ·{' '}
      <span className="text-emerald-300">{stats.wonLeads} won</span> ·{' '}
      <span className="text-foreground">{stats.totalSales} sales</span>
    </p>
  );
}

export function TeamCard({
  team,
  stats,
  statsLoading,
  canManage,
  onView,
  onEdit,
  onDelete,
}: {
  team: TeamSummary;
  stats?: TeamStats | null;
  statsLoading?: boolean;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card hover={false} className="h-full">
      <CardContent className="flex h-full flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <TeamTypeBadge type={team.type} />
            <div>
              <Link
                href={`/dashboard/teams/${team.id}`}
                className="text-lg font-semibold hover:text-primary transition-colors hover:underline underline-offset-4"
              >
                {team.name}
              </Link>
              {team.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{team.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="h-4 w-4" />
            <span>Manager: {team.manager?.name ?? 'Unassigned'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{team.memberCount} members</span>
          </div>
          <StatLine stats={stats} isLoading={statsLoading} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <Button variant="outline" onClick={onView}>
            View
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
          {canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${team.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-red-500/10 hover:text-red-300"
                onClick={onDelete}
                aria-label={`Delete ${team.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
