'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamTypeRecord } from '@/hooks/use-teams';

export function TeamFilterBar({
  search,
  onSearch,
  typeId,
  onTypeChange,
  teamTypes,
}: {
  search: string;
  onSearch: (value: string) => void;
  typeId: string | null;
  onTypeChange: (value: string | null) => void;
  teamTypes: TeamTypeRecord[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row">
      <Input
        placeholder="Search teams..."
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        className="max-w-xl bg-white/5 border-white/10"
      />
      <Select
        value={typeId ?? 'all'}
        onValueChange={(value) => onTypeChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-full bg-white/5 border-white/10 md:w-60">
          <SelectValue placeholder="All team types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All team types</SelectItem>
          {teamTypes.map((type) => (
            <SelectItem key={type.id} value={type.id}>
              {type.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
