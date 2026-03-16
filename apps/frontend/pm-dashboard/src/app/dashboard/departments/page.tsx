'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Link from 'next/link';

const DEPT_COLORS: Record<string, string> = {
  DESIGN: 'bg-purple-500/20 text-purple-400',
  EDITING: 'bg-blue-500/20 text-blue-400',
  MARKETING: 'bg-orange-500/20 text-orange-400',
  DEVELOPMENT: 'bg-green-500/20 text-green-400',
  QC: 'bg-amber-500/20 text-amber-400',
  OPERATIONS: 'bg-red-500/20 text-red-400',
};

export default function DepartmentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pm', 'departments'],
    queryFn: () => api.getDepartments(),
    staleTime: 60_000,
  });

  const departments = (data as any)?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Manage team departments and member assignments." />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept: any) => (
            <Link key={dept.id} href={`/dashboard/departments/${dept.id}`}>
              <Card className="bg-white/[0.02] border-white/10 shadow-xl hover:bg-white/[0.04] transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{dept.name}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${DEPT_COLORS[dept.code] || 'bg-white/10 text-muted-foreground'}`}>
                      {dept.code}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{dept._count?.members ?? 0} members</span>
                  </div>
                  {dept.description && (
                    <p className="text-xs text-muted-foreground mt-2">{dept.description}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
