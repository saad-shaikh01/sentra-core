'use client';

import { useProject, useProjectStages } from '@/hooks/use-projects';
import { PageHeader, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Settings, 
  History,
  Activity,
  User,
  Clock,
  MessageSquare,
  FileIcon
} from 'lucide-react';
import Link from 'next/link';
import { StageCard } from './_components/stage-card';
import { ThreadPane } from '@/components/shared/threads/thread-pane';
import { FileList, FileUploader } from '@/components/shared/files';
import { useState } from 'react';

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { data: projectRes, isLoading, isError } = useProject(id);
  const { data: stagesData, isLoading: stagesLoading } = useProjectStages(id);

  const project = projectRes?.data;
  const [activeTab, setActiveTab] = useState<'threads' | 'files'>('threads');

  if (isLoading) return <div>Loading...</div>;
  if (isError || !project) return <div>Error loading project.</div>;

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
              <User className="h-4 w-4 text-blue-400/60" />
              <span>Health: </span>
              <StatusBadge status={project.healthStatus} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-white/5 border-white/10 opacity-50 cursor-not-allowed" disabled>
            <History className="h-4 w-4 mr-2" /> Timeline
          </Button>
          <Button variant="outline" size="sm" className="bg-white/5 border-white/10 opacity-50 cursor-not-allowed" disabled>
            <Settings className="h-4 w-4 mr-2" /> Project Settings
          </Button>
          <Button size="sm" className="shadow-lg shadow-primary/20 opacity-50 cursor-not-allowed" disabled>
            Publish Work
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
          </div>

          <div className="space-y-4">
            {stagesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 w-full rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              stagesData?.data?.map((stage: any) => (
                <StageCard key={stage.id} stage={stage} projectId={id} />
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-px">
            <button
              onClick={() => setActiveTab('threads')}
              className={`pb-3 px-4 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'threads' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Discussion
              </div>
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`pb-3 px-4 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'files' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileIcon className="h-4 w-4" /> Files & Assets
              </div>
            </button>
          </div>

          <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            {activeTab === 'threads' ? (
              <ThreadPane projectId={id} scopeType="PROJECT" scopeId={id} className="border-none rounded-none" />
            ) : (
              <div className="p-6 space-y-6">
                <FileUploader projectId={id} scopeType="PROJECT" scopeId={id} />
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Project Files</h3>
                  <FileList scopeType="PROJECT" scopeId={id} />
                </div>
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
    </div>
  );
}
