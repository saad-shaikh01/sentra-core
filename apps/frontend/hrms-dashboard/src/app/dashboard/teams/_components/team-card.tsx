'use client';

import { MoreHorizontal, User } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TeamTypeBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import type { TeamSummary } from './types';

export function TeamCard({
  team,
  onClick,
  onEdit,
  onDelete,
}: {
  team: TeamSummary;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('hrms:teams:manage');

  return (
    <Card className="cursor-pointer" onClick={onClick}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <TeamTypeBadge type={team.type} />
            <div>
              <h3 className="text-base font-medium">{team.name}</h3>
              {team.description ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">{team.description}</p>
              ) : null}
            </div>
          </div>

          {canManage ? (
            <div onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-300" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{team.manager ? team.manager.name : 'No manager assigned'}</span>
          <span>·</span>
          <span>{team.memberCount} members</span>
        </div>
      </CardContent>
    </Card>
  );
}
