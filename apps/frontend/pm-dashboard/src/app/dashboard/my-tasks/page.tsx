'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs';
import { CheckSquare, AlertTriangle, Clock } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMyTasks } from '@/hooks/use-pm-data';
import { MyTasksTable, MyTask } from './_components/my-tasks-table';
import { TaskDetailDrawer } from './_components/task-detail-drawer';

export default function MyTasksPage() {
  const [params, setParams] = useQueryStates({
    page:         parseAsInteger.withDefault(1),
    limit:        parseAsInteger.withDefault(20),
    status:       parseAsString,
    priority:     parseAsString,
    blocked:      parseAsBoolean.withDefault(false),
    dueSoonHours: parseAsInteger,
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(params.status       ? { status: params.status } : {}),
    ...(params.priority     ? { priority: params.priority } : {}),
    ...(params.blocked      ? { blocked: true } : {}),
    ...(params.dueSoonHours ? { dueSoonHours: params.dueSoonHours } : {}),
  }), [params.page, params.limit, params.status, params.priority, params.blocked, params.dueSoonHours]);

  const { data, isLoading, isError } = useMyTasks(queryParams);

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const tasks = (data?.data ?? []) as MyTask[];
  const resolveTaskId = (task: MyTask) => task.id ?? task.taskId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tasks"
        description="Your personal execution queue. Stay focused and deliver."
      />

      <FilterBar>
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <Select
            value={params.status ?? 'all'}
            onValueChange={(v) => setParams({ status: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="REVISION_REQUIRED">Revision Required</SelectItem>
              <SelectItem value="IN_QC">In QC</SelectItem>
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select
            value={params.priority ?? 'all'}
            onValueChange={(v) => setParams({ priority: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 pl-4 border-l border-white/10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setParams({ dueSoonHours: params.dueSoonHours ? null : 48, page: 1 })}
              className={cn(
                "h-9 text-xs transition-colors",
                params.dueSoonHours
                  ? "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30 hover:text-orange-300"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              )}
            >
              <Clock className="h-3.5 w-3.5 mr-2" />
              Due in 48h
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setParams({ blocked: !params.blocked, page: 1 })}
              className={cn(
                "h-9 text-xs transition-colors",
                params.blocked
                  ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 hover:text-red-300"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-2" />
              Blocked
            </Button>
          </div>
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
        <MyTasksTable
          tasks={tasks}
          isLoading={isLoading}
          isError={isError}
          onRowClick={(t) => setDetailTaskId(resolveTaskId(t))}
        />
        
        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
          />
        </div>
      </div>

      <TaskDetailDrawer
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
      />
    </div>
  );
}
