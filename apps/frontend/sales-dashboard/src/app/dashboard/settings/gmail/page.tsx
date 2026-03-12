'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, CheckCircle2, AlertCircle, Clock, Wifi, Trash2, Star } from 'lucide-react';
import { UserRole } from '@sentra-core/types';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useIdentities, useDisconnectIdentity, useInitiateOAuth } from '@/hooks/use-comm';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { commKeys } from '@/hooks/use-comm';
import { timeAgo } from '@/lib/format-date';
import { useUIStore } from '@/stores/ui-store';
import type { CommIdentity } from '@/types/comm.types';

type OAuthBrandOption = {
  id: string;
  name: string;
};

export default function GmailSettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <GmailSettingsPage />
    </Suspense>
  );
}

function GmailSettingsPage() {
  const { user } = useAuth();
  const { data: identities, isLoading, isError, error, refetch } = useIdentities();
  const disconnectMutation = useDisconnectIdentity();
  const oauthMutation = useInitiateOAuth();
  const queryClient = useQueryClient();
  const commSyncProgress = useUIStore((s) => s.commSyncProgress);
  const commIdentityErrors = useUIStore((s) => s.commIdentityErrors);

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null);
  const [brandOptions, setBrandOptions] = useState<OAuthBrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const canViewOrgIdentities = user?.role === UserRole.OWNER || user?.role === UserRole.ADMIN;

  // Handle OAuth return
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success === '1') {
      toast.success('Gmail connected successfully');
      queryClient.invalidateQueries({ queryKey: commKeys.identities() });
    } else if (error) {
      toast.error('Failed to connect Gmail', decodeURIComponent(error));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBrands = async () => {
      try {
        setBrandsLoading(true);
        setBrandsError(null);
        const response = await api.fetch<{ data?: OAuthBrandOption[] }>('/identities/oauth/brands', {
          service: 'comm',
        });
        if (isMounted) {
          setBrandOptions(response.data ?? []);
        }
      } catch (e) {
        if (isMounted) {
          setBrandsError(e instanceof Error ? e.message : 'Failed to load brands');
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

  const handleConnect = async () => {
    if (!selectedBrandId) return;
    const result = await oauthMutation.mutateAsync(selectedBrandId);
    if (result?.redirectUrl) {
      window.location.href = result.redirectUrl;
    }
  };

  const handleReconnect = async (brandId?: string) => {
    const result = await oauthMutation.mutateAsync(brandId);
    if (result?.redirectUrl) {
      window.location.href = result.redirectUrl;
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.setDefaultIdentity(id);
      queryClient.invalidateQueries({ queryKey: commKeys.identities() });
      toast.success('Default account updated');
    } catch (e: any) {
      toast.error('Failed to update default', e.message);
    }
  };

  const handleDisconnect = async (id: string) => {
    await disconnectMutation.mutateAsync(id);
    setDisconnectConfirmId(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gmail Settings"
        description="Manage connected Gmail accounts for email sync."
        action={
          <Button onClick={() => setConnectModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Connect Gmail
          </Button>
        }
      />

      {/* Connect modal */}
      {connectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black/90 border border-white/10 rounded-2xl p-6 w-96 shadow-2xl space-y-4">
            <h3 className="text-lg font-semibold">Connect Gmail Account</h3>
            <p className="text-sm text-muted-foreground">Select which brand this Gmail account belongs to.</p>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</label>
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-white/30"
                disabled={brandsLoading || brandOptions.length === 0}
              >
                <option value="">
                  {brandsLoading ? 'Loading brands...' : 'Select a brand'}
                </option>
                {brandOptions.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              {brandsError && (
                <p className="text-xs text-red-300">{brandsError}</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setConnectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 shadow-lg shadow-primary/20"
                onClick={handleConnect}
                disabled={!selectedBrandId || oauthMutation.isPending || brandsLoading}
              >
                {oauthMutation.isPending ? 'Redirecting...' : 'Connect Gmail'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Connected accounts */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Connected Accounts</h2>
        <p className="text-sm text-muted-foreground">
          {canViewOrgIdentities
            ? 'Showing all Gmail identities connected in your organization.'
            : 'Showing only the Gmail identities assigned to you.'}
        </p>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-white/5 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 px-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-center space-y-4">
            <AlertCircle className="h-8 w-8 mx-auto text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-300">Failed to load Gmail identities</p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Please try again.'}
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : !identities || identities.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-white/10 bg-white/[0.02]">
            <Wifi className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No Gmail accounts connected yet.</p>
            <Button className="mt-4" onClick={() => setConnectModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Connect your first account
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {identities.map((identity: CommIdentity) => (
              <IdentityCard
                key={identity.id}
                identity={identity}
                onSetDefault={() => handleSetDefault(identity.id)}
                onDisconnect={() => setDisconnectConfirmId(identity.id)}
                onReconnect={() => void handleReconnect(identity.brandId)}
                disconnectConfirm={disconnectConfirmId === identity.id}
                onCancelDisconnect={() => setDisconnectConfirmId(null)}
                onConfirmDisconnect={() => handleDisconnect(identity.id)}
                disconnecting={disconnectMutation.isPending && disconnectConfirmId === identity.id}
                syncProgress={commSyncProgress[identity.id]}
                wsError={commIdentityErrors[identity.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SyncStatusBadge({ status }: { status: 'active' | 'error' | 'paused' }) {
  if (status === 'active') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="h-3 w-3" /> Active
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400 border border-red-500/20">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="h-3 w-3" /> Paused
    </span>
  );
}

function IdentityCard({
  identity,
  onSetDefault,
  onDisconnect,
  onReconnect,
  disconnectConfirm,
  onCancelDisconnect,
  onConfirmDisconnect,
  disconnecting,
  syncProgress,
  wsError,
}: {
  identity: CommIdentity;
  onSetDefault: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  disconnectConfirm: boolean;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => void;
  disconnecting: boolean;
  syncProgress?: { synced: number; total: number };
  wsError?: string;
}) {
  const status = identity.syncState.status;
  const lastSyncAt = identity.syncState.lastSyncAt;

  return (
    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {identity.email[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{identity.displayName || identity.email}</p>
              {identity.isDefault && (
                <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{identity.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SyncStatusBadge status={status} />
        </div>
      </div>

      {syncProgress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Syncing messages...</span>
            <span>{syncProgress.synced.toLocaleString()} / {syncProgress.total.toLocaleString()}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, (syncProgress.synced / syncProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {(status === 'error' || wsError) && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-300">
              This account has an error: {wsError || identity.syncState.lastError || 'Token expired — reconnect required'}
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 shrink-0" onClick={onReconnect}>
            Reconnect
          </Button>
        </div>
      )}

      {lastSyncAt && (
        <p className="text-[10px] text-muted-foreground/60">
          Last synced {timeAgo(lastSyncAt)}
        </p>
      )}

      {disconnectConfirm ? (
        <div className="flex items-center gap-2 pt-1">
          <p className="text-xs text-muted-foreground flex-1">Disconnect this account?</p>
          <Button size="sm" variant="outline" onClick={onCancelDisconnect}>Cancel</Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={onConfirmDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {!identity.isDefault && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onSetDefault}>
              <Star className="h-3 w-3 mr-1" /> Set as Default
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-red-500/30 text-red-400 hover:bg-red-500/10 ml-auto"
            onClick={onDisconnect}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
