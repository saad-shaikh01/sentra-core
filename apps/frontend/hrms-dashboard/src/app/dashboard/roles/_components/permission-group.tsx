'use client';

import { Check, Minus } from 'lucide-react';
import type { RbacPermission } from '../../employees/_components/types';

export function PermissionGroup({
  resource,
  permissions,
  assignedIds,
  editable,
  onToggle,
}: {
  resource: string;
  permissions: RbacPermission[];
  assignedIds: Set<string>;
  editable: boolean;
  onToggle?: (permissionId: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium capitalize">{resource.replace(/_/g, ' ')}</h4>
      <div className="space-y-2">
        {permissions.map((permission) => {
          const checked = assignedIds.has(permission.id);

          return (
            <div
              key={permission.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{permission.label}</p>
                <p className="truncate text-xs text-muted-foreground">{permission.code}</p>
              </div>

              {editable ? (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onToggle?.(permission.id, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              ) : checked ? (
                <Check className="h-4 w-4 text-emerald-300" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
