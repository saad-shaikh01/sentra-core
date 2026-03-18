'use client';

import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRemoveTeamMember, useUpdateTeamMember, type TeamDetail } from '@/hooks/use-teams';
import { useUIStore } from '@/stores/ui-store';

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

export function TeamMembersTable({
  team,
  canManage,
}: {
  team: TeamDetail;
  canManage: boolean;
}) {
  const updateTeamMember = useUpdateTeamMember(team.id);
  const removeTeamMember = useRemoveTeamMember(team.id);
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);

  if (team.members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center text-sm text-muted-foreground">
        No members have been added to this team yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_140px_80px] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <div>Name</div>
        <div>Email</div>
        <div>Role</div>
        <div className="text-right">Actions</div>
      </div>
      <div className="divide-y divide-white/10">
        {team.members.map((member) => (
          <div
            key={member.userId}
            className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_140px_80px] gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.jobTitle ?? 'Team member'}</p>
              </div>
            </div>
            <div className="truncate text-sm text-muted-foreground">{member.email}</div>
            <div>
              {canManage ? (
                <Select
                  value={member.role}
                  onValueChange={(role) =>
                    updateTeamMember.mutate({ userId: member.userId, role })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="LEAD">Lead</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="pt-2 text-sm">{member.role}</p>
              )}
            </div>
            <div className="flex justify-end">
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => {
                    openConfirmDialog({
                      title: `Remove ${member.name}?`,
                      description: 'This user will lose access to this team immediately.',
                      onConfirm: () => removeTeamMember.mutate(member.userId),
                    });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
