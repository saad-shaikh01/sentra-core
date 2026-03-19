'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Users } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteTeam, useTeamStats, useTeams, useTeamTypes, type TeamSummary } from '@/hooks/use-teams';
import { useUIStore } from '@/stores/ui-store';
import { TeamCard } from './_components/team-card';
import { TeamFilterBar } from './_components/team-filter-bar';
import { CreateEditTeamModal } from './_components/create-edit-team-modal';

function TeamCardWithStats({
  team,
  canManage,
  onView,
  onEdit,
  onDelete,
}: {
  team: TeamSummary;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: stats, isLoading: statsLoading } = useTeamStats(team.id);

  return (
    <TeamCard
      team={team}
      stats={stats}
      statsLoading={statsLoading}
      canManage={canManage}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
      <div className="mt-4 h-6 w-1/2 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-white/10" />
      <div className="mt-6 space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
      </div>
      <div className="mt-6 flex justify-between">
        <div className="h-10 w-24 animate-pulse rounded-lg bg-white/10" />
        <div className="h-10 w-20 animate-pulse rounded-lg bg-white/10" />
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const router = useRouter();
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('sales:teams:manage');
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamSummary | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const deleteTeam = useDeleteTeam();
  const teamTypesQuery = useTeamTypes();

  const filters = useMemo(() => ({
    page: 1,
    limit: 50,
    search: debouncedSearch || undefined,
    typeId: typeId ?? undefined,
  }), [debouncedSearch, typeId]);

  const teamsQuery = useTeams(filters);
  const teams = teamsQuery.data?.data ?? [];
  const totalTeams = teamsQuery.data?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Teams"
        description={`${totalTeams} active team${totalTeams === 1 ? '' : 's'}`}
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditTarget(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          ) : null
        }
      />

      <TeamFilterBar
        search={search}
        onSearch={setSearch}
        typeId={typeId}
        onTypeChange={setTypeId}
        teamTypes={teamTypesQuery.data ?? []}
      />

      {teamsQuery.isError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-300" />
            <div>
              <p className="font-medium text-red-100">Failed to load teams</p>
              <p className="text-sm text-red-100/70">Refresh the page or try again.</p>
            </div>
          </div>
        </div>
      ) : teamsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <EmptyState
            icon={<Users className="h-6 w-6 text-muted-foreground" />}
            title="No teams yet"
            description="Create your first team."
            action={
              canManage ? (
                <Button
                  onClick={() => {
                    setEditTarget(null);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Team
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCardWithStats
              key={team.id}
              team={team}
              canManage={canManage}
              onView={() => router.push(`/dashboard/teams/${team.id}`)}
              onEdit={() => {
                setEditTarget(team);
                setCreateOpen(true);
              }}
              onDelete={() =>
                openConfirmDialog({
                  title: `Delete "${team.name}"?`,
                  description: 'This action cannot be undone.',
                  onConfirm: () => deleteTeam.mutate(team.id),
                })
              }
            />
          ))}
        </div>
      )}

      <CreateEditTeamModal
        open={createOpen}
        editTarget={editTarget}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditTarget(null);
        }}
      />
    </div>
  );
}
