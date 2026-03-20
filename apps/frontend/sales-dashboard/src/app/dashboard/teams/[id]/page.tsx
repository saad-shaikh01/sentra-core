'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useTeam, useTeamStats } from '@/hooks/use-teams';
import { TeamTypeBadge } from '../_components/team-type-badge';
import { TeamStatsCards } from '../_components/team-stats-cards';
import { TeamMembersTable } from '../_components/team-members-table';
import { AddMemberModal } from '../_components/add-member-modal';
import { CreateEditTeamModal } from '../_components/create-edit-team-modal';
import { TeamBrandsSection } from '../_components/team-brands-section';

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'all_time', label: 'All time' },
] as const;

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [period, setPeriod] = useState<string>('this_month');
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('sales:teams:manage');
  const teamQuery = useTeam(teamId ?? '');
  const statsQuery = useTeamStats(teamId ?? '', period);
  const team = teamQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-3 px-0 hover:bg-transparent">
          <Link href="/dashboard/teams">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Teams
          </Link>
        </Button>
        <PageHeader
          title={team?.name ?? 'Team'}
          description={team?.description ?? 'Review team structure and lead performance.'}
          action={
            canManage && team ? (
              <Button onClick={() => setEditOpen(true)}>Edit Team</Button>
            ) : null
          }
        />
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          {team?.type ? <TeamTypeBadge type={team.type} /> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Manager</p>
              <p className="mt-1 text-sm">{team?.manager?.name ?? 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Email</p>
              <p className="mt-1 text-sm text-muted-foreground">{team?.manager?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Members</p>
              <p className="mt-1 text-sm">{team?.memberCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-xs">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stats Period</p>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TeamStatsCards
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        isError={statsQuery.isError}
      />

      {teamId ? <TeamBrandsSection teamId={teamId} canManage={canManage} /> : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="text-sm text-muted-foreground">Manage team leads and members.</p>
          </div>
          {canManage && team ? (
            <Button variant="outline" onClick={() => setAddMemberOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          ) : null}
        </div>

        {team ? (
          <TeamMembersTable team={team} canManage={canManage} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
            Loading team details...
          </div>
        )}
      </section>

      {team ? (
        <>
          <AddMemberModal open={addMemberOpen} team={team} onOpenChange={setAddMemberOpen} />
          <CreateEditTeamModal open={editOpen} editTarget={team} onOpenChange={setEditOpen} />
        </>
      ) : null}
    </div>
  );
}
