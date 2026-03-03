'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FormModal } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateProject, useUpdateProject } from '@/hooks/use-projects';
import { useBrands } from '@/hooks/use-brands';
import { useClients } from '@/hooks/use-clients';
import { useEngagements, useTemplates } from '@/hooks/use-pm-data';

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: any | null;
}

interface FormValues {
  name: string;
  description: string;
  engagementId: string;
  brandId: string;
  clientId: string;
  templateId: string;
  projectType: string;
  serviceType: string;
  priority: string;
  deliveryDueAt: string;
}

export function ProjectFormModal({ open, onOpenChange, project }: ProjectFormModalProps) {
  const isEdit = !!project;
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: clientsData } = useClients({ limit: 100 });
  const { data: engagementsData } = useEngagements({ limit: 100 });
  const { data: templatesData } = useTemplates({ limit: 100 });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  
  const engagementId = watch('engagementId');
  const brandId = watch('brandId');
  const clientId = watch('clientId');
  const templateId = watch('templateId');
  const projectType = watch('projectType');
  const serviceType = watch('serviceType');
  const priority = watch('priority');

  useEffect(() => {
    if (open) {
      reset({
        name: project?.name ?? '',
        description: project?.description ?? '',
        engagementId: project?.engagementId ?? '',
        brandId: project?.brandId ?? '',
        clientId: project?.clientId ?? '',
        templateId: project?.templateId ?? '',
        projectType: project?.projectType ?? 'EXTERNAL',
        serviceType: project?.serviceType ?? 'PUBLISHING',
        priority: project?.priority ?? 'MEDIUM',
        deliveryDueAt: project?.deliveryDueAt ? new Date(project.deliveryDueAt).toISOString().split('T')[0] : '',
      });
    }
  }, [open, project, reset]);

  const mutation = isEdit ? updateProject : createProject;
  const error = mutation.error?.message ?? null;

  const onSubmit = async (values: FormValues) => {
    const dto: Record<string, unknown> = {
      name: values.name,
      description: values.description || null,
      engagementId: values.engagementId,
      brandId: values.brandId,
      clientId: values.clientId || null,
      templateId: values.templateId || null,
      projectType: values.projectType,
      serviceType: values.serviceType,
      priority: values.priority,
      deliveryDueAt: values.deliveryDueAt ? new Date(values.deliveryDueAt).toISOString() : null,
    };

    if (isEdit && project) {
      await updateProject.mutateAsync({ id: project.id, ...dto });
    } else {
      await createProject.mutateAsync(dto);
    }
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Project' : 'New Project'}
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label>Project Name *</Label>
          <Input placeholder="Enter project name" {...register('name', { required: 'Required' })} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input placeholder="Optional project description" {...register('description')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Engagement *</Label>
            <Select value={engagementId} onValueChange={(v) => setValue('engagementId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select engagement" />
              </SelectTrigger>
              <SelectContent>
                {engagementsData?.data.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Brand *</Label>
            <Select value={brandId} onValueChange={(v) => setValue('brandId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brandsData?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client (Optional)</Label>
            <Select value={clientId} onValueChange={(v) => setValue('clientId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {clientsData?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Template (Optional)</Label>
            <Select value={templateId} onValueChange={(v) => setValue('templateId', v)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Blank Project</SelectItem>
                {templatesData?.data.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Project Type</Label>
            <Select value={projectType} onValueChange={(v) => setValue('projectType', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXTERNAL">External</SelectItem>
                <SelectItem value="INTERNAL">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={(v) => setValue('serviceType', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLISHING">Publishing</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="WEB_DEVELOPMENT">Web Dev</SelectItem>
                <SelectItem value="DESIGN">Design</SelectItem>
                <SelectItem value="GENERAL">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setValue('priority', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Delivery Due Date</Label>
          <Input type="date" {...register('deliveryDueAt')} className="bg-white/5 border-white/10" />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
