'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Power, Trash2 } from 'lucide-react';
import { IGenericLeadWebhook, LeadSource, LeadType } from '@sentra-core/types';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  label: string;
  defaultSource: LeadSource | '';
  defaultLeadType: LeadType | '';
};

const EMPTY_FORM: FormState = {
  brandId: '',
  label: '',
  defaultSource: '',
  defaultLeadType: '',
};

export default function GenericLeadWebhooksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<IGenericLeadWebhook[]>({
    queryKey: ['inbound-lead-webhooks'],
    queryFn: () => api.getInboundLeadWebhooks(),
  });

  const { data: brandsResponse } = useQuery<{ data: BrandOption[] }>({
    queryKey: ['brands', 'inbound-lead-webhooks'],
    queryFn: () => api.getBrands({ limit: 100 }),
  });

  const brands = useMemo(() => brandsResponse?.data ?? [], [brandsResponse?.data]);

  const createMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createInboundLeadWebhook(dto),
    onSuccess: (data: IGenericLeadWebhook) => {
      queryClient.invalidateQueries({ queryKey: ['inbound-lead-webhooks'] });
      setLatestSecret(data.signingSecret ?? null);
      setLatestUrl(data.webhookUrl ?? null);
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Record<string, unknown> }) =>
      api.updateInboundLeadWebhook(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbound-lead-webhooks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInboundLeadWebhook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbound-lead-webhooks'] }),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await createMutation.mutateAsync({
      brandId: form.brandId,
      ...(form.label.trim() ? { label: form.label } : {}),
      ...(form.defaultSource ? { defaultSource: form.defaultSource } : {}),
      ...(form.defaultLeadType ? { defaultLeadType: form.defaultLeadType } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbound Lead Webhooks"
        description="Create signed webhook URLs for tools like Zapier, Make, Typeform, or custom forms."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Webhook
          </Button>
        }
      />

      {latestUrl && latestSecret ? (
        <Card>
          <CardHeader>
            <CardTitle>Webhook Ready</CardTitle>
            <CardDescription>Copy these credentials now. The signing secret is only shown at creation time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              URL:
              {' '}
              <code className="rounded bg-black/20 px-2 py-1 text-xs">{latestUrl}</code>
            </div>
            <div>
              Signature header:
              {' '}
              <code className="rounded bg-black/20 px-2 py-1 text-xs">x-sentra-signature: sha256=HMAC_BODY</code>
            </div>
            <div>
              Secret:
              {' '}
              <code className="rounded bg-black/20 px-2 py-1 text-xs">{latestSecret}</code>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading inbound webhooks...
          </CardContent>
        </Card>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Link2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-semibold">No inbound webhooks yet</p>
              <p className="text-sm text-muted-foreground">
                Create a signed endpoint to receive leads from external tools.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{webhook.label || webhook.id}</CardTitle>
                    <CardDescription>{webhook.webhookUrl}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateMutation.mutate({
                          id: webhook.id,
                          dto: { isActive: !webhook.isActive },
                        })
                      }
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Default source:
                {' '}
                {webhook.defaultSource ?? 'WEBHOOK'}
                {' · '}
                Default lead type:
                {' '}
                {webhook.defaultLeadType ?? 'INBOUND'}
                {' · '}
                Status:
                {' '}
                <span className={webhook.isActive ? 'text-emerald-300' : 'text-amber-300'}>
                  {webhook.isActive ? 'Active' : 'Disabled'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Inbound Lead Webhook</DialogTitle>
            <DialogDescription>
              A unique signed endpoint will be generated for this brand.
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

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Optional internal label"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Default Source</Label>
                <select
                  value={form.defaultSource}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultSource: event.target.value as LeadSource | '',
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="">WEBHOOK</option>
                  {Object.values(LeadSource).map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Default Lead Type</Label>
                <select
                  value={form.defaultLeadType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultLeadType: event.target.value as LeadType | '',
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="">INBOUND</option>
                  {Object.values(LeadType).map((leadType) => (
                    <option key={leadType} value={leadType}>
                      {leadType}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Webhook'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
