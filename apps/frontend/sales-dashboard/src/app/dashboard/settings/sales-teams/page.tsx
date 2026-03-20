'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ShieldCheck, UserCheck, ExternalLink, TrendingUp, BarChart2, ArrowRight } from 'lucide-react';
import { useTeamStats, type TeamStats } from '@/hooks/use-teams';

interface HrmsTeamMember {
  userId: string;
  user: { id: string; name: string; email: string } | null;
  role: string;
}

interface HrmsTeam {
  id: string;
  name: string;
  description?: string;
  type: { id: string; name: string };
  manager: { id: string; name: string; email: string } | null;
  members: HrmsTeamMember[];
  memberCount: number;
}

function TeamKpis({ teamId }: { teamId: string }) {
  const { data: stats, isLoading } = useTeamStats(teamId, 'this_month');

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
            <div className="h-5 w-10 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const kpis: { label: string; value: string | number; highlight?: boolean }[] = [
    { label: 'Leads', value: stats.totalLeads },
    { label: 'Won', value: stats.wonLeads, highlight: true },
    { label: 'Sales', value: stats.totalSales },
    {
      label: 'Revenue',
      value: stats.totalRevenue >= 1000
        ? `$${(stats.totalRevenue / 1000).toFixed(1)}k`
        : `$${stats.totalRevenue.toLocaleString()}`,
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
      {kpis.map((k) => (
        <div key={k.label}>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
          <p className={`text-lg font-semibold mt-0.5 ${k.highlight ? 'text-emerald-300' : 'text-foreground'}`}>
            {k.value}
          </p>
        </div>
      ))}
      <p className="col-span-full text-[10px] text-muted-foreground">This month</p>
    </div>
  );
}

export default function SalesTeamsPage() {
  const { data: teams = [], isLoading } = useQuery<HrmsTeam[]>({
    queryKey: ['sales-teams'],
    queryFn: () => api.getTeams(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Teams are managed in the HRMS dashboard.</p>
        </div>
        <a
          href={process.env.NEXT_PUBLIC_HRMS_URL ?? 'http://localhost:4202'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Manage in HRMS
        </a>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No teams yet</p>
              <p className="text-muted-foreground text-sm">Create teams from the HRMS dashboard to see them here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teams.map((team, index) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Link
                            href={`/dashboard/teams/${team.id}`}
                            className="hover:text-primary transition-colors hover:underline underline-offset-4"
                          >
                            {team.name}
                          </Link>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {team.type.name}
                          </Badge>
                        </CardTitle>
                        {team.description && (
                          <CardDescription className="mt-0.5">{team.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                      </span>
                      <Link
                        href={`/dashboard/teams/${team.id}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View details
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Manager
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.manager ? (
                          <Badge variant="outline" className="text-xs">
                            {team.manager.name || team.manager.email}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None assigned</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <UserCheck className="h-3.5 w-3.5" />
                        Members ({team.members.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.members.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None assigned</span>
                        ) : (
                          team.members.map((m) => (
                            <Badge key={m.userId} variant="secondary" className="text-xs">
                              {m.user?.name || m.user?.email || m.userId}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <TeamKpis teamId={team.id} />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
