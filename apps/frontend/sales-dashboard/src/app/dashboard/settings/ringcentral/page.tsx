'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  commKeys,
  useDisconnectRingCentralConnection,
  useInitiateRingCentralOAuth,
  useRingCentralConnections,
  useSetDefaultRingCentralConnection,
  useSyncRingCentralWebhookConnection,
} from '@/hooks/use-comm';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RingCentralConnection } from '@/types/comm.types';

type OAuthBrandOption = {
  id: string;
  name: string;
};

const UNASSIGNED_BRAND_VALUE = '__none__';

export default function RingCentralSettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <RingCentralSettingsPage />
    </Suspense>
  );
}

function RingCentralSettingsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { data: connections, isLoading, isError, error, refetch } = useRingCentralConnections();
  const connectMutation = useInitiateRingCentralOAuth();
  const disconnectMutation = useDisconnectRingCentralConnection();
  const defaultMutation = useSetDefaultRingCentralConnection();
  const syncWebhookMutation = useSyncRingCentralWebhookConnection();

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState(UNASSIGNED_BRAND_VALUE);
  const [brandOptions, setBrandOptions] = useState<OAuthBrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  const canViewOrgConnections = hasPermission('sales:settings:view');
  const brandNameById = useMemo(
    () => new Map(brandOptions.map((brand) => [brand.id, brand.name])),
    [brandOptions],
  );

  useEffect(() => {
    const success = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (success === '1') {
      toast.success('RingCentral connected successfully');
      queryClient.invalidateQueries({ queryKey: commKeys.ringCentralConnections() });
    } else if (errorParam) {
      toast.error('Failed to connect RingCentral', decodeURIComponent(errorParam));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBrands = async () => {
      try {
        setBrandsLoading(true);
        setBrandsError(null);
        const response = await api.getRingCentralOAuthBrands();
        if (isMounted) {
          setBrandOptions(response.data ?? []);
        }
      } catch (err) {
        if (isMounted) {
          setBrandsError(err instanceof Error ? err.message : 'Failed to load brands');
          setBrandOptions([]);
        }
      } finally {
        if (isMounted) {
          setBrandsLoading(false);
        }
      }
    };

    void loadBrands();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleConnect = async (brandId?: string) => {
    const result = await connectMutation.mutateAsync(brandId);
    if (result?.redirectUrl) {
      window.location.href = result.redirectUrl;
    }
  };

  const selectedBrandForConnect =
    selectedBrandId === UNASSIGNED_BRAND_VALUE ? undefined : selectedBrandId;

  return (
    <div className="space-y-8">
      <PageHeader
        title="RingCentral Settings"
        description="Manage connected extensions, click-to-call defaults, and live telephony webhook sync."
        action={
          <Button onClick={() => setConnectModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Connect RingCentral
          </Button>
        }
      />

      {connectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 space-y-4 rounded-2xl border border-white/10 bg-black/90 p-6 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Connect RingCentral</h3>
              <p className="text-sm text-muted-foreground">
                Optionally assign this extension to a brand so later click-to-call flows can pick the right default line.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Brand Routing
              </label>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger className="w-full border-white/10 bg-white/5">
                  <SelectValue placeholder={brandsLoading ? 'Loading brands...' : 'No brand selected'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_BRAND_VALUE}>No brand</SelectItem>
                  {brandOptions.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {brandsError && <p className="text-xs text-red-300">{brandsError}</p>}
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <div className="flex items-center gap-2 text-cyan-200">
                <ShieldCheck className="h-4 w-4" />
                <p className="text-sm font-medium">Phase 3 scope</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-cyan-100/80">
                This flow now covers auth, calling, webhook subscriptions, entity-linked SMS threads, and in-CRM call notes.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConnectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => void handleConnect(selectedBrandForConnect)}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Redirecting...' : 'Connect'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Connected Extensions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canViewOrgConnections
              ? 'Showing all RingCentral extensions connected in your organization.'
              : 'Showing only the RingCentral extensions assigned to you.'}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((index) => (
              <div key={index} className="h-28 rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : isError ? (
          <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-300">
                Failed to load RingCentral connections
              </p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Please try again.'}
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : !connections || connections.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center">
            <Wifi className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No RingCentral extensions connected yet.
            </p>
            <Button className="mt-4" onClick={() => setConnectModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Connect your first extension
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((connection) => (
              <RingCentralConnectionCard
                key={connection.id}
                connection={connection}
                brandName={connection.brandId ? brandNameById.get(connection.brandId) : undefined}
                disconnectConfirm={disconnectConfirmId === connection.id}
                disconnecting={
                  disconnectMutation.isPending && disconnectConfirmId === connection.id
                }
                isDefaultPending={defaultMutation.isPending && defaultMutation.variables === connection.id}
                isSyncPending={syncWebhookMutation.isPending && syncWebhookMutation.variables === connection.id}
                onSetDefault={() => defaultMutation.mutate(connection.id)}
                onSyncLiveEvents={() => syncWebhookMutation.mutate(connection.id)}
                onReconnect={() => void handleConnect(connection.brandId)}
                onDisconnect={() => setDisconnectConfirmId(connection.id)}
                onCancelDisconnect={() => setDisconnectConfirmId(null)}
                onConfirmDisconnect={async () => {
                  await disconnectMutation.mutateAsync(connection.id);
                  setDisconnectConfirmId(null);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RingCentralConnectionCard({
  connection,
  brandName,
  disconnectConfirm,
  disconnecting,
  isDefaultPending,
  isSyncPending,
  onSetDefault,
  onSyncLiveEvents,
  onReconnect,
  onDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
}: {
  connection: RingCentralConnection;
  brandName?: string;
  disconnectConfirm: boolean;
  disconnecting: boolean;
  isDefaultPending: boolean;
  isSyncPending: boolean;
  onSetDefault: () => void;
  onSyncLiveEvents: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => Promise<void>;
}) {
  const statusTone =
    connection.connectionState?.status === 'error'
      ? 'border-red-500/25 bg-red-500/5'
      : connection.connectionState?.status === 'reauthorization_required'
        ? 'border-amber-500/25 bg-amber-500/5'
        : 'border-emerald-500/20 bg-emerald-500/5';

  const statusLabel =
    connection.connectionState?.status === 'error'
      ? 'Needs attention'
      : connection.connectionState?.status === 'reauthorization_required'
        ? 'Reconnect required'
        : 'Connected';

  const tokenExpiry = connection.tokenExpiresAt
    ? new Date(connection.tokenExpiresAt).toLocaleString()
    : null;
  const webhookExpiry = connection.webhookState?.expiresAt
    ? new Date(connection.webhookState.expiresAt).toLocaleString()
    : null;
  const lastWebhookEventAt = connection.webhookState?.lastEventAt
    ? new Date(connection.webhookState.lastEventAt).toLocaleString()
    : null;
  const liveEventsLabel =
    connection.webhookState?.status === 'active'
      ? 'Live'
      : connection.webhookState?.status === 'pending'
        ? 'Provisioning'
        : connection.webhookState?.status === 'expiring'
          ? 'Renewal due'
          : connection.webhookState?.status === 'expired'
            ? 'Expired'
            : connection.webhookState?.status === 'error'
              ? 'Needs attention'
              : 'Not enabled';

  return (
    <div className={cn('space-y-4 rounded-2xl border p-5', statusTone)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {connection.displayName || connection.email || `Extension ${connection.extensionId}`}
            </h3>
            {connection.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                <Star className="h-3.5 w-3.5" /> Default
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> {statusLabel}
            </span>
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <p>
              <span className="text-foreground">Email:</span> {connection.email ?? 'Not available'}
            </p>
            <p>
              <span className="text-foreground">Extension:</span> {connection.extensionNumber ?? connection.extensionId}
            </p>
            <p>
              <span className="text-foreground">Brand:</span> {brandName ?? 'Not assigned'}
            </p>
            <p>
              <span className="text-foreground">Default line:</span> {connection.defaultOutboundPhoneNumber ?? connection.mainPhoneNumber ?? 'Not available'}
            </p>
            {tokenExpiry && (
              <p className="md:col-span-2">
                <span className="text-foreground">Token expiry:</span> {tokenExpiry}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!connection.isDefault && (
            <Button variant="outline" onClick={onSetDefault} disabled={isDefaultPending}>
              {isDefaultPending ? 'Saving...' : 'Make Default'}
            </Button>
          )}
          <Button variant="outline" onClick={onSyncLiveEvents} disabled={isSyncPending}>
            <Wifi className="mr-2 h-3.5 w-3.5" />
            {isSyncPending ? 'Syncing...' : 'Sync Live Events'}
          </Button>
          <Button variant="outline" onClick={onReconnect}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reconnect
          </Button>
          {!disconnectConfirm ? (
            <Button
              variant="outline"
              className="border-red-500/30 text-red-300 hover:bg-red-500/10"
              onClick={onDisconnect}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancelDisconnect}>
                Cancel
              </Button>
              <Button
                className="bg-red-500 text-white hover:bg-red-500/90"
                onClick={() => void onConfirmDisconnect()}
                disabled={disconnecting}
              >
                {disconnecting ? 'Disconnecting...' : 'Confirm'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoPanel
          icon={<Phone className="h-4 w-4" />}
          title="Direct Numbers"
          values={connection.directPhoneNumbers}
          emptyLabel="No extension numbers returned yet."
        />
        <InfoPanel
          icon={<MessageSquare className="h-4 w-4" />}
          title="SMS Sender Numbers"
          values={connection.smsSenderPhoneNumbers}
          emptyLabel="No SMS-enabled numbers detected yet."
        />
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4" />
            Connection Health
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {connection.connectionState?.lastError
              ? connection.connectionState.lastError
              : 'OAuth is connected. Use live-event sync to provision or renew the webhook subscription for realtime telephony updates.'}
          </p>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="text-foreground">Live events:</span> {liveEventsLabel}
            </p>
            {webhookExpiry ? (
              <p>
                <span className="text-foreground">Webhook expiry:</span> {webhookExpiry}
              </p>
            ) : null}
            {lastWebhookEventAt ? (
              <p>
                <span className="text-foreground">Last webhook event:</span> {lastWebhookEventAt}
              </p>
            ) : null}
            {connection.webhookState?.lastError ? (
              <p className="text-red-300">{connection.webhookState.lastError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({
  icon,
  title,
  values,
  emptyLabel,
}: {
  icon: ReactNode;
  title: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
