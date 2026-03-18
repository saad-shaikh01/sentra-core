'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { leadsKeys, useUpdateLead } from '@/hooks/use-leads';
import { useTeams } from '@/hooks/use-teams';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TeamAssignmentSelect({
  value,
  leadId,
  onSuccess,
}: {
  value?: string | null;
  leadId: string;
  onSuccess: (newTeamId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('sales:teams:manage');
  const [selectedValue, setSelectedValue] = useState(value ?? 'none');
  const updateLead = useUpdateLead();
  const teamsQuery = useTeams({ limit: 100 });

  useEffect(() => {
    setSelectedValue(value ?? 'none');
  }, [value]);

  return (
    <Select
      value={selectedValue}
      disabled={!canManage || updateLead.isPending}
      onValueChange={async (newValue) => {
        const teamId = newValue === 'none' ? null : newValue;
        await updateLead.mutateAsync({ id: leadId, teamId });
        setSelectedValue(newValue);
        onSuccess(teamId);
        queryClient.invalidateQueries({ queryKey: leadsKeys.detail(leadId) });
      }}
    >
      <SelectTrigger className="border-white/10 bg-white/5">
        <SelectValue placeholder="No team" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">(No team)</SelectItem>
        {(teamsQuery.data?.data ?? []).map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.type.name} · {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
