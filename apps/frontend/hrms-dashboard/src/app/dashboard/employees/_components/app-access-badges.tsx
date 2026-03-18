'use client';

import { Badge } from '@/components/ui/badge';
import { getAppBadge, type EmployeeAppAccess } from './types';

export function AppAccessBadges({
  apps,
}: {
  apps: EmployeeAppAccess[];
}) {
  if (!apps.length) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {apps.map((app) => {
        const badge = getAppBadge(app.appCode);
        if (!badge) return null;

        return (
          <Badge
            key={`${app.appCode}-${app.appLabel}`}
            variant="outline"
            className={`h-6 min-w-6 justify-center rounded-md border px-2 text-[10px] ${badge.className}`}
            title={badge.title}
          >
            {badge.label}
          </Badge>
        );
      })}
    </div>
  );
}
