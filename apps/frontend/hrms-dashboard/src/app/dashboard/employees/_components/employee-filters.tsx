'use client';

import { X } from 'lucide-react';
import { FilterBar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EMPLOYEE_APP_FILTER_VALUES,
  EMPLOYEE_STATUS_VALUES,
  type DepartmentOption,
  type EmployeeAppFilter,
  type EmployeeStatus,
} from './types';

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

const APP_LABELS: Record<EmployeeAppFilter, string> = {
  SALES: 'Sales Dashboard',
  PM: 'PM Dashboard',
  HRMS: 'HRMS',
};

export function EmployeeFilters({
  departments,
  search,
  status,
  appCode,
  departmentId,
  onSearchChange,
  onStatusChange,
  onAppCodeChange,
  onDepartmentChange,
  onClearSearch,
}: {
  departments: DepartmentOption[];
  search: string;
  status: EmployeeStatus | null;
  appCode: EmployeeAppFilter | null;
  departmentId: string | null;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: EmployeeStatus | null) => void;
  onAppCodeChange: (value: EmployeeAppFilter | null) => void;
  onDepartmentChange: (value: string | null) => void;
  onClearSearch: () => void;
}) {
  return (
    <FilterBar>
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name or email..."
          className="w-full min-w-[16rem] bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
        />
        {search ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearSearch}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Select
        value={status ?? 'all'}
        onValueChange={(value) =>
          onStatusChange(value === 'all' ? null : (value as EmployeeStatus))
        }
      >
        <SelectTrigger className="w-[11rem] bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {EMPLOYEE_STATUS_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={appCode ?? 'all'}
        onValueChange={(value) =>
          onAppCodeChange(value === 'all' ? null : (value as EmployeeAppFilter))
        }
      >
        <SelectTrigger className="w-[11rem] bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
          <SelectValue placeholder="All apps" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All apps</SelectItem>
          {EMPLOYEE_APP_FILTER_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {APP_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={departmentId ?? 'all'}
        onValueChange={(value) => onDepartmentChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className="w-[12rem] bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {departments.map((department) => (
            <SelectItem key={department.id} value={department.id}>
              {department.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
