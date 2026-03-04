'use client';

import { useState } from 'react';
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
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  Play,
  Lock,
  UserPlus,
  History
} from 'lucide-react';
import { pmKeys } from '@/hooks/use-pm-data';
import { toast } from '@/hooks/use-toast';
import { useMembers } from '@/hooks/use-organization';

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
  const { data: members } = useMembers();
  const [worklogNote, setWorklogNote] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
  };

  const claimTaskMutation = useMutation({
    mutationFn: () => api.fetch(`/tasks/${taskId}/claim`, { method: 'POST', service: 'pm' }),
    onSuccess: () => { invalidate(); toast.success('Task claimed'); },
    onError: (e: Error) => toast.error('Failed to claim task', e.message),
  });

  const assignTaskMutation = useMutation({
    mutationFn: (assigneeId: string) => api.fetch(`/tasks/${taskId}/assign`, { 
      method: 'POST', 
      body: JSON.stringify({ assigneeId }),
      service: 'pm' 
    }),
    onSuccess: () => { invalidate(); toast.success('Task assigned'); },
    onError: (e: Error) => toast.error('Failed to assign task', e.message),
  });

  const blockTaskMutation = useMutation({
    mutationFn: (reason: string) => api.fetch(`/tasks/${taskId}/block`, { 
      method: 'POST', 
      body: JSON.stringify({ reason }),
      service: 'pm' 
    }),
    onSuccess: () => { invalidate(); toast.success('Task blocked'); },
    onError: (e: Error) => toast.error('Failed to block task', e.message),
  });

  const unblockTaskMutation = useMutation({
    mutationFn: () => api.fetch(`/tasks/${taskId}/unblock`, { method: 'POST', service: 'pm' }),
    onSuccess: () => { invalidate(); toast.success('Task unblocked'); },
    onError: (e: Error) => toast.error('Failed to unblock task', e.message),
  });

  const addWorklogMutation = useMutation({
    mutationFn: (notes: string) => api.fetch(`/tasks/${taskId}/worklogs`, { 
      method: 'POST', 
      body: JSON.stringify({ 
        startedAt: new Date().toISOString(),
        notes 
      }),
      service: 'pm' 
    }),
    onSuccess: () => { 
      invalidate(); 
      setWorklogNote('');
      toast.success('Activity logged'); 
    },
    onError: (e: Error) => toast.error('Failed to log activity', e.message),
  });

  const startTaskMutation = useMutation({
    mutationFn: () => api.fetch(`/tasks/${taskId}`, { 
      method: 'PATCH', 
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
      service: 'pm' 
    }),
    onSuccess: () => { invalidate(); toast.success('Task started'); },
    onError: (e: Error) => toast.error('Failed to start task', e.message),
  });

  const submitTaskMutation = useMutation({
    mutationFn: (notes: string) => api.createTaskSubmission(taskId!, {
      notes: notes.trim() || undefined,
      selfQcResponses: [],
    }),
    onSuccess: () => {
      invalidate();
      setSubmissionNotes('');
      setShowSubmitForm(false);
      toast.success('Task submitted for review');
    },
    onError: (e: Error) => toast.error('Failed to submit task', e.message),
  });

  const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.id, m.name]));

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
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-400">This task is blocked</p>
                    <p className="text-xs text-red-400/80">{task.blockReason || 'Needs unblocking to proceed.'}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={() => unblockTaskMutation.mutate()}>
                    Unblock
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Due: <span className="font-medium text-foreground">{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'None'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <UserIcon className="h-3.5 w-3.5" />
                  Assignee: <span className="font-medium text-foreground">{task.assigneeId ? (memberMap[task.assigneeId] ?? 'Unknown') : 'Unassigned'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
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

              {/* Quick Actions */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Actions</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3">
                    {!task.assigneeId && (
                      <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => claimTaskMutation.mutate()} disabled={claimTaskMutation.isPending}>
                        <UserPlus className="h-4 w-4 mr-2" /> Claim Task
                      </Button>
                    )}
                    {task.status === 'READY' && task.assigneeId && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => startTaskMutation.mutate()}
                        disabled={startTaskMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-2" /> Start Work
                      </Button>
                    )}
                    {(task.status === 'IN_PROGRESS' || task.status === 'REVISION_REQUIRED') && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setShowSubmitForm(true)}
                        disabled={submitTaskMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {task.status === 'REVISION_REQUIRED' ? 'Resubmit' : 'Submit for Review'}
                      </Button>
                    )}
                    {!task.isBlocked && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={() => blockTaskMutation.mutate('Manual block')}>
                        <Lock className="h-4 w-4 mr-2" /> Block
                      </Button>
                    )}
                  </div>

                  {/* QC / Submission form */}
                  {showSubmitForm && (
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Submission Notes
                        {task.requiresQc && <span className="ml-2 text-amber-400">(QC Review Required)</span>}
                      </h4>
                      <textarea
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
                        rows={3}
                        placeholder="Describe the work completed, any context for the reviewer..."
                        value={submissionNotes}
                        onChange={(e) => setSubmissionNotes(e.target.value)}
                        disabled={submitTaskMutation.isPending}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setShowSubmitForm(false); setSubmissionNotes(''); }}
                          disabled={submitTaskMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => submitTaskMutation.mutate(submissionNotes)}
                          disabled={submitTaskMutation.isPending}
                        >
                          {submitTaskMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment (Lead Only style) */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Assignee</h3>
                <Select value={task.assigneeId || 'none'} onValueChange={(v) => v !== 'none' && assignTaskMutation.mutate(v)}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members?.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Log Activity */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Log Activity</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Quick activity log..." 
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 text-sm outline-none focus:border-primary/50"
                    value={worklogNote}
                    onChange={(e) => setWorklogNote(e.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={() => addWorklogMutation.mutate(worklogNote)} disabled={!worklogNote || addWorklogMutation.isPending}>
                    Log
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
