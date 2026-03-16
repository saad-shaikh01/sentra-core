'use client';

import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useProjectBoard, projectsKeys } from '@/hooks/use-projects';
import { pmKeys } from '@/hooks/use-pm-data';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared';
import { toast } from '@/hooks/use-toast';
import { useMembers } from '@/hooks/use-organization';
import { Lock, Plus, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectKanbanBoardProps {
  projectId: string;
  onTaskClick: (taskId: string) => void;
}

type BoardTask = {
  id: string;
  projectStageId: string;
  name: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueAt: string | null;
  sortOrder: number;
  isBlocked: boolean;
};

type BoardStage = {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  departmentCode: string;
  ownerLeadId: string | null;
  dueAt: string | null;
  _count?: { tasks: number; completedTasks?: number };
  tasks: BoardTask[];
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-muted-foreground',
};

function QuickAddTaskForm({
  stageId,
  projectId,
  taskCount,
  onAdded,
}: {
  stageId: string;
  projectId: string;
  taskCount: number;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const createMutation = useMutation({
    mutationFn: (taskName: string) =>
      api.createTask(stageId, projectId, { name: taskName, priority: 'MEDIUM', sortOrder: taskCount }),
    onSuccess: () => {
      setName('');
      setOpen(false);
      onAdded();
      toast.success('Task added');
    },
    onError: (e: Error) => toast.error('Failed to add task', e.message),
  });

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-1 border border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all h-8 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3 mr-1" /> Add Task
      </Button>
    );
  }

  return (
    <div className="mt-2 p-2 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
      <input
        autoFocus
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/50"
        placeholder="Task name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) createMutation.mutate(name.trim());
          if (e.key === 'Escape') setOpen(false);
        }}
        disabled={createMutation.isPending}
      />
      <div className="flex gap-1 justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => setOpen(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 w-7 p-0 bg-primary hover:bg-primary/90"
          disabled={!name.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(name.trim())}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ProjectKanbanBoard({ projectId, onTaskClick }: ProjectKanbanBoardProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useProjectBoard(projectId);
  const { data: members } = useMembers();
  const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, m.name]));

  const initialStages = useMemo<BoardStage[]>(() => data?.data?.stages ?? [], [data?.data?.stages]);
  const [stages, setStages] = useState<BoardStage[]>([]);

  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const moveMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string;
      sourceStageId: string;
      destStageId: string;
      sourceTasks: BoardTask[];
      destTasks: BoardTask[];
      destinationIndex: number;
    }) => {
      const { taskId, sourceStageId, destStageId, sourceTasks, destTasks, destinationIndex } = payload;

      if (sourceStageId === destStageId) {
        await api.reorderStageTasks(
          sourceStageId,
          sourceTasks.map((task, idx) => ({ taskId: task.id, sortOrder: idx })),
        );
        return;
      }

      await api.moveTask(taskId, {
        projectStageId: destStageId,
        sortOrder: destinationIndex,
      });

      await Promise.all([
        api.reorderStageTasks(
          sourceStageId,
          sourceTasks.map((task, idx) => ({ taskId: task.id, sortOrder: idx })),
        ),
        api.reorderStageTasks(
          destStageId,
          destTasks.map((task, idx) => ({ taskId: task.id, sortOrder: idx })),
        ),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
      toast.success('Board updated');
    },
    onError: (e: Error) => {
      toast.error('Failed to update board', e.message);
      setStages(initialStages);
    },
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceStageIndex = stages.findIndex((s) => s.id === source.droppableId);
    const destStageIndex = stages.findIndex((s) => s.id === destination.droppableId);
    if (sourceStageIndex < 0 || destStageIndex < 0) return;

    const sourceStage = stages[sourceStageIndex];
    const destStage = stages[destStageIndex];
    const sourceTasks = [...sourceStage.tasks];
    const [moved] = sourceTasks.splice(source.index, 1);
    if (!moved || moved.id !== draggableId) return;

    const destTasks =
      sourceStage.id === destStage.id ? sourceTasks : [...destStage.tasks];
    const taskForDest =
      sourceStage.id === destStage.id ? moved : { ...moved, projectStageId: destStage.id };
    destTasks.splice(destination.index, 0, taskForDest);

    const nextStages = [...stages];
    nextStages[sourceStageIndex] = {
      ...sourceStage,
      tasks: sourceStage.id === destStage.id ? destTasks : sourceTasks,
    };
    nextStages[destStageIndex] = {
      ...destStage,
      tasks: destTasks,
    };
    setStages(nextStages);

    moveMutation.mutate({
      taskId: moved.id,
      sourceStageId: sourceStage.id,
      destStageId: destStage.id,
      sourceTasks: sourceStage.id === destStage.id ? destTasks : sourceTasks,
      destTasks,
      destinationIndex: destination.index,
    });
  };

  const invalidateBoard = () => {
    queryClient.invalidateQueries({ queryKey: projectsKeys.board(projectId) });
    queryClient.invalidateQueries({ queryKey: projectsKeys.all });
  };

  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />;
  }

  return (
    <div className="overflow-x-auto pb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 min-w-max">
          {stages.map((stage) => {
            const totalTasks = stage.tasks.length;
            const completedTasks = stage.tasks.filter(t => t.status === 'COMPLETED').length;
            const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            return (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'w-[320px] rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm p-4 space-y-3',
                      snapshot.isDraggingOver && 'border-primary/50 bg-primary/5',
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold">{stage.name}</h3>
                        <StatusBadge status={stage.status} />
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {stage.departmentCode} • {totalTasks} Tasks
                      </p>
                      {/* Progress bar */}
                      {totalTasks > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{completedTasks}/{totalTasks} complete</span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                progressPct === 100 ? 'bg-green-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-primary',
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 min-h-[120px]">
                      {stage.tasks.map((task, index) => {
                        const isOverdue =
                          !!task.dueAt &&
                          new Date(task.dueAt) < new Date() &&
                          task.status !== 'COMPLETED';

                        return (
                          <Draggable draggableId={task.id} index={index} key={task.id}>
                            {(dragProvided, dragSnapshot) => (
                              <button
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                type="button"
                                className={cn(
                                  'w-full text-left p-3 rounded-xl border bg-white/[0.03] hover:bg-white/[0.06] transition-all',
                                  dragSnapshot.isDragging && 'border-primary/60 shadow-xl',
                                  isOverdue
                                    ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
                                    : 'border-white/10',
                                  task.isBlocked && 'border-red-600/50',
                                )}
                                onClick={() => onTaskClick(task.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium leading-tight flex-1">{task.name}</p>
                                  {task.isBlocked && (
                                    <Lock className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                                  )}
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                                  <span>{task.status}</span>
                                  <span className={PRIORITY_COLORS[task.priority] ?? 'text-muted-foreground'}>
                                    {task.priority}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span>{task.assigneeId ? (memberMap[task.assigneeId] ?? 'Unknown') : 'Unassigned'}</span>
                                  <span className={isOverdue ? 'text-red-400 font-bold' : ''}>
                                    {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No due'}
                                  </span>
                                </div>
                              </button>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>

                    <QuickAddTaskForm
                      stageId={stage.id}
                      projectId={projectId}
                      taskCount={totalTasks}
                      onAdded={invalidateBoard}
                    />
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
