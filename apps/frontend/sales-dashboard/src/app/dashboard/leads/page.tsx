'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads } from '@/hooks/use-leads';
import { useBrands } from '@/hooks/use-brands';
import { useMembers } from '@/hooks/use-organization';
import { ILead, LeadStatus } from '@sentra-core/types';
import { LeadsKanban } from './_components/leads-kanban';
import { LeadsTable } from './_components/leads-table';
import { LeadFormModal } from './_components/lead-form-modal';
import { LeadDetailSheet } from './_components/lead-detail-sheet';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

type ViewMode = 'kanban' | 'table';

export default function LeadsPage() {
  const [params, setParams] = useQueryStates({
    page:         parseAsInteger.withDefault(1),
    limit:        parseAsInteger.withDefault(20),
    search:       parseAsString.withDefault(''),
    status:       parseAsStringEnum<LeadStatus>(Object.values(LeadStatus)),
    brandId:      parseAsString,
    assignedToId: parseAsString,
    dateFrom:     parseAsString,
    dateTo:       parseAsString,
    view:         parseAsStringEnum<ViewMode>(['kanban', 'table']).withDefault('kanban'),
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const isKanban = params.view === 'kanban';

  const queryParams = useMemo(() => ({
    ...(isKanban ? { limit: 200 } : { page: params.page, limit: params.limit }),
    ...(debouncedSearch      ? { search: debouncedSearch }          : {}),
    ...(!isKanban && params.status       ? { status: params.status }             : {}),
    ...(params.brandId       ? { brandId: params.brandId }           : {}),
    ...(params.assignedToId  ? { assignedToId: params.assignedToId } : {}),
    ...(params.dateFrom      ? { dateFrom: params.dateFrom }         : {}),
    ...(params.dateTo        ? { dateTo: params.dateTo }             : {}),
  }), [isKanban, params.page, params.limit, debouncedSearch, params.status,
       params.brandId, params.assignedToId, params.dateFrom, params.dateTo]);

  const { data, isLoading, isError } = useLeads(queryParams);
  const { data: brandsData }  = useBrands({ limit: 100 });
  const { data: members }     = useMembers();

  const [modalOpen, setModalOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // Enrich leads with human-readable brand name + assignee name for kanban
  const leadsEnriched = useMemo(() => {
    const brandMap  = Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []);
    const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.id, m.name]));
    return (data?.data ?? []).map((l) => ({
      ...l,
      brandName:    brandMap[l.brandId] ?? undefined,
      assigneeName: l.assignedToId ? (memberMap[l.assignedToId] ?? undefined) : undefined,
    }));
  }, [data?.data, brandsData?.data, members]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track and manage your sales leads."
        action={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              <button
                onClick={() => setParams({ view: 'kanban' })}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                  isKanban
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setParams({ view: 'table' })}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                  !isKanban
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Lead
            </Button>
          </div>
        }
      />

      <FilterBar>
        {/* Search */}
        <Input
          placeholder="Search leads…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParams({ search: e.target.value, page: 1 });
          }}
          className="max-w-xs bg-white/5 border-white/10"
        />

        {/* Status (table only) */}
        {!isKanban && (
          <Select
            value={params.status ?? 'all'}
            onValueChange={(v) =>
              setParams({ status: v === 'all' ? null : (v as LeadStatus), page: 1 })
            }
          >
            <SelectTrigger className="w-36 bg-white/5 border-white/10">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.values(LeadStatus).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Brand */}
        <Select
          value={params.brandId ?? 'all'}
          onValueChange={(v) => setParams({ brandId: v === 'all' ? null : v, page: 1 })}
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brandsData?.data.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee */}
        <Select
          value={params.assignedToId ?? 'all'}
          onValueChange={(v) => setParams({ assignedToId: v === 'all' ? null : v, page: 1 })}
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10">
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {(members ?? []).map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <Input
          type="date"
          value={params.dateFrom ?? ''}
          onChange={(e) => setParams({ dateFrom: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="From date"
        />
        <Input
          type="date"
          value={params.dateTo ?? ''}
          onChange={(e) => setParams({ dateTo: e.target.value || null, page: 1 })}
          className="w-36 bg-white/5 border-white/10"
          title="To date"
        />
      </FilterBar>

      {isKanban ? (
        <LeadsKanban
          leads={leadsEnriched}
          onLeadClick={(l: ILead) => setDetailLeadId(l.id)}
        />
      ) : (
        <>
          <LeadsTable
            leads={leadsEnriched}
            isLoading={isLoading}
            isError={isError}
            onRowClick={(l) => setDetailLeadId(l.id)}
          />
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
          />
        </>
      )}

      <LeadFormModal open={modalOpen} onOpenChange={setModalOpen} />

      <LeadDetailSheet
        leadId={detailLeadId}
        onClose={() => setDetailLeadId(null)}
      />
    </div>
  );
}
