'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';

interface DeliverablesPanelProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  SENT: 'bg-blue-500/20 text-blue-400',
  APPROVED: 'bg-green-500/20 text-green-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  EXPIRED: 'bg-gray-500/20 text-gray-400',
};

export function DeliverablesPanel({ projectId }: DeliverablesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['pm', 'deliverables', projectId],
    queryFn: () => api.fetch<{ data: any[] }>(`/projects/${projectId}/deliverables`, { service: 'pm' }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const deliverables = (data as any)?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (deliverables.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No deliverable packages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deliverables.map((pkg: any) => {
        const isOpen = expanded[pkg.id];
        const latestApproval = pkg.approvalRequests?.[0];
        return (
          <Card key={pkg.id} className="bg-white/[0.02] border-white/10">
            <CardHeader
              className="p-4 cursor-pointer"
              onClick={() => setExpanded(prev => ({ ...prev, [pkg.id]: !prev[pkg.id] }))}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Package className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">{pkg.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-white/10">{pkg.deliveryType}</Badge>
                  {latestApproval && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[latestApproval.status] || 'bg-white/5 text-muted-foreground'}`}>
                      {latestApproval.status}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs border-white/10">{pkg.items?.length ?? 0} items</Badge>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="px-4 pb-4 pt-0">
                {pkg.items?.length > 0 ? (
                  <div className="space-y-1">
                    {pkg.items.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-white/5 rounded-lg">
                        <span className="text-xs text-foreground/60">{item.label || `Item ${item.sortOrder + 1}`}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No items in this package</p>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
