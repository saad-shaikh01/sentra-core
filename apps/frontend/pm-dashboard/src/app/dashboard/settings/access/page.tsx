'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, type AppBundleInput } from '@/lib/api';

const APPS = [
  { code: 'SALES_DASHBOARD', label: 'Sales Dashboard' },
  { code: 'PM_DASHBOARD', label: 'PM Dashboard' },
] as const;

export default function AccessConsolePage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [selectedApps, setSelectedApps] = useState<AppBundleInput['appCode'][]>(['PM_DASHBOARD']);
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [mailStatus, setMailStatus] = useState<'SENT' | 'FAILED' | ''>('');

  const invitationsQuery = useQuery({
    queryKey: ['iam', 'invitations'],
    queryFn: () => api.getIamInvitations(),
  });

  const createInvite = useMutation({
    mutationFn: () =>
      api.sendIamInvitation({
        email,
        appBundles: selectedApps.map((appCode) => ({ appCode })),
      }),
    onSuccess: (res: any) => {
      if (res?.inviteLink) {
        setLastInviteLink(res.inviteLink);
      }
      setMailStatus(res?.emailDelivery === 'FAILED' ? 'FAILED' : 'SENT');
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['iam', 'invitations'] });
    },
  });

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api.cancelIamInvitation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['iam', 'invitations'] }),
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.resendIamInvitation(id),
    onSuccess: (res: any) => {
      if (res?.inviteLink) {
        setLastInviteLink(res.inviteLink);
      }
      setMailStatus(res?.emailDelivery === 'FAILED' ? 'FAILED' : 'SENT');
      queryClient.invalidateQueries({ queryKey: ['iam', 'invitations'] });
    },
  });

  const invitationRows = invitationsQuery.data ?? [];
  const selectedCount = useMemo(() => selectedApps.length, [selectedApps]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Access Console</CardTitle>
          <CardDescription>Invite users with multi-app access bundles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">User Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>App Access Bundle</Label>
            <div className="flex flex-wrap gap-2">
              {APPS.map((app) => {
                const checked = selectedApps.includes(app.code);
                return (
                  <button
                    key={app.code}
                    type="button"
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      checked
                        ? 'bg-primary/20 border-primary/30 text-primary'
                        : 'bg-background border-border text-muted-foreground'
                    }`}
                    onClick={() => {
                      setSelectedApps((prev) =>
                        prev.includes(app.code)
                          ? prev.filter((v) => v !== app.code)
                          : [...prev, app.code],
                      );
                    }}
                  >
                    {app.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={() => createInvite.mutate()}
            disabled={createInvite.isPending || !email || selectedCount === 0}
          >
            {createInvite.isPending ? 'Sending...' : 'Send Invitation'}
          </Button>

          {lastInviteLink && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label>Invite Link (Manual Share)</Label>
              {mailStatus === 'FAILED' && (
                <p className="text-xs text-amber-500">
                  Email delivery failed. Share this link manually.
                </p>
              )}
              <div className="flex gap-2">
                <Input value={lastInviteLink} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lastInviteLink);
                    } catch {
                      // no-op for unsupported clipboard environments
                    }
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>Track pending and sent invitations.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitationsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading invitations...</p>
          ) : invitationRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          ) : (
            <div className="space-y-3">
              {invitationRows.map((inv: any) => (
                <div key={inv.id} className="p-3 rounded-lg border border-border flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{inv.email}</p>
                    <div className="flex flex-wrap gap-1">
                      {(inv.bundles ?? []).map((b: any) => (
                        <Badge key={`${inv.id}-${b.appCode}`} variant="outline">
                          {String(b.appCode).replace('_DASHBOARD', '')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendInvite.mutate(inv.id)}
                      disabled={resendInvite.isPending}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelInvite.mutate(inv.id)}
                      disabled={cancelInvite.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
