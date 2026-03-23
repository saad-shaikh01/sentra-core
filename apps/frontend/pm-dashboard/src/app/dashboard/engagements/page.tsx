'use client';

import { useMemo, useState } from 'react';
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs';
import { Plus, Search } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEngagements, useArchiveEngagement } from '@/hooks/use-pm-data';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { EngagementsTable } from './_components/engagements-table';
import { EngagementFormModal } from './_components/engagement-form-modal';
import { useDebounce } from '@/hooks/use-debounce';

export default function EngagementsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    search: parseAsString.withDefault(''),
    status: parseAsString,
    ownerType: parseAsString,
  });
  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.ownerType ? { ownerType: params.ownerType } : {}),
  }), [params.page, params.limit, debouncedSearch, params.status, params.ownerType]);

  const { data, isLoading, isError } = useEngagements(queryParams);
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: clientsData } = useClients({ limit: 100 });
  const archiveMutation = useArchiveEngagement();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

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
          <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Engagement
          </Button>
        }
      />

      <FilterBar>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search engagements by name…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setParams({ search: e.target.value, page: 1 });
            }}
            className="pl-10 bg-white/5 border-white/10 focus:bg-white/10 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={params.status ?? 'all'}
            onValueChange={(v) => setParams({ status: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={params.ownerType ?? 'all'}
            onValueChange={(v) => setParams({ ownerType: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-44 bg-white/5 border-white/10">
              <SelectValue placeholder="Owner Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owner Types</SelectItem>
              <SelectItem value="CLIENT">Client</SelectItem>
              <SelectItem value="INTERNAL_BRAND">Internal Brand</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <EngagementsTable
          engagements={engagementsEnriched}
          isLoading={isLoading}
          isError={isError}
          onEdit={(row) => {
            setEditing(row);
            setModalOpen(true);
          }}
          onArchive={(row) => archiveMutation.mutate(row.id)}
        />
        
        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
            onLimitChange={(l) => setParams({ limit: l, page: 1 })}
          />
        </div>
      </div>

      <EngagementFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        engagement={editing}
      />
    </div>
  );
}
