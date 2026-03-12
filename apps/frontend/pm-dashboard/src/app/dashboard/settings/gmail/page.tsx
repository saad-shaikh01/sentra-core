'use client';

import { Suspense, useState } from 'react';
import { CheckCircle2, AlertCircle, Clock, Wifi, Star, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useDisconnectIdentity, useIdentities, useInitiateOAuth } from '@/hooks/use-comm';
import { useUIStore } from '@/stores/ui-store';
import { timeAgo } from '@/lib/format-date';
import type { CommIdentity } from '@/types/comm.types';

export default function GmailSettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <GmailSettingsPage />
    </Suspense>
  );
}

function GmailSettingsPage() {
  const disconnectMutation = useDisconnectIdentity();
  const oauthMutation = useInitiateOAuth();
  const { data: identities, isLoading } = useIdentities();
  const commSyncProgress = useUIStore((s) => s.commSyncProgress);
  const commIdentityErrors = useUIStore((s) => s.commIdentityErrors);
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null);

  const handleDisconnect = async (id: string) => {
    await disconnectMutation.mutateAsync(id);
    setDisconnectConfirmId(null);
  };

  const handleReconnect = async (brandId?: string) => {
    const result = await oauthMutation.mutateAsync(brandId ?? '');
    if (result?.redirectUrl) {
      window.location.href = result.redirectUrl;
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gmail Accounts"
        description="View connected Gmail accounts and manage reconnects or disconnects."
      />

      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Connected Accounts</h2>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-white/5 rounded-2xl" />
            ))}
          </div>
        ) : !identities || identities.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-white/10 bg-white/[0.02]">
            <Wifi className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No Gmail accounts connected yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Ask an admin to connect a Gmail account.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {identities.map((identity: CommIdentity) => (
              <IdentityCard
                key={identity.id}
                identity={identity}
                syncProgress={commSyncProgress[identity.id]}
                wsError={commIdentityErrors[identity.id]}
                disconnectConfirm={disconnectConfirmId === identity.id}
                disconnecting={disconnectMutation.isPending && disconnectConfirmId === identity.id}
                onDisconnect={() => setDisconnectConfirmId(identity.id)}
                onCancelDisconnect={() => setDisconnectConfirmId(null)}
                onConfirmDisconnect={() => void handleDisconnect(identity.id)}
                onReconnect={() => void handleReconnect(identity.brandId)}
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
  syncProgress,
  wsError,
  disconnectConfirm,
  disconnecting,
  onDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
  onReconnect,
}: {
  identity: CommIdentity;
  syncProgress?: { synced: number; total: number };
  wsError?: string;
  disconnectConfirm: boolean;
  disconnecting: boolean;
  onDisconnect: () => void;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => void;
  onReconnect: () => void;
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
        <SyncStatusBadge status={status} />
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
              {wsError || identity.syncState.lastError || 'Token expired — reconnect required'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 shrink-0"
            onClick={onReconnect}
          >
            Reconnect
          </Button>
        </div>
      )}

      {lastSyncAt && (
        <p className="text-[10px] text-muted-foreground/60">
          Last synced {timeAgo(lastSyncAt)}
        </p>
      )}

      {identity.sendAsAliases && identity.sendAsAliases.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Send-as aliases</p>
          <div className="flex flex-wrap gap-1.5">
            {identity.sendAsAliases.map((alias) => (
              <span
                key={alias.email}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/5 border border-white/10 text-muted-foreground"
              >
                {alias.name ? `${alias.name} <${alias.email}>` : alias.email}
                {alias.isDefault && <Star className="h-2.5 w-2.5 text-amber-400" />}
              </span>
            ))}
          </div>
        </div>
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
        <div className="flex items-center justify-end pt-1">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={onDisconnect}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
