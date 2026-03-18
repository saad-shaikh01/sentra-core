'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TeamTypeBadge, DetailSheet, UserAvatar } from '@/components/shared';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamDetail, TeamSummary } from './types';
import { AddMemberModal } from './add-member-modal';

export function TeamDetailSheet({
  team,
  open,
  onClose,
}: {
  team: TeamSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:teams:manage');
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['team-detail', team?.id],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: TeamDetail }>(`/teams/${team?.id}`);
      return response.data;
    },
    enabled: open && Boolean(team?.id),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'MEMBER' | 'LEAD' }) =>
      hrmsApi.patch(`/teams/${team?.id}/members/${userId}`, { role }),
    onSuccess: () => {
      toast.success('Member role updated.');
      queryClient.invalidateQueries({ queryKey: ['team-detail', team?.id] });
      queryClient.invalidateQueries({ queryKey: ['hrms-teams'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update member role.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => hrmsApi.delete(`/teams/${team?.id}/members/${userId}`),
    onSuccess: () => {
      toast.success('Team member removed.');
      queryClient.invalidateQueries({ queryKey: ['team-detail', team?.id] });
      queryClient.invalidateQueries({ queryKey: ['hrms-teams'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member.');
    },
  });

  const detail = detailQuery.data;

  return (
    <>
      <DetailSheet
        open={open}
        onClose={onClose}
        title={detail?.name ?? team?.name ?? 'Team'}
        description={detail?.description ?? 'Review members and manager details.'}
      >
        {detail ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <TeamTypeBadge type={detail.type} />
              <p className="text-sm text-muted-foreground">{detail.memberCount} members</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Manager</p>
              {detail.manager ? (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <UserAvatar
                    name={detail.manager.name}
                    avatarUrl={detail.manager.avatarUrl}
                    className="h-10 w-10"
                  />
                  <div>
                    <p className="text-sm font-medium">{detail.manager.name}</p>
                    <p className="text-xs text-muted-foreground">{detail.manager.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No manager assigned.</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Members ({detail.memberCount})
                </p>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                {detail.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={member.name}
                        avatarUrl={member.avatarUrl}
                        className="h-10 w-10"
                      />
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.jobTitle || member.email}
                        </p>
                      </div>
                    </div>

                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRoleMutation.mutate({
                              userId: member.userId,
                              role: role as 'MEMBER' | 'LEAD',
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="LEAD">Lead</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeMemberMutation.mutate(member.userId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading team details...</p>
        )}
      </DetailSheet>

      {detail ? (
        <AddMemberModal open={addMemberOpen} team={detail} onOpenChange={setAddMemberOpen} />
      ) : null}
    </>
  );
}
