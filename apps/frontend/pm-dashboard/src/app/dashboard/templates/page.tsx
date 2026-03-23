'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs';
import { Plus } from 'lucide-react';
import { PageHeader, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplates } from '@/hooks/use-pm-data';
import { TemplatesTable, TemplateItem } from './_components/templates-table';
import { TemplateFormModal } from './_components/template-form-modal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pmKeys } from '@/hooks/use-pm-data';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
    serviceType: parseAsString,
    isActive: parseAsBoolean,
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
    ...(params.serviceType ? { serviceType: params.serviceType } : {}),
    ...(params.isActive !== null ? { isActive: params.isActive } : {}),
  }), [params.page, params.limit, params.serviceType, params.isActive]);

  const { data, isLoading, isError } = useTemplates(queryParams);
  const templates = (data?.data ?? []) as TemplateItem[];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateItem | null>(null);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.fetch(`/templates/${id}/archive`, { method: 'POST', service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.templates });
      toast.success('Template archived');
    },
    onError: (e: Error) => toast.error('Failed to archive', e.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.fetch(`/templates/${id}/duplicate`, { method: 'POST', service: 'pm' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pmKeys.templates });
      toast.success('Template duplicated');
    },
    onError: (e: Error) => toast.error('Failed to duplicate', e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Templates"
        description="Standardize your agency's production workflows (SOPs as Code)."
        action={
          <Button onClick={() => { setEditTemplate(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        }
      />

      <FilterBar>
        <div className="flex items-center gap-3">
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

          <Select
            value={params.isActive === null ? 'all' : params.isActive ? 'true' : 'false'}
            onValueChange={(v) => setParams({ isActive: v === 'all' ? null : v === 'true', page: 1 })}
          >
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
        <TemplatesTable
          templates={templates}
          isLoading={isLoading}
          isError={isError}
          onRowClick={(t) => router.push(`/dashboard/templates/${t.id}`)}
          onEdit={(t) => { setEditTemplate(t); setModalOpen(true); }}
          onDuplicate={(t) => duplicateMutation.mutate(t.id)}
          onArchive={(t) => archiveMutation.mutate(t.id)}
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

      <TemplateFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        template={editTemplate}
      />
    </div>
  );
}
