'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useProjectHealth,
  useSlaBreaches,
  useTeamPerformance,
  useEngagementFinancials,
  useResolveEscalation,
} from '@/hooks/use-reports';
import { Download, AlertCircle, CheckCircle, TrendingUp, DollarSign, Activity } from 'lucide-react';

type ReportTab = 'health' | 'sla' | 'performance' | 'financials';

function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const val = r[h];
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ——— Health Tab ———
function HealthTab() {
  const { data, isLoading } = useProjectHealth();
  const report = (data as any)?.data ?? data;
  const projects: any[] = report?.projects ?? report?.data ?? [];
  const summary = report?.summary ?? {};

  if (isLoading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && Object.keys(summary).length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(summary).slice(0, 6).map(([key, val]) => (
            <div key={key} className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              <p className="text-2xl font-bold mt-1">{String(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Projects Table */}
      {projects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Projects</h3>
            <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5 border-white/10" onClick={() => exportToCsv('project-health', projects)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
          <div className="bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Project</th>
                  <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status</th>
                  <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Health</th>
                  <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {projects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-medium">{p.name}</td>
                    <td className="p-4"><StatusBadge status={p.status} /></td>
                    <td className="p-4"><StatusBadge status={p.healthStatus ?? p.health} /></td>
                    <td className="p-4 text-muted-foreground text-xs">{p.deliveryDueAt ? new Date(p.deliveryDueAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {projects.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No health data available</p>
        </div>
      )}
    </div>
  );
}

// ——— SLA Tab ———
function SlaTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSlaBreaches(page, 20);
  const resolveEscalation = useResolveEscalation();
  const items: any[] = (data as any)?.data ?? [];
  const total: number = (data as any)?.meta?.total ?? 0;

  if (isLoading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">SLA Breaches ({total})</h3>
        {items.length > 0 && (
          <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5 border-white/10" onClick={() => exportToCsv('sla-breaches', items)}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-8 w-8 mx-auto mb-3 opacity-30 text-green-400" />
          <p className="text-sm">No open SLA breaches</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-red-500/20 rounded-xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium">{item.projectName ?? item.scopeType}</span>
                  <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">{item.breachType ?? item.eventType}</Badge>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {item.dueAt ? `Due: ${new Date(item.dueAt).toLocaleDateString()}` : ''}
                  {item.breachedAt ? ` · Breached: ${new Date(item.breachedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs"
                onClick={() => resolveEscalation.mutate(item.id)}
                disabled={resolveEscalation.isPending}
              >
                Resolve
              </Button>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="bg-white/5 border-white/10">Prev</Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">Page {page}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="bg-white/5 border-white/10">Next</Button>
        </div>
      )}
    </div>
  );
}

// ——— Performance Tab ———
function PerformanceTab() {
  const { data, isLoading } = useTeamPerformance();
  const members: any[] = (data as any)?.data ?? (data as any)?.members ?? [];

  if (isLoading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>;
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No performance data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Team Performance</h3>
        <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5 border-white/10" onClick={() => exportToCsv('team-performance', members)}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>
      <div className="bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Member</th>
              <th className="text-right p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Tasks Done</th>
              <th className="text-right p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">On Time %</th>
              <th className="text-right p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Avg Revisions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {members.map((m: any, i: number) => (
              <tr key={m.userId ?? i} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4 font-medium">{m.userName ?? m.name ?? m.userId?.slice(0, 8)}</td>
                <td className="p-4 text-right text-muted-foreground">{m.completedTasks ?? m.tasksDone ?? '—'}</td>
                <td className="p-4 text-right">
                  <span className={`text-xs font-bold ${(m.onTimeRate ?? m.onTimePct ?? 0) >= 80 ? 'text-green-400' : 'text-orange-400'}`}>
                    {m.onTimeRate ?? m.onTimePct != null ? `${m.onTimeRate ?? m.onTimePct}%` : '—'}
                  </span>
                </td>
                <td className="p-4 text-right text-muted-foreground">{m.avgRevisions ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ——— Financials Tab ———
function FinancialsTab() {
  const { data, isLoading } = useEngagementFinancials();
  const engagements: any[] = (data as any)?.data ?? (data as any)?.engagements ?? [];

  if (isLoading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>;
  }

  if (engagements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <DollarSign className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No financial data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Engagement Financials</h3>
        <Button variant="outline" size="sm" className="h-8 text-xs bg-white/5 border-white/10" onClick={() => exportToCsv('engagement-financials', engagements)}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>
      <div className="bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Engagement</th>
              <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Sale ID</th>
              <th className="text-right p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Projects</th>
              <th className="text-right p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Budget</th>
              <th className="text-left p-4 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {engagements.map((e: any, i: number) => (
              <tr key={e.id ?? i} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4 font-medium">{e.name}</td>
                <td className="p-4 text-xs text-muted-foreground font-mono">{e.saleId ? e.saleId.slice(0, 8) + '...' : '—'}</td>
                <td className="p-4 text-right text-muted-foreground">{e._count?.projects ?? e.projectCount ?? '—'}</td>
                <td className="p-4 text-right font-mono text-sm">{e.budget != null ? `$${Number(e.budget).toLocaleString()}` : '—'}</td>
                <td className="p-4"><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS: { id: ReportTab; label: string; icon: any }[] = [
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'sla', label: 'SLA Breaches', icon: AlertCircle },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'financials', label: 'Financials', icon: DollarSign },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('health');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Project health, SLA monitoring, team performance, and financial summaries."
      />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`pb-3 px-4 text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'health' && <HealthTab />}
        {activeTab === 'sla' && <SlaTab />}
        {activeTab === 'performance' && <PerformanceTab />}
        {activeTab === 'financials' && <FinancialsTab />}
      </div>
    </div>
  );
}
