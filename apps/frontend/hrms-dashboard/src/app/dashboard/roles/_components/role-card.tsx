'use client';

import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { RbacRole } from '../../employees/_components/types';

type RoleRecord = RbacRole & { userCount?: number | null };

export function RoleCard({
  role,
  onClick,
}: {
  role: RoleRecord;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer" onClick={onClick}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{role.name}</p>
              <Badge variant="outline" className="text-[10px]">
                {role.isSystem ? 'system' : 'custom'}
              </Badge>
            </div>
            {role.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{role.description}</p>
            ) : null}
          </div>

          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{role.permissions.length} permissions</span>
          <span>{role.userCount ?? '—'} users</span>
        </div>
      </CardContent>
    </Card>
  );
}
