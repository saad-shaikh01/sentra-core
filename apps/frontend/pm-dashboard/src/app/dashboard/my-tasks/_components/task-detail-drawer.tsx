'use client';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Clock, CheckCircle2, MessageSquare, AlertTriangle, User } from 'lucide-react';
import { pmKeys } from '@/hooks/use-pm-data';
import { toast } from '@/hooks/use-toast';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const { data: taskRes, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.fetch<any>(`/tasks/${taskId}`, { service: 'pm' }),
    enabled: !!taskId,
  });

  const task = taskRes?.data;
  const queryClient = useQueryClient();

  const startTaskMutation = useMutation({
    mutationFn: () => api.fetch(`/tasks/${taskId}`, { 
      method: 'PATCH', 
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
      service: 'pm' 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
      toast.success('Task started');
    },
    onError: (e: Error) => toast.error('Failed to start task', e.message),
  });

  const submitTaskMutation = useMutation({
    mutationFn: () => api.fetch(`/tasks/${taskId}/submissions`, { 
      method: 'POST', 
      body: JSON.stringify({ notes: 'Submitted from dashboard' }),
      service: 'pm' 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
      toast.success('Task submitted for review');
    },
    onError: (e: Error) => toast.error('Failed to submit task', e.message),
  });

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full sm:max-w-xl p-0 border-l border-white/10 bg-black/40 backdrop-blur-2xl">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-8 w-1/2 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
          </div>
        ) : task ? (
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-white/5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{task.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {task.project?.name} &bull; {task.projectStage?.name}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>

              {task.isBlocked && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-400">This task is blocked</p>
                    <p className="text-xs text-red-400/80">Needs unblocking by lead to proceed.</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Due: <span className="font-medium text-foreground">{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'None'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Priority: <span className="font-medium text-foreground">{task.priority}</span>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Description */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Description</h3>
                <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap bg-white/5 p-4 rounded-xl border border-white/5">
                  {task.description || 'No description provided.'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Actions</h3>
                <div className="flex flex-wrap gap-3">
                  {task.status === 'READY' && (
                    <Button 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => startTaskMutation.mutate()}
                      disabled={startTaskMutation.isPending}
                    >
                      {startTaskMutation.isPending ? 'Starting...' : 'Start Work'}
                    </Button>
                  )}
                  {task.status === 'IN_PROGRESS' && (
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => submitTaskMutation.mutate()}
                      disabled={submitTaskMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {submitTaskMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10">
                    <MessageSquare className="h-4 w-4 mr-2" /> Discuss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-muted-foreground">Task not found.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
