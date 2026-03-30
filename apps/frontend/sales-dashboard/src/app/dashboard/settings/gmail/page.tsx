'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, CheckCircle2, AlertCircle, Clock, Wifi, Trash2, Star, RefreshCw, MailOpen, Bell } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIdentities, useDisconnectIdentity, useInitiateOAuth, useCommSettings, useUpdateCommSettings, useRunCommIntelligenceBackfill, useCommMaintenanceJob } from '@/hooks/use-comm';
import { usePermissions } from '@/hooks/use-permissions';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { commKeys } from '@/hooks/use-comm';
import { timeAgo } from '@/lib/format-date';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import type { CommIdentity, CommSettings, UpdateCommSettingsDto } from '@/types/comm.types';

type OAuthBrandOption = {
  id: string;
  name: string;
};

function toSettingsDraft(settings?: CommSettings | null): UpdateCommSettingsDto | null {
  if (!settings) {
    return null;
  }

  return {
    trackingEnabled: settings.trackingEnabled,
    openTrackingEnabled: settings.openTrackingEnabled,
    allowPerMessageTrackingToggle: settings.allowPerMessageTrackingToggle,
    ghostedAfterDays: settings.ghostedAfterDays,
    silenceSensitivity: settings.silenceSensitivity,
    engagementSensitivity: settings.engagementSensitivity,
    inAppAlertsEnabled: settings.inAppAlertsEnabled,
    emailAlertsEnabled: settings.emailAlertsEnabled,
    multipleOpenAlertsEnabled: settings.multipleOpenAlertsEnabled,
    multipleOpenThreshold: settings.multipleOpenThreshold,
    hotLeadAlertsEnabled: settings.hotLeadAlertsEnabled,
    overdueAlertsEnabled: settings.overdueAlertsEnabled,
  };
}

export default function GmailSettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <GmailSettingsPage />
    </Suspense>
  );
}

function GmailSettingsPage() {
  const { hasPermission } = usePermissions();
  const { data: identities, isLoading, isError, error, refetch } = useIdentities();
  const disconnectMutation = useDisconnectIdentity();
  const oauthMutation = useInitiateOAuth();
  const { data: commSettings } = useCommSettings();
  const updateSettings = useUpdateCommSettings();
  const runBackfill = useRunCommIntelligenceBackfill();
  const queryClient = useQueryClient();
  const commSyncProgress = useUIStore((s) => s.commSyncProgress);
  const commIdentityErrors = useUIStore((s) => s.commIdentityErrors);

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [disconnectConfirmId, setDisconnectConfirmId] = useState<string | null>(null);
  const [brandOptions, setBrandOptions] = useState<OAuthBrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<UpdateCommSettingsDto | null>(null);
  const [lastBackfillJobId, setLastBackfillJobId] = useState<string | null>(null);
  const { data: lastBackfillJob } = useCommMaintenanceJob(lastBackfillJobId ?? undefined, Boolean(lastBackfillJobId));

  const searchParams = useSearchParams();
  const canViewOrgIdentities = hasPermission('sales:settings:view');

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

  useEffect(() => {
    if (commSettings) {
      setSettingsDraft(toSettingsDraft(commSettings));
    }
  }, [commSettings]);

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to update default', message);
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
              <Select
                value={selectedBrandId}
                onValueChange={setSelectedBrandId}
                disabled={brandsLoading || brandOptions.length === 0}
              >
                <SelectTrigger className="w-full bg-white/5 border-white/10">
                  <SelectValue placeholder={brandsLoading ? 'Loading brands...' : 'Select a brand'} />
                </SelectTrigger>
                <SelectContent>
                  {brandOptions.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <EmailIntelligenceSettingsCard
        settings={settingsDraft ?? commSettings}
        canManage={hasPermission('sales:settings:view')}
        isSaving={updateSettings.isPending}
        saveError={updateSettings.error instanceof Error ? updateSettings.error.message : null}
        onChange={(patch) =>
          setSettingsDraft((current) => ({
            ...(current ?? toSettingsDraft(commSettings) ?? {}),
            ...patch,
          }))
        }
        onSave={async () => {
          if (!settingsDraft) {
            return;
          }
          await updateSettings.mutateAsync(settingsDraft);
        }}
        onReset={() => setSettingsDraft(toSettingsDraft(commSettings))}
        onRunBackfill={async () => {
          const job = await runBackfill.mutateAsync({ batchSize: 100 });
          setLastBackfillJobId(job.id);
        }}
        backfillJob={lastBackfillJob}
        isBackfillRunning={runBackfill.isPending}
      />
    </div>
  );
}

function SettingCheckbox({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label className={cn('flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3', disabled && 'opacity-70')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary"
      />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

function EmailIntelligenceSettingsCard({
  settings,
  canManage,
  isSaving,
  saveError,
  onChange,
  onSave,
  onReset,
  onRunBackfill,
  backfillJob,
  isBackfillRunning,
}: {
  settings?: UpdateCommSettingsDto & Partial<CommSettings>;
  canManage: boolean;
  isSaving: boolean;
  saveError: string | null;
  onChange: (patch: UpdateCommSettingsDto) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
  onRunBackfill: () => Promise<void>;
  backfillJob?: { state?: string; progress?: Record<string, unknown>; finishedOn?: string; failedReason?: string; returnvalue?: Record<string, unknown> };
  isBackfillRunning: boolean;
}) {
  const ghostedAfterDays = settings?.ghostedAfterDays ?? 7;
  const progress = backfillJob?.progress as { processed?: number; total?: number } | undefined;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Email Intelligence</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control estimated open tracking, follow-up thresholds, alerts, and repair tools.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <SettingCheckbox
              label="Tracking enabled"
              description="Keeps the tracking layer active for new sends. Gmail mailbox sync still continues."
              checked={settings?.trackingEnabled ?? true}
              disabled={!canManage}
              onChange={(trackingEnabled) => onChange({ trackingEnabled })}
            />
            <SettingCheckbox
              label="Estimated open tracking"
              description="Injects a pixel into HTML emails only. Open signals remain estimated."
              checked={settings?.openTrackingEnabled ?? true}
              disabled={!canManage || !(settings?.trackingEnabled ?? true)}
              onChange={(openTrackingEnabled) => onChange({ openTrackingEnabled })}
            />
            <SettingCheckbox
              label="Per-send tracking toggle"
              description="Lets senders disable estimated open tracking on individual emails."
              checked={settings?.allowPerMessageTrackingToggle ?? true}
              disabled={!canManage || !(settings?.trackingEnabled ?? true)}
              onChange={(allowPerMessageTrackingToggle) => onChange({ allowPerMessageTrackingToggle })}
            />
            <SettingCheckbox
              label="In-app alerts"
              description="Show hot lead, repeated-open, and overdue follow-up alerts inside the inbox."
              checked={settings?.inAppAlertsEnabled ?? true}
              disabled={!canManage || !(settings?.trackingEnabled ?? true)}
              onChange={(inAppAlertsEnabled) => onChange({ inAppAlertsEnabled })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ghosted After</label>
              <Select
                value={String(ghostedAfterDays)}
                onValueChange={(value) => onChange({ ghostedAfterDays: Number(value) })}
                disabled={!canManage}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10, 14].map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Controls the Fresh → Waiting → Ghosted ladder.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Silence Sensitivity</label>
              <Select
                value={settings?.silenceSensitivity ?? 'medium'}
                onValueChange={(value) => onChange({ silenceSensitivity: value as CommSettings['silenceSensitivity'] })}
                disabled={!canManage}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">High sensitivity raises overdue signals sooner.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scoring Sensitivity</label>
              <Select
                value={settings?.engagementSensitivity ?? 'medium'}
                onValueChange={(value) => onChange({ engagementSensitivity: value as CommSettings['engagementSensitivity'] })}
                disabled={!canManage}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">High sensitivity flags warm threads faster.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-200">
              <MailOpen className="h-4 w-4" />
              <p className="text-sm font-medium">Tracking transparency</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
              Open tracking is estimated, not guaranteed human reading. Delivery badges do not confirm mailbox delivery.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void onSave()} disabled={!canManage || isSaving}>
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={!canManage || isSaving}>
              Reset
            </Button>
            {!canManage && (
              <p className="text-xs text-muted-foreground">Only admins can update organization-wide mail intelligence settings.</p>
            )}
          </div>
          {saveError && <p className="text-xs text-red-300">{saveError}</p>}
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Alert Rules</h3>
            <p className="mt-1 text-xs text-muted-foreground">In-app alerts stay conservative and deduplicated per thread.</p>
          </div>
          <div className="space-y-3">
            <SettingCheckbox
              label="Repeated-open alerts"
              description={`Notify when a tracked email reaches ${settings?.multipleOpenThreshold ?? 3}+ estimated opens in 24h.`}
              checked={settings?.multipleOpenAlertsEnabled ?? true}
              disabled={!canManage || !(settings?.inAppAlertsEnabled ?? true)}
              onChange={(multipleOpenAlertsEnabled) => onChange({ multipleOpenAlertsEnabled })}
            />
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Multiple-open threshold</label>
              <Select
                value={String(settings?.multipleOpenThreshold ?? 3)}
                onValueChange={(value) => onChange({ multipleOpenThreshold: Number(value) })}
                disabled={!canManage || !(settings?.multipleOpenAlertsEnabled ?? true)}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((threshold) => (
                    <SelectItem key={threshold} value={String(threshold)}>
                      {threshold} opens
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SettingCheckbox
              label="Hot lead alerts"
              description="Notify when a thread crosses the current engagement threshold."
              checked={settings?.hotLeadAlertsEnabled ?? true}
              disabled={!canManage || !(settings?.inAppAlertsEnabled ?? true)}
              onChange={(hotLeadAlertsEnabled) => onChange({ hotLeadAlertsEnabled })}
            />
            <SettingCheckbox
              label="Overdue follow-up alerts"
              description="Notify when current silence is longer than the expected reply window."
              checked={settings?.overdueAlertsEnabled ?? true}
              disabled={!canManage || !(settings?.inAppAlertsEnabled ?? true)}
              onChange={(overdueAlertsEnabled) => onChange({ overdueAlertsEnabled })}
            />
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-cyan-300" />
                <p className="text-sm font-medium text-foreground">Repair and Backfill</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Safely re-run thread intelligence and score derivation for existing threads in batches.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => void onRunBackfill()} disabled={!canManage || isBackfillRunning}>
                  {isBackfillRunning ? (
                    <>
                      <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Queueing...
                    </>
                  ) : (
                    'Rebuild Intelligence'
                  )}
                </Button>
                {backfillJob?.state && (
                  <span className="text-xs text-muted-foreground">
                    Status: {backfillJob.state}
                    {progress?.processed !== undefined && progress?.total !== undefined
                      ? ` · ${progress.processed}/${progress.total}`
                      : ''}
                  </span>
                )}
              </div>
              {backfillJob?.failedReason && (
                <p className="mt-2 text-xs text-red-300">{backfillJob.failedReason}</p>
              )}
              {backfillJob?.finishedOn && (
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Last completed {timeAgo(backfillJob.finishedOn)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
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
