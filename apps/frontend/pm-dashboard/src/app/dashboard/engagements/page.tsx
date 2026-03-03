'use client';

import { useMemo } from 'react';
import { useQueryStates, parseAsInteger } from 'nuqs';
import { Plus } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useEngagements } from '@/hooks/use-pm-data';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { EngagementsTable } from './_components/engagements-table';

export default function EngagementsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
  }), [params.page, params.limit]);

  const { data, isLoading, isError } = useEngagements(queryParams);
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: clientsData } = useClients({ limit: 100 });

  const engagementsEnriched = useMemo(() => {
    const brandMap = Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []);
    const clientMap = Object.fromEntries(clientsData?.data.map((c) => [c.id, c.companyName]) ?? []);
    return (data?.data ?? []).map((e: any) => ({
      ...e,
      brandName: brandMap[e.brandId] ?? 'Unknown',
      clientName: e.clientId ? (clientMap[e.clientId] ?? 'Unknown') : 'None',
    }));
  }, [data?.data, brandsData?.data, clientsData?.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Engagements"
        description="High-level client agreements and budget buckets."
        action={
          <Button disabled title="Create via Sales Dashboard">
            <Plus className="h-4 w-4 mr-2" /> New Engagement
          </Button>
        }
      />

      <FilterBar>
        <div className="flex-1 text-sm text-muted-foreground italic">
          Filtering and search for engagements are not yet supported by the production API.
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <EngagementsTable
          engagements={engagementsEnriched}
          isLoading={isLoading}
          isError={isError}
        />
        
        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
          />
        </div>
      </div>
    </div>
  );
}
