'use client';

import { useAuth } from '@/hooks/use-auth';
import { usePmRole, useDashboardStats } from '@/hooks/use-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, CheckSquare, ClipboardCheck, ListTodo, AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';

function StatCard({ title, value, icon: Icon, iconColor, description }: {
  title: string; value: number | string; icon: any; iconColor: string; description: string;
}) {
  return (
    <Card className="bg-white/[0.02] border-white/10 shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-[10px] text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function PendingSalesWidget({ sales }: { sales: any[] }) {
  if (sales.length === 0) return null;
  return (
    <Card className="bg-amber-500/5 border-amber-500/20 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            Pending Sales ({sales.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sales.slice(0, 3).map((s: any) => (
          <div key={s.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
            <div className="text-sm text-foreground/80 truncate">
              {s.payload?.description || `Sale ${s.scopeId?.slice(0, 8)}`}
            </div>
            <Link href="/dashboard/engagements">
              <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                <Plus className="h-3 w-3 mr-1" /> Create Engagement
              </Button>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const pmRole = usePmRole();
  const { activeProjects, myTasksCount, qcQueueCount, stageCount, pendingSales, isLoading } = useDashboardStats();

  if (!pmRole) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Dept Lead: redirect to stage queue concept
  if (pmRole === 'pm-dept-lead') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Department Queue</h1>
          <p className="text-muted-foreground">Your department's active stages.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Stage Queue" value={stageCount} icon={ListTodo} iconColor="text-purple-400" description="Stages in your dept" />
          <StatCard title="My Tasks" value={myTasksCount} icon={CheckSquare} iconColor="text-blue-400" description="Pending your execution" />
          <StatCard title="QC Queue" value={qcQueueCount} icon={ClipboardCheck} iconColor="text-amber-400" description="Waiting for review" />
        </div>
        <Link href="/dashboard/stage-queue">
          <Button className="w-full sm:w-auto">Go to Stage Queue</Button>
        </Link>
      </div>
    );
  }

  // Team Member: tasks-focused
  if (pmRole === 'pm-team-member') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name}.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard title="My Tasks" value={myTasksCount} icon={CheckSquare} iconColor="text-blue-400" description="Pending your execution" />
          <StatCard title="Stage Queue" value={stageCount} icon={ListTodo} iconColor="text-purple-400" description="Active milestones" />
        </div>
        <Link href="/dashboard/my-tasks">
          <Button>Go to My Tasks</Button>
        </Link>
      </div>
    );
  }

  // Admin / PM Manager: full overview
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">PM Dashboard</h1>
        <p className="text-muted-foreground">Production overview for {user?.name}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Projects" value={activeProjects} icon={Briefcase} iconColor="text-primary" description="Live production pipelines" />
        <StatCard title="My Tasks" value={myTasksCount} icon={CheckSquare} iconColor="text-blue-400" description="Pending your execution" />
        <StatCard title="QC Queue" value={qcQueueCount} icon={ClipboardCheck} iconColor="text-amber-400" description="Waiting for review" />
        <StatCard title="Stage Queue" value={stageCount} icon={ListTodo} iconColor="text-purple-400" description="High-level milestones" />
      </div>

      <PendingSalesWidget sales={pendingSales} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle className="text-sm">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { href: '/dashboard/projects', label: 'Projects' },
              { href: '/dashboard/engagements', label: 'Engagements' },
              { href: '/dashboard/stage-queue', label: 'Stage Queue' },
              { href: '/dashboard/qc-reviews', label: 'QC Reviews' },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <Button variant="outline" className="w-full h-9 text-xs bg-white/5 border-white/10 hover:bg-white/10">
                  {label}
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle className="text-sm">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">User</span>
              <span>{user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-xs">
                {pmRole.replace('pm-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Org</span>
              <span className="text-xs">{(user as any)?.organization?.name || 'Sentra'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
