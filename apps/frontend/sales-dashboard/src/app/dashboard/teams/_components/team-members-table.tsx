'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';
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
import { MemberDetailModal } from './member-detail-modal';
import { type TeamMemberRecord } from '@/hooks/use-teams';

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
  const [selectedMember, setSelectedMember] = useState<TeamMemberRecord | null>(null);

  function openMemberDetail(member: TeamMemberRecord) {
    setSelectedMember(member);
  }

  if (team.members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center text-sm text-muted-foreground">
        No members have been added to this team yet.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Mobile Card View */}
        <div className="grid grid-cols-1 gap-4 lg:hidden">
          {team.members.map((member) => (
            <div
              key={member.userId}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <button
                      className="truncate text-left text-sm font-medium hover:text-primary hover:underline focus:outline-none"
                      onClick={() => openMemberDetail(member)}
                    >
                      {member.name}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-white/10"
                    onClick={() => openMemberDetail(member)}
                    title="View member details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canManage && (
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
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Role
                </span>
                {canManage ? (
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      updateTeamMember.mutate({ userId: member.userId, role })
                    }
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="LEAD">Lead</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm font-medium">{member.role}</span>
                )}
              </div>
              {member.jobTitle && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {member.jobTitle}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_140px_100px] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="divide-y divide-white/10">
            {team.members.map((member) => (
              <div
                key={member.userId}
                className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_140px_100px] gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <button
                      className="truncate text-left text-sm font-medium hover:text-primary hover:underline focus:outline-none"
                      onClick={() => openMemberDetail(member)}
                    >
                      {member.name}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.jobTitle ?? 'Team member'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center truncate text-sm text-muted-foreground">
                  {member.email}
                </div>
                <div className="flex items-center">
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
                    <p className="text-sm">{member.role}</p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-white/10"
                    onClick={() => openMemberDetail(member)}
                    title="View member details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canManage && (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          teamName={team.name}
          open={selectedMember !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedMember(null);
          }}
        />
      )}
    </>
  );
}
