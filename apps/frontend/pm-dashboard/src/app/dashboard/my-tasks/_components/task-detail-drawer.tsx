'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  History,
  Archive,
  Trash2,
  X,
  GitBranch,
} from 'lucide-react';
import { pmKeys } from '@/hooks/use-pm-data';
import { toast } from '@/hooks/use-toast';
import { useMembers } from '@/hooks/use-organization';
import { ThreadPane } from '@/components/shared/threads/thread-pane';
import { FileList, FileUploader } from '@/components/shared/files';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

const DEPT_COLORS: Record<string, string> = {
  DESIGN: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  EDITING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MARKETING: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  DEVELOPMENT: 'bg-green-500/20 text-green-400 border-green-500/30',
  QC: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  OPERATIONS: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
};

export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const { data: taskRes, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.fetch<any>(`/tasks/${taskId}`, { service: 'pm' }),
    enabled: !!taskId,
  });

  const { data: worklogsRes } = useQuery({
    queryKey: ['task', taskId, 'worklogs'],
    queryFn: () => api.fetch<any>(`/tasks/${taskId}/worklogs?page=1&limit=25`, { service: 'pm' }),
    enabled: !!taskId,
  });

  const { data: revisionsRes } = useQuery({
    queryKey: ['task', taskId, 'revisions'],
    queryFn: () => api.getTaskRevisions(taskId!),
    enabled: !!taskId,
  });

  const task = taskRes?.data;
  const worklogs = worklogsRes?.data ?? [];
  const revisions = revisionsRes?.data ?? [];
  const queryClient = useQueryClient();
  const { data: members } = useMembers();

  const [worklogNote, setWorklogNote] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [showDueDateEdit, setShowDueDateEdit] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['task', taskId, 'worklogs'] });
    queryClient.invalidateQueries({ queryKey: pmKeys.myTasks });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
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
      service: 'pm',
    }),
    onSuccess: () => { invalidate(); toast.success('Task assigned'); },
    onError: (e: Error) => toast.error('Failed to assign task', e.message),
  });

  const blockTaskMutation = useMutation({
    mutationFn: (reason: string) => api.fetch(`/tasks/${taskId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      service: 'pm',
    }),
    onSuccess: () => {
      invalidate();
      setBlockReason('');
      setShowBlockForm(false);
      toast.success('Task blocked');
    },
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
      body: JSON.stringify({ startedAt: new Date().toISOString(), notes }),
      service: 'pm',
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
      service: 'pm',
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

  const archiveTaskMutation = useMutation({
    mutationFn: () => api.archiveTask(taskId!),
    onSuccess: () => { invalidate(); toast.success('Task archived'); },
    onError: (e: Error) => toast.error('Failed to archive task', e.message),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => api.deleteTask(taskId!),
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success('Task deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete task', e.message),
  });

  const updatePriorityMutation = useMutation({
    mutationFn: (priority: string) => api.updateTask(taskId!, { priority }),
    onSuccess: () => { invalidate(); toast.success('Priority updated'); },
    onError: (e: Error) => toast.error('Failed to update priority', e.message),
  });

  const updateDueDateMutation = useMutation({
    mutationFn: (dueAt: string) => api.updateTask(taskId!, { dueAt }),
    onSuccess: () => {
      invalidate();
      setShowDueDateEdit(false);
      toast.success('Due date updated');
    },
    onError: (e: Error) => toast.error('Failed to update due date', e.message),
  });

  const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.id, m.name]));
  const deptColor = task?.departmentCode ? DEPT_COLORS[task.departmentCode] : undefined;

  if (!taskId) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-all duration-300 ${taskId ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Side panel */}
      <div className="relative z-10 w-full sm:max-w-2xl h-full bg-black/80 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-8 w-1/2 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
          </div>
        ) : task ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-white/5 space-y-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {task.departmentCode && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${deptColor || 'bg-white/10 text-muted-foreground border-white/10'}`}>
                        {task.departmentCode}
                      </span>
                    )}
                    <StatusBadge status={task.status} />
                  </div>
                  <h2 className="text-xl font-bold leading-snug">{task.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {task.project?.name} &bull; {task.projectStage?.name}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-8 w-8 hover:bg-white/10">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Revision Required Banner */}
              {task.status === 'REVISION_REQUIRED' && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
                  <GitBranch className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-orange-400">Revision Required</p>
                    <p className="text-xs text-orange-400/80 mt-0.5">This task was returned for revision. Review the feedback below and resubmit.</p>
                  </div>
                </div>
              )}

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
                {/* Inline due date */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Due:{' '}
                  {showDueDateEdit ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        className="bg-white/5 border border-white/20 rounded px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary/50"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" className="h-6 px-2 text-[10px] bg-primary hover:bg-primary/90" onClick={() => updateDueDateMutation.mutate(editDueDate)} disabled={!editDueDate || updateDueDateMutation.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setShowDueDateEdit(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditDueDate(task.dueAt ? new Date(task.dueAt).toISOString().split('T')[0] : '');
                        setShowDueDateEdit(true);
                      }}
                      className="font-medium text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                    >
                      {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'Set date'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <UserIcon className="h-3.5 w-3.5" />
                  Assignee: <span className="font-medium text-foreground">{task.assigneeId ? (memberMap[task.assigneeId] ?? 'Unknown') : 'Unassigned'}</span>
                </div>

                {/* Inline priority */}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  Priority:{' '}
                  <Select value={task.priority} onValueChange={(v) => updatePriorityMutation.mutate(v)}>
                    <SelectTrigger className="h-5 px-1.5 bg-transparent border-white/20 text-xs font-medium text-foreground w-auto min-w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
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
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => startTaskMutation.mutate()} disabled={startTaskMutation.isPending}>
                        <Play className="h-4 w-4 mr-2" /> Start Work
                      </Button>
                    )}
                    {(task.status === 'IN_PROGRESS' || task.status === 'REVISION_REQUIRED') && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowSubmitForm(true)} disabled={submitTaskMutation.isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {task.status === 'REVISION_REQUIRED' ? 'Resubmit' : 'Submit for Review'}
                      </Button>
                    )}
                    {!task.isBlocked && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={() => setShowBlockForm(true)}>
                        <Lock className="h-4 w-4 mr-2" /> Block
                      </Button>
                    )}
                    {task.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10" onClick={() => archiveTaskMutation.mutate()} disabled={archiveTaskMutation.isPending}>
                        <Archive className="h-4 w-4 mr-2" /> Archive
                      </Button>
                    )}
                    {(task.status === 'PENDING' || task.status === 'READY') && (
                      <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={() => deleteTaskMutation.mutate()} disabled={deleteTaskMutation.isPending}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    )}
                  </div>

                  {/* Block reason form */}
                  {showBlockForm && (
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Block Reason</h4>
                      <textarea
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/50 resize-none"
                        rows={3}
                        placeholder="Describe why this task is blocked..."
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setShowBlockForm(false); setBlockReason(''); }}>Cancel</Button>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => blockTaskMutation.mutate(blockReason)} disabled={!blockReason.trim() || blockTaskMutation.isPending}>Confirm Block</Button>
                      </div>
                    </div>
                  )}

                  {/* Submission form */}
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
                        <Button size="sm" variant="ghost" onClick={() => { setShowSubmitForm(false); setSubmissionNotes(''); }} disabled={submitTaskMutation.isPending}>Cancel</Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => submitTaskMutation.mutate(submissionNotes)} disabled={submitTaskMutation.isPending}>
                          {submitTaskMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Assignee</h3>
                <Select value={task.assigneeId || 'none'} onValueChange={(v) => v !== 'none' && assignTaskMutation.mutate(v)}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members?.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Revision History */}
              {revisions.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Revision History</h3>
                  <div className="space-y-2">
                    {revisions.map((rev: any, i: number) => (
                      <div key={rev.id ?? i} className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-1">
                          <span className="font-semibold text-orange-400">Revision #{i + 1}</span>
                          <span>{rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ''}</span>
                        </div>
                        {rev.feedback && <p className="text-sm text-foreground/80 whitespace-pre-wrap">{rev.feedback}</p>}
                        {rev.reviewerNote && <p className="text-xs text-muted-foreground mt-1">Reviewer: {rev.reviewerNote}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    onKeyDown={(e) => e.key === 'Enter' && worklogNote.trim() && addWorklogMutation.mutate(worklogNote)}
                  />
                  <Button size="sm" variant="secondary" onClick={() => addWorklogMutation.mutate(worklogNote)} disabled={!worklogNote || addWorklogMutation.isPending}>
                    Log
                  </Button>
                </div>
              </div>

              {/* Discussion */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Discussion</h3>
                <ThreadPane projectId={task.projectId} scopeType="TASK" scopeId={task.id} className="!h-[360px]" />
              </div>

              {/* Files */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Files</h3>
                <FileUploader projectId={task.projectId} scopeType="TASK" scopeId={task.id} />
                <FileList scopeType="TASK" scopeId={task.id} />
              </div>

              {/* Activity History */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Activity History</h3>
                {worklogs.length > 0 ? (
                  <div className="space-y-2">
                    {worklogs.map((row: any) => (
                      <div key={row.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <span>{memberMap[row.userId] ?? row.userId}</span>
                          <span>{new Date(row.startedAt).toLocaleString()}</span>
                        </div>
                        {row.notes && <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{row.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No activity logged yet.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">
            {isLoading ? 'Loading...' : 'Task not found.'}
          </div>
        )}
      </div>
    </div>
  );
}
