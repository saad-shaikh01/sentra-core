'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/shared';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { TeamCard } from './_components/team-card';
import { TeamDetailSheet } from './_components/team-detail-sheet';
import { CreateEditTeamModal } from './_components/create-edit-team-modal';
import { TeamTypesModal } from './_components/team-types-modal';
import type { TeamListResponse, TeamSummary } from './_components/types';

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [editTarget, setEditTarget] = useState<TeamSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamSummary | null>(null);

  const teamsQuery = useQuery({
    queryKey: ['hrms-teams'],
    queryFn: () => hrmsApi.get<TeamListResponse>('/teams', { page: 1, limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => hrmsApi.delete(`/teams/${teamId}`),
    onSuccess: () => {
      toast.success('Team deleted.');
      queryClient.invalidateQueries({ queryKey: ['hrms-teams'] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete team.');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description={`${teamsQuery.data?.meta.total ?? 0} teams`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTypesOpen(true)}>
              Manage Team Types
            </Button>
            {hasPermission('hrms:teams:manage') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            ) : null}
          </div>
        }
      />

      {teamsQuery.data?.data.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamsQuery.data.data.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onClick={() => setSelectedTeam(team)}
              onEdit={() => {
                setEditTarget(team);
                setCreateOpen(true);
              }}
              onDelete={() => setDeleteTarget(team)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <EmptyState
            title="No teams yet"
            description="Create your first team to organize employees."
          />
        </div>
      )}

      <TeamDetailSheet team={selectedTeam} open={Boolean(selectedTeam)} onClose={() => setSelectedTeam(null)} />
      <CreateEditTeamModal
        open={createOpen}
        editTarget={editTarget}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditTarget(null);
        }}
      />
      <TeamTypesModal open={typesOpen} onOpenChange={setTypesOpen} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.name ?? 'team'}?`}
        description="This will archive the team and remove it from active listings."
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete Team'}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
