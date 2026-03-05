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
  _count?: { tasks: number };
  tasks: BoardTask[];
};

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

  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />;
  }

  return (
    <div className="overflow-x-auto pb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 min-w-max">
          {stages.map((stage) => (
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
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">{stage.name}</h3>
                      <StatusBadge status={stage.status} />
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {stage.departmentCode} • {stage.tasks.length} Tasks
                    </p>
                  </div>

                  <div className="space-y-2 min-h-[120px]">
                    {stage.tasks.map((task, index) => (
                      <Draggable draggableId={task.id} index={index} key={task.id}>
                        {(dragProvided, dragSnapshot) => (
                          <button
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            type="button"
                            className={cn(
                              'w-full text-left p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all',
                              dragSnapshot.isDragging && 'border-primary/60 shadow-xl',
                            )}
                            onClick={() => onTaskClick(task.id)}
                          >
                            <p className="text-sm font-medium leading-tight">{task.name}</p>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                              <span>{task.status}</span>
                              <span>{task.priority}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{task.assigneeId ? (memberMap[task.assigneeId] ?? 'Unknown') : 'Unassigned'}</span>
                              <span>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No due'}</span>
                            </div>
                          </button>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
