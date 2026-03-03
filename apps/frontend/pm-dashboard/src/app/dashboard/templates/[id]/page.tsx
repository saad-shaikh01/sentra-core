'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  Plus, 
  Settings, 
  GripVertical, 
  Trash2, 
  CheckSquare, 
  ListChecks 
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function TemplateDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: templateRes, isLoading, isError } = useQuery({
    queryKey: ['template', id],
    queryFn: () => api.fetch<any>(`/templates/${id}`, { service: 'pm' }),
    enabled: !!id,
  });

  const template = templateRes?.data;

  const { data: stagesRes, isLoading: stagesLoading } = useQuery({
    queryKey: ['template-stages', id],
    queryFn: () => api.fetch<any>(`/templates/${id}/stages`, { service: 'pm' }),
    enabled: !!id,
  });

  const stages = stagesRes?.data ?? [];

  const createStageMutation = useMutation({
    mutationFn: (dto: any) => api.fetch(`/templates/${id}/stages`, { method: 'POST', body: JSON.stringify(dto), service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-stages', id] });
      toast.success('Stage added');
    },
  });

  if (isLoading) return <div className="p-8 text-center">Loading template...</div>;
  if (isError || !template) return <div className="p-8 text-center text-red-400">Error loading template.</div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Link href="/dashboard/templates" className="flex items-center hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Templates
        </Link>
        <span className="text-white/10">/</span>
        <span className="truncate">{template.name}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{template.name}</h1>
            <StatusBadge status={template.isActive ? 'ACTIVE' : 'ARCHIVED'} />
          </div>
          <p className="text-muted-foreground">{template.description || 'No description provided.'}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-white/5 border-white/10">
            <Settings className="h-4 w-4 mr-2" /> Template Settings
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Workflow Structure</h2>
          <Button size="sm" onClick={() => createStageMutation.mutate({ name: 'New Stage', departmentCode: 'OPERATIONS', sortOrder: stages.length })}>
            <Plus className="h-4 w-4 mr-2" /> Add Stage
          </Button>
        </div>

        <div className="space-y-4">
          {stagesLoading ? (
            <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
          ) : stages.length > 0 ? (
            stages.map((stage: any) => (
              <TemplateStageCard key={stage.id} stage={stage} templateId={id} />
            ))
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
              <p className="text-muted-foreground">This template has no stages yet.</p>
              <Button variant="link" onClick={() => createStageMutation.mutate({ name: 'First Stage', departmentCode: 'OPERATIONS', sortOrder: 0 })}>
                Create the first stage
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateStageCard({ stage, templateId }: { stage: any, templateId: string }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const { data: tasksRes, isLoading: tasksLoading } = useQuery({
    queryKey: ['template-tasks', stage.id],
    queryFn: () => api.fetch<any>(`/templates/stages/${stage.id}/tasks`, { service: 'pm' }),
    enabled: isExpanded,
  });

  const tasks = tasksRes?.data ?? [];

  const { data: checklistsRes } = useQuery({
    queryKey: ['template-checklists', stage.id],
    queryFn: () => api.fetch<any>(`/templates/checklists?templateStageId=${stage.id}`, { service: 'pm' }),
    enabled: isExpanded && showChecklist,
  });

  const checklists = checklistsRes?.data ?? [];

  const createTaskMutation = useMutation({
    mutationFn: (dto: any) => api.fetch(`/templates/stages/${stage.id}/tasks`, { method: 'POST', body: JSON.stringify(dto), service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-tasks', stage.id] });
      toast.success('Task added');
    },
  });

  const createChecklistMutation = useMutation({
    mutationFn: (label: string) => api.fetch('/templates/checklists', { 
      method: 'POST', 
      body: JSON.stringify({ templateStageId: stage.id, label, isRequired: true, sortOrder: checklists.length }), 
      service: 'pm' 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-checklists', stage.id] });
      toast.success('Checklist item added');
    },
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (id: string) => api.fetch(`/templates/checklists/${id}`, { method: 'DELETE', service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-checklists', stage.id] });
      toast.success('Item removed');
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: () => api.fetch(`/templates/stages/${stage.id}`, { method: 'DELETE', service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-stages', templateId] });
      toast.success('Stage deleted');
    },
  });

  return (
    <div className="bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setIsExpanded(!isExpanded)}>
          <GripVertical className="h-5 w-5 text-muted-foreground/30 cursor-grab" />
          <div>
            <h3 className="font-bold">{stage.name}</h3>
            <span className="text-[10px] text-muted-foreground uppercase">{stage.departmentCode}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className={cn("text-xs gap-2", showChecklist && "bg-white/5")} onClick={() => { setIsExpanded(true); setShowChecklist(!showChecklist); }}>
            <ListChecks className="h-3.5 w-3.5" /> Checklist
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-500/10" onClick={() => deleteStageMutation.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-white/[0.02] space-y-6">
          {showChecklist ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                  <CheckSquare className="h-3 w-3" /> QC Checklist Definition
                </h4>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => createChecklistMutation.mutate('New check item')}>
                  <Plus className="h-3 w-3 mr-1" /> Add Requirement
                </Button>
              </div>
              <div className="space-y-2">
                {checklists.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="text-sm">{item.label}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400" onClick={() => deleteChecklistMutation.mutate(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {checklists.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-2">No checklist items defined.</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Starter Tasks</h4>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => createTaskMutation.mutate({ name: 'New Task', priority: 'MEDIUM', sortOrder: tasks.length })}>
                  <Plus className="h-3 w-3 mr-1" /> Add Task
                </Button>
              </div>

              <div className="space-y-2">
                {tasksLoading ? (
                  <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
                ) : tasks.length > 0 ? (
                  tasks.map((task: any) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 group">
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground/20 cursor-grab" />
                        <span className="text-sm">{task.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4 italic">No starter tasks for this stage.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
