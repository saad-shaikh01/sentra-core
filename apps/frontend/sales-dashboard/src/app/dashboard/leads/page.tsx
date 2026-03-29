'use client';

import { useMemo, useState } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum, parseAsBoolean } from 'nuqs';
import { Plus, LayoutGrid, List, Upload } from 'lucide-react';
import { PageHeader, FilterBar, Pagination, FilterGroup, FilterChips, FilterLabel, ActiveFilter } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads } from '@/hooks/use-leads';
import { useBrands } from '@/hooks/use-brands';
import { useMembers } from '@/hooks/use-organization';
import { useTeams } from '@/hooks/use-teams';
import { usePermissions } from '@/hooks/use-permissions';
import { ILead, ILeadDetail, IOrganizationMember, LeadSource, LeadStatus, LeadType, LeadViewTab } from '@sentra-core/types';
import { LeadsKanban } from './_components/leads-kanban';
import { LeadsTable } from './_components/leads-table';
import { LeadFormModal } from './_components/lead-form-modal';
import { LeadImportModal } from './_components/lead-import-modal';
import { LeadDetailSheet } from './_components/lead-detail-sheet';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

type ViewMode = 'kanban' | 'table';

function formatEnumLabel(value: string) {
  if (value === 'NCE') {
    return 'NCE';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function LeadsPage() {
  const [params, setParams] = useQueryStates({
    page:         parseAsInteger.withDefault(1),
    limit:        parseAsInteger.withDefault(20),
    search:       parseAsString.withDefault(''),
    status:       parseAsStringEnum<LeadStatus>(Object.values(LeadStatus)),
    source:       parseAsStringEnum<LeadSource>(Object.values(LeadSource)),
    leadType:     parseAsStringEnum<LeadType>(Object.values(LeadType)),
    brandId:      parseAsString,
    teamId:       parseAsString,
    assignedToId: parseAsString,
    unassigned:   parseAsBoolean.withDefault(false),
    dateFrom:     parseAsString,
    dateTo:       parseAsString,
    view:         parseAsStringEnum<ViewMode>(['kanban', 'table']).withDefault('table'),
    leadView:     parseAsStringEnum<LeadViewTab>(['my', 'collaborating', 'pool', 'team']),
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const isKanban = params.view === 'kanban';

  const queryParams = useMemo(() => ({
    ...(isKanban ? { limit: 100 } : { page: params.page, limit: params.limit }),
    ...(debouncedSearch      ? { search: debouncedSearch }          : {}),
    ...(!isKanban && params.status       ? { status: params.status }             : {}),
    ...(params.source        ? { source: params.source }           : {}),
    ...(params.leadType      ? { leadType: params.leadType }       : {}),
    ...(params.brandId       ? { brandId: params.brandId }           : {}),
    ...(params.teamId        ? { teamId: params.teamId }             : {}),
    ...(params.assignedToId  ? { assignedToId: params.assignedToId } : {}),
    ...(params.unassigned    ? { unassigned: true }                  : {}),
    ...(params.dateFrom      ? { dateFrom: params.dateFrom }         : {}),
    ...(params.dateTo        ? { dateTo: params.dateTo }             : {}),
    ...(params.leadView      ? { leadView: params.leadView }         : {}),
  }), [isKanban, params.page, params.limit, debouncedSearch, params.status,
       params.source, params.leadType, params.brandId, params.teamId, params.assignedToId, params.unassigned, params.dateFrom, params.dateTo, params.leadView]);

  const { data, isLoading, isError } = useLeads(queryParams);
  const { data: brandsData }  = useBrands({ limit: 100 });
  const { data: teamsData } = useTeams({ limit: 100 });
  const { data: frontSellAgents } = useMembers({ permission: 'sales:leads:view_own' });
  const { hasPermission } = usePermissions();

  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [editLead, setEditLead] = useState<ILeadDetail | null>(null);

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);

    if (!open) {
      setEditLead(null);
    }
  };

  // Enrich leads with human-readable brand name + assignee name for kanban
  const leadsEnriched = useMemo(() => {
    const brandMap  = Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []);
    const memberMap = Object.fromEntries(
      (frontSellAgents ?? []).map((member: Pick<IOrganizationMember, 'id' | 'name'>) => [member.id, member.name])
    );

    return (data?.data ?? []).map((l) => ({
      ...l,
      brandName:    brandMap[l.brandId] ?? undefined,
      assigneeName: l.assignedToId ? (memberMap[l.assignedToId] ?? 'Assigned') : 'Unassigned',
      assignmentState: (l.assignedToId
        ? ((l.collaboratorCount ?? 0) > 0 ? 'Shared' : 'Assigned')
        : 'Unassigned') as 'Assigned' | 'Unassigned' | 'Shared',
    }));
  }, [data?.data, brandsData?.data, frontSellAgents]);

  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (!isKanban && params.status) {
      filters.push({ key: 'status', label: 'Status', displayValue: params.status });
    }
    if (params.source) {
      filters.push({ key: 'source', label: 'Source', displayValue: formatEnumLabel(params.source) });
    }
    if (params.leadType) {
      filters.push({ key: 'leadType', label: 'Type', displayValue: formatEnumLabel(params.leadType) });
    }
    if (params.brandId) {
      const brand = brandsData?.data.find((b) => b.id === params.brandId);
      filters.push({ key: 'brandId', label: 'Brand', displayValue: brand?.name ?? params.brandId });
    }
    if (params.teamId) {
      const team = teamsData?.data.find((t) => t.id === params.teamId);
      filters.push({ key: 'teamId', label: 'Team', displayValue: team?.name ?? params.teamId });
    }
    if (params.assignedToId) {
      const agent = (frontSellAgents ?? []).find((a) => a.id === params.assignedToId);
      filters.push({ key: 'assignedToId', label: 'Assignee', displayValue: agent?.name ?? params.assignedToId });
    }
    if (params.unassigned) {
      filters.push({ key: 'unassigned', label: 'Assignee', displayValue: 'Unassigned' });
    }
    if (params.dateFrom) {
      filters.push({ key: 'dateFrom', label: 'From', displayValue: params.dateFrom });
    }
    if (params.dateTo) {
      filters.push({ key: 'dateTo', label: 'To', displayValue: params.dateTo });
    }
    return filters;
  }, [params, brandsData, teamsData, frontSellAgents, isKanban]);

  const handleClearFilters = () => {
    setParams({
      status: null,
      source: null,
      leadType: null,
      brandId: null,
      teamId: null,
      assignedToId: null,
      unassigned: false,
      dateFrom: null,
      dateTo: null,
      leadView: null,
      page: 1,
    });
  };

  const isFrontsell = hasPermission('sales:leads:view_own');

  const leadViewTabs: Array<{ value: LeadViewTab; label: string }> = [
    { value: 'my', label: 'My Leads' },
    { value: 'collaborating', label: 'Collaborating' },
    { value: 'pool', label: 'Unassigned Pool' },
    { value: 'team', label: 'Team Leads' },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track and manage your sales leads."
        action={
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* View toggle */}
            <div className="flex rounded-xl border border-white/10 overflow-hidden shrink-0">
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
            <Button variant="outline" onClick={() => setImportModalOpen(true)} className="flex-1 sm:flex-none">
              <Upload className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Import Leads</span><span className="sm:hidden">Import</span>
            </Button>
            <Button onClick={() => {
              setEditLead(null);
              setModalOpen(true);
            }} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">New Lead</span><span className="sm:hidden">New</span>
            </Button>
          </div>
        }
      />

      {isFrontsell && (
        <div className="flex border-b border-white/[0.06] mb-1">
          <button
            onClick={() => setParams({ leadView: null, page: 1 })}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              params.leadView === null
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-white/20',
            )}
          >
            All
          </button>
          {leadViewTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setParams({ leadView: params.leadView === tab.value ? null : tab.value, page: 1 })}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                params.leadView === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-white/20',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <FilterBar>
        {/* Search */}
        <Input
          placeholder="Search leads…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setParams({ search: e.target.value, page: 1 });
          }}
          className="w-full sm:max-w-xs bg-white/[0.03] border-white/[0.05] focus:bg-white/[0.05] transition-all"
        />

        <FilterGroup
          activeCount={activeFilters.length}
          onClear={handleClearFilters}
        >
          {/* Status (table only) */}
          {!isKanban && (
            <FilterLabel label="Status">
              <Select
                value={params.status ?? 'all'}
                onValueChange={(v) =>
                  setParams({ status: v === 'all' ? null : (v as LeadStatus), page: 1 })
                }
              >
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.values(LeadStatus).map((s) => (
                    <SelectItem key={s} value={s}>{formatEnumLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterLabel>
          )}

          <FilterLabel label="Source">
            <Select
              value={params.source ?? 'all'}
              onValueChange={(value) => setParams({ source: value === 'all' ? null : (value as LeadSource), page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {Object.values(LeadSource).map((source) => (
                  <SelectItem key={source} value={source}>{formatEnumLabel(source)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="Lead Type">
            <Select
              value={params.leadType ?? 'all'}
              onValueChange={(value) => setParams({ leadType: value === 'all' ? null : (value as LeadType), page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All lead types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lead types</SelectItem>
                {Object.values(LeadType).map((leadType) => (
                  <SelectItem key={leadType} value={leadType}>{formatEnumLabel(leadType)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          <FilterLabel label="Brand">
            <Select
              value={params.brandId ?? 'all'}
              onValueChange={(v) => setParams({ brandId: v === 'all' ? null : v, page: 1 })}
            >
              <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterLabel>

          {hasPermission('sales:teams:view') && (
            <FilterLabel label="Team">
              <Select
                value={params.teamId ?? 'all'}
                onValueChange={(v) => setParams({ teamId: v === 'all' ? null : v, page: 1 })}
              >
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {(teamsData?.data ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterLabel>
          )}

          {hasPermission('sales:leads:view_all') && (
            <FilterLabel label="Assignee">
              <Select
                value={params.unassigned ? '__unassigned__' : (params.assignedToId ?? 'all')}
                onValueChange={(v) => {
                  if (v === '__unassigned__') {
                    setParams({ unassigned: true, assignedToId: null, page: 1 });
                  } else {
                    setParams({ unassigned: false, assignedToId: v === 'all' ? null : v, page: 1 });
                  }
                }}
              >
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all">
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {(frontSellAgents ?? []).map((member: Pick<IOrganizationMember, 'id' | 'name'>) => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterLabel>
          )}

          <FilterLabel label="From Date">
            <Input
              type="date"
              value={params.dateFrom ?? ''}
              onChange={(e) => setParams({ dateFrom: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
            />
          </FilterLabel>

          <FilterLabel label="To Date">
            <Input
              type="date"
              value={params.dateTo ?? ''}
              onChange={(e) => setParams({ dateTo: e.target.value || null, page: 1 })}
              className="w-full bg-white/[0.03] border-white/[0.05] focus:ring-primary/20 transition-all"
            />
          </FilterLabel>
        </FilterGroup>
      </FilterBar>

      <FilterChips
        filters={activeFilters}
        onRemove={(key: string) => setParams({ [key]: key === 'unassigned' ? false : null, page: 1 })}
        onClear={handleClearFilters}
      />

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
            onLimitChange={(l) => setParams({ limit: l, page: 1 })}
          />
        </>
      )}

      <LeadFormModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        lead={editLead ?? undefined}
      />
      <LeadImportModal open={importModalOpen} onOpenChange={setImportModalOpen} />

      <LeadDetailSheet
        leadId={detailLeadId}
        onClose={() => setDetailLeadId(null)}
        onEdit={(lead) => {
          setEditLead(lead);
          setModalOpen(true);
        }}
      />
    </div>
  );
}
