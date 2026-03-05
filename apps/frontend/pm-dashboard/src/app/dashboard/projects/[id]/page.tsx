'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Activity,
  User as UserIcon,
  Clock,
  MessageSquare,
  FileIcon,
  ShieldCheck,
  Send,
  Archive,
  Columns3,
  List,
  History,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared';
import { ThreadPane } from '@/components/shared/threads/thread-pane';
import { FileList, FileUploader } from '@/components/shared/files';
import { useMembers } from '@/hooks/use-organization';
import { useArchiveProject, useProject, useProjectActivity, useProjectStages } from '@/hooks/use-projects';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { StageCard } from './_components/stage-card';
import { ProjectKanbanBoard } from './_components/project-kanban-board';
import { TaskDetailDrawer } from '../../my-tasks/_components/task-detail-drawer';

type SideTab = 'threads' | 'files' | 'approvals' | 'activity';
type WorkflowView = 'list' | 'kanban';

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data: projectRes, isLoading, isError } = useProject(id);
  const { data: stagesData, isLoading: stagesLoading } = useProjectStages(id);
  const { data: members } = useMembers();

  const project = projectRes?.data;
  const [activeTab, setActiveTab] = useState<SideTab>('threads');
  const [workflowView, setWorkflowView] = useState<WorkflowView>('list');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [approvalTargetType, setApprovalTargetType] = useState<'CLIENT' | 'INTERNAL_APPROVER'>('CLIENT');
  const [approvalTargetEmail, setApprovalTargetEmail] = useState('');
  const [approvalTargetUserId, setApprovalTargetUserId] = useState('');

  const { data: approvalsRes } = useQuery({
    queryKey: ['project-approvals', id],
    queryFn: () => api.getApprovalRequests(id),
    enabled: !!id && activeTab === 'approvals',
  });

  const { data: activityRes } = useProjectActivity(
    id,
    { page: 1, limit: 50 },
    activeTab === 'activity',
  );

  const approvals = approvalsRes?.data ?? [];
  const activityRows = activityRes?.data ?? [];

  const archiveProject = useArchiveProject();

  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      const deliverable = await api.createDeliverable(id, {
        name: `${project?.name ?? 'Project'} Deliverable`,
        description: 'Generated from project workspace',
        deliveryType: 'CLIENT',
      });

      const dto: Record<string, unknown> = {
        deliverablePackageId: deliverable.data.id,
        approvalTargetType,
      };

      if (approvalTargetType === 'CLIENT') {
        if (approvalTargetEmail.trim()) dto.approvalTargetEmail = approvalTargetEmail.trim();
        if (approvalTargetUserId) dto.approvalTargetUserId = approvalTargetUserId;
      } else {
        dto.approvalTargetUserId = approvalTargetUserId;
      }

      return api.createApprovalRequest(id, dto);
    },
    onSuccess: () => {
      setApprovalTargetEmail('');
      setApprovalTargetUserId('');
      queryClient.invalidateQueries({ queryKey: ['project-approvals', id] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', id] });
      toast.success('Approval request created');
    },
    onError: (e: Error) => toast.error('Creation failed', e.message),
  });

  const createStageMutation = useMutation({
    mutationFn: (dto: { name: string; departmentCode: string }) => api.createStage(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'stages', id] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'board', id] });
      toast.success('Stage created');
    },
    onError: (e: Error) => toast.error('Failed to create stage', e.message),
  });

  if (isLoading) return <div className="p-10 text-center">Loading project detail...</div>;
  if (isError || !project) return <div className="p-10 text-center text-red-400">Error loading project.</div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Link href="/dashboard/projects" className="flex items-center hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Projects
        </Link>
        <span className="text-white/10">/</span>
        <span className="truncate">{project.name}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-primary/60" />
              <span className="font-medium text-foreground/80">{project.serviceType}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-orange-400/60" />
              <span>Due: {project.deliveryDueAt ? new Date(project.deliveryDueAt).toLocaleDateString() : '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-4 w-4 text-blue-400/60" />
              <span>Health: </span>
              <StatusBadge status={project.healthStatus} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="bg-white/5 border-white/10"
            onClick={() => setActiveTab('activity')}
          >
            <History className="h-4 w-4 mr-2" /> Timeline
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={() => archiveProject.mutate(id)}
            disabled={archiveProject.isPending}
          >
            <Archive className="h-4 w-4 mr-2" /> Archive Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              Production Workflow
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-muted-foreground">
                {stagesData?.data?.length ?? 0} STAGES
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const name = window.prompt('Stage name');
                  if (!name?.trim()) return;
                  createStageMutation.mutate({
                    name: name.trim(),
                    departmentCode: 'OPERATIONS',
                  });
                }}
                disabled={createStageMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Stage
              </Button>
              <Button
                size="sm"
                variant={workflowView === 'list' ? 'default' : 'outline'}
                onClick={() => setWorkflowView('list')}
              >
                <List className="h-4 w-4 mr-2" /> List
              </Button>
              <Button
                size="sm"
                variant={workflowView === 'kanban' ? 'default' : 'outline'}
                onClick={() => setWorkflowView('kanban')}
              >
                <Columns3 className="h-4 w-4 mr-2" /> Kanban
              </Button>
            </div>
          </div>

          {workflowView === 'list' ? (
            <div className="space-y-4">
              {stagesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 w-full rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : (
                stagesData?.data?.map((stage: any) => (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    projectId={id}
                    onTaskClick={(taskId) => setDetailTaskId(taskId)}
                  />
                ))
              )}
            </div>
          ) : (
            <ProjectKanbanBoard
              projectId={id}
              onTaskClick={(taskId) => setDetailTaskId(taskId)}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-px">
            {(['threads', 'files', 'approvals', 'activity'] as SideTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-3 text-sm font-medium transition-all border-b-2 capitalize ${
                  activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tab === 'threads' && <MessageSquare className="h-4 w-4" />}
                  {tab === 'files' && <FileIcon className="h-4 w-4" />}
                  {tab === 'approvals' && <ShieldCheck className="h-4 w-4" />}
                  {tab === 'activity' && <History className="h-4 w-4" />}
                  {tab}
                </div>
              </button>
            ))}
          </div>

          <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-xl min-h-[400px]">
            {activeTab === 'threads' && (
              <ThreadPane projectId={id} scopeType="PROJECT" scopeId={id} className="border-none rounded-none" />
            )}

            {activeTab === 'files' && (
              <div className="p-6 space-y-6">
                <FileUploader projectId={id} scopeType="PROJECT" scopeId={id} />
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Project Files</h3>
                  <FileList scopeType="PROJECT" scopeId={id} />
                </div>
              </div>
            )}

            {activeTab === 'approvals' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Client Approval Log</h3>
                </div>

                <div className="space-y-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="grid grid-cols-1 gap-3">
                    <Select value={approvalTargetType} onValueChange={(v) => setApprovalTargetType(v as 'CLIENT' | 'INTERNAL_APPROVER')}>
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLIENT">Client</SelectItem>
                        <SelectItem value="INTERNAL_APPROVER">Internal Approver</SelectItem>
                      </SelectContent>
                    </Select>

                    {approvalTargetType === 'CLIENT' && (
                      <Input
                        value={approvalTargetEmail}
                        onChange={(e) => setApprovalTargetEmail(e.target.value)}
                        placeholder="Client email (optional if selecting user)"
                        className="bg-white/5 border-white/10"
                      />
                    )}

                    <Select
                      value={approvalTargetUserId || 'none'}
                      onValueChange={(v) => setApprovalTargetUserId(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue placeholder={approvalTargetType === 'INTERNAL_APPROVER' ? 'Select approver user' : 'Optional user target'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    className="w-full shadow-lg shadow-primary/20"
                    onClick={() => requestApprovalMutation.mutate()}
                    disabled={requestApprovalMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {requestApprovalMutation.isPending ? 'Creating...' : 'Create Deliverable + Request Approval'}
                  </Button>
                </div>

                {approvals.length > 0 ? (
                  <div className="space-y-3">
                    {approvals.map((app: any) => (
                      <div key={app.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold capitalize">{app.approvalTargetType.replace('_', ' ')}</span>
                          <StatusBadge status={app.status} />
                        </div>
                        <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                          {app.approvalTargetEmail && <span>Target: {app.approvalTargetEmail}</span>}
                          {app.approvalTargetUserId && <span>User: {app.approvalTargetUserId}</span>}
                          <span>Sent: {new Date(app.sentAt).toLocaleDateString()}</span>
                          {app.dueAt && <span>Due: {new Date(app.dueAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <ShieldCheck className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No external approvals requested yet.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="p-6 space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Project Activity Feed</h3>
                {activityRows.length > 0 ? (
                  <div className="space-y-2">
                    {activityRows.map((row: any) => (
                      <div key={row.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold">{row.eventType}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          scope: {row.scopeType} / {row.scopeId}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    No activity logged for this project yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {project.description && (
            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-3 text-sm mt-6">
              <h3 className="font-bold text-sm text-foreground/80">Description</h3>
              <p className="text-muted-foreground leading-relaxed">{project.description}</p>
            </div>
          )}
        </div>
      </div>

      <TaskDetailDrawer taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </div>
  );
}
