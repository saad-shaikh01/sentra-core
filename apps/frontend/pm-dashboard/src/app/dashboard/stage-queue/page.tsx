'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllStages } from '@/hooks/use-stages';
import { StageQueueTable, StageItem } from './_components/stage-queue-table';

export default function StageQueuePage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    status: parseAsString,
    departmentCode: parseAsString,
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(params.status ? { status: params.status } : {}),
    ...(params.departmentCode ? { departmentCode: params.departmentCode } : {}),
  }), [params.page, params.limit, params.status, params.departmentCode]);

  const { data, isLoading, isError } = useAllStages(queryParams);

  const stages = (data?.data ?? []) as StageItem[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stage Queue"
        description="Monitor and manage high-level production stages across all projects."
      />

      <FilterBar>
        <div className="flex items-center gap-3">
          <Select
            value={params.status ?? 'all'}
            onValueChange={(v) => setParams({ status: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="IN_REVIEW">In Review</SelectItem>
              <SelectItem value="BLOCKED">Blocked</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={params.departmentCode ?? 'all'}
            onValueChange={(v) => setParams({ departmentCode: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="DESIGN">Design</SelectItem>
              <SelectItem value="EDITING">Editing</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="DEVELOPMENT">Development</SelectItem>
              <SelectItem value="QC">QC</SelectItem>
              <SelectItem value="OPERATIONS">Operations</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
        <StageQueueTable
          stages={stages}
          isLoading={isLoading}
          isError={isError}
        />
        
        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
            onLimitChange={(l) => setParams({ limit: l, page: 1 })}
          />
        </div>
      </div>
    </div>
  );
}
