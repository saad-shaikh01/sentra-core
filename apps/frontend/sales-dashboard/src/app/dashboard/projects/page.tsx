'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs';
import { Plus, Search, Filter, LayoutGrid, List } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProjects } from '@/hooks/use-projects';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { useDebounce } from '@/hooks/use-debounce';
import { ProjectsTable } from './_components/projects-table';
import { ProjectFormModal } from './_components/project-form-modal';
import { useRouter } from 'next/navigation';

export default function ProjectsPage() {
  const router = useRouter();
  const [params, setParams] = useQueryStates({
    page:         parseAsInteger.withDefault(1),
    limit:        parseAsInteger.withDefault(20),
    search:       parseAsString.withDefault(''),
    status:       parseAsString,
    brandId:      parseAsString,
    serviceType:  parseAsString,
  });

  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(debouncedSearch     ? { search: debouncedSearch } : {}),
    ...(params.status       ? { status: params.status } : {}),
    ...(params.brandId      ? { brandId: params.brandId } : {}),
    ...(params.serviceType  ? { serviceType: params.serviceType } : {}),
  }), [params.page, params.limit, debouncedSearch, params.status, params.brandId, params.serviceType]);

  const { data, isLoading, isError } = useProjects(queryParams);
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: clientsData } = useClients({ limit: 100 });

  const [modalOpen, setModalOpen] = useState(false);

  // Enrich projects with brand and client names
  const projectsEnriched = useMemo(() => {
    const brandMap = Object.fromEntries(brandsData?.data.map((b) => [b.id, b.name]) ?? []);
    const clientMap = Object.fromEntries(clientsData?.data.map((c) => [c.id, c.companyName]) ?? []);
    return (data?.data ?? []).map((p: any) => ({
      ...p,
      brandName: brandMap[p.brandId] ?? undefined,
      clientName: p.clientId ? (clientMap[p.clientId] ?? undefined) : undefined,
    }));
  }, [data?.data, brandsData?.data, clientsData?.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Management"
        description="Monitor and deliver production workflows."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Project
          </Button>
        }
      />

      <FilterBar>
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects by name…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setParams({ search: e.target.value, page: 1 });
            }}
            className="pl-10 bg-white/5 border-white/10 focus:bg-white/10 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Status */}
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
              <SelectItem value="BLOCKED">Blocked</SelectItem>
              <SelectItem value="WAITING_APPROVAL">Waiting Approval</SelectItem>
              <SelectItem value="REVISION_REQUIRED">Revision Required</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>

          {/* Service Type */}
          <Select
            value={params.serviceType ?? 'all'}
            onValueChange={(v) => setParams({ serviceType: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Service Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              <SelectItem value="PUBLISHING">Publishing</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="WEB_DEVELOPMENT">Web Dev</SelectItem>
              <SelectItem value="DESIGN">Design</SelectItem>
              <SelectItem value="GENERAL">General</SelectItem>
            </SelectContent>
          </Select>

          {/* Brand */}
          <Select
            value={params.brandId ?? 'all'}
            onValueChange={(v) => setParams({ brandId: v === 'all' ? null : v, page: 1 })}
          >
            <SelectTrigger className="w-44 bg-white/5 border-white/10">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brandsData?.data.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
        <ProjectsTable
          projects={projectsEnriched}
          isLoading={isLoading}
          isError={isError}
          onRowClick={(p) => router.push(`/dashboard/projects/${p.id}`)}
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

      <ProjectFormModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
