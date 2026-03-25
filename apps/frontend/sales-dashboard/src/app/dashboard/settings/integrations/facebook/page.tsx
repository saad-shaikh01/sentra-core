'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Facebook, Plus, Pencil, Power, Trash2 } from 'lucide-react';
import { IFacebookIntegration } from '@sentra-core/types';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, PasswordInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';

type BrandOption = { id: string; name: string };
type FormState = {
  brandId: string;
  pageId: string;
  formId: string;
  accessToken: string;
  label: string;
};
type UpdateFormState = Partial<FormState> & { isActive?: boolean };

const EMPTY_FORM: FormState = {
  brandId: '',
  pageId: '',
  formId: '',
  accessToken: '',
  label: '',
};

export default function FacebookLeadIntegrationsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IFacebookIntegration | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: integrations = [], isLoading } = useQuery<IFacebookIntegration[]>({
    queryKey: ['facebook-integrations'],
    queryFn: () => api.getFacebookIntegrations(),
  });

  const { data: brandsResponse } = useQuery<{ data: BrandOption[] }>({
    queryKey: ['brands', 'facebook-integrations'],
    queryFn: () => api.getBrands({ limit: 100 }),
  });

  const brands = useMemo(() => brandsResponse?.data ?? [], [brandsResponse?.data]);

  const createMutation = useMutation({
    mutationFn: (dto: FormState) => api.createFacebookIntegration(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-integrations'] });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFormState }) =>
      api.updateFacebookIntegration(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-integrations'] });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFacebookIntegration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facebook-integrations'] }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (integration: IFacebookIntegration) => {
    setEditing(integration);
    setForm({
      brandId: integration.brandId,
      pageId: integration.pageId,
      formId: integration.formId,
      accessToken: '',
      label: integration.label ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        dto: {
          brandId: form.brandId,
          pageId: form.pageId,
          formId: form.formId,
          ...(form.accessToken.trim() ? { accessToken: form.accessToken } : {}),
          label: form.label,
        },
      });
      return;
    }

    await createMutation.mutateAsync(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facebook Lead Ads"
        description="Register Facebook lead forms and route incoming leads into your dashboard automatically."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Integration
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Webhook URL pattern:
          {' '}
          <code className="rounded bg-black/20 px-2 py-1 text-xs">
            /webhooks/facebook-leads?webhookId=INTEGRATION_ID
          </code>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading Facebook integrations...
          </CardContent>
        </Card>
      ) : integrations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Facebook className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-semibold">No Facebook lead integrations yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first form to start capturing Facebook leads automatically.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{integration.label || `${integration.pageId} / ${integration.formId}`}</CardTitle>
                    <CardDescription className="mt-1">
                      Page
                      {' '}
                      <code>{integration.pageId}</code>
                      {' · '}
                      Form
                      {' '}
                      <code>{integration.formId}</code>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(integration)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateMutation.mutate({
                          id: integration.id,
                          dto: { isActive: !integration.isActive },
                        })
                      }
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(integration.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Status:
                {' '}
                <span className={integration.isActive ? 'text-emerald-300' : 'text-amber-300'}>
                  {integration.isActive ? 'Active' : 'Disabled'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Facebook Integration' : 'Add Facebook Integration'}</DialogTitle>
            <DialogDescription>
              Store the form mapping and access token used to fetch lead details from Facebook.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <select
                value={form.brandId}
                onChange={(event) => setForm((current) => ({ ...current, brandId: event.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                required
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Page ID</Label>
                <Input
                  value={form.pageId}
                  onChange={(event) => setForm((current) => ({ ...current, pageId: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Form ID</Label>
                <Input
                  value={form.formId}
                  onChange={(event) => setForm((current) => ({ ...current, formId: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Access Token {editing ? '(leave blank to keep current token)' : ''}</Label>
              <PasswordInput
                value={form.accessToken}
                onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))}
                required={!editing}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Optional internal label"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Integration'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
