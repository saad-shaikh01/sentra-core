'use client';

import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, CheckSquare, ListTodo, ClipboardCheck } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const formatRole = (role: string) => {
    return role?.replace(/_/g, ' ') || '';
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">PM Dashboard</h1>
        <p className="text-muted-foreground">
          Production overview for {user?.name}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-[10px] text-muted-foreground mt-1">Live production pipelines</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-[10px] text-muted-foreground mt-1">Pending your execution</p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">QC Queue</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-[10px] text-muted-foreground mt-1">Waiting for review</p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stage Queue</CardTitle>
            <ListTodo className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-[10px] text-muted-foreground mt-1">High-level milestones</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white/[0.02] border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle>Session Context</CardTitle>
            <CardDescription>Authentication verified against Core Service</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User</p>
                <p className="text-sm font-medium">{user?.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{user?.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role</p>
                <Badge variant="outline" className="mt-1 border-primary/20 bg-primary/5 text-primary">
                  {formatRole(user?.role || '')}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Organization</p>
                <p className="text-sm font-medium">{user?.organization?.name || 'Sentra'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/10 shadow-xl flex flex-col justify-center items-center text-center p-8">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Briefcase className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-bold text-lg">Manage Production</h3>
          <p className="text-sm text-muted-foreground max-w-xs mt-2">
            Use the sidebar to navigate between your tasks, projects, and quality control reviews.
          </p>
        </Card>
      </div>
    </div>
  );
}
