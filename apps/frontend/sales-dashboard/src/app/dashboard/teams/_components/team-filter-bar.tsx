'use client';

import { useMemo } from 'react';
import { FilterBar, FilterGroup, FilterChips, FilterLabel, ActiveFilter } from '@/components/shared';
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
  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (typeId) {
      const type = teamTypes.find((t) => t.id === typeId);
      filters.push({ key: 'typeId', label: 'Type', displayValue: type?.name ?? typeId });
    }
    return filters;
  }, [typeId, teamTypes]);

  const handleClear = () => {
    onTypeChange(null);
  };

  return (
    <>
      <FilterBar>
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="w-full sm:max-w-xl bg-white/5 border-white/10"
        />
        <FilterGroup
          activeCount={activeFilters.length}
          onClear={handleClear}
        >
          <FilterLabel label="Team Type">
            <Select
              value={typeId ?? 'all'}
              onValueChange={(value) => onTypeChange(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10">
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
          </FilterLabel>
        </FilterGroup>
      </FilterBar>

      <FilterChips
        filters={activeFilters}
        onRemove={(key: string) => onTypeChange(null)}
        onClear={handleClear}
      />
    </>
  );
}
