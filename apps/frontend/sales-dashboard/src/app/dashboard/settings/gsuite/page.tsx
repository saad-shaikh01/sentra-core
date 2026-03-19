'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  Unlink,
  UserPlus,
  RefreshCw,
  Shield,
  Mail,
  ChevronRight,
  Search,
} from 'lucide-react';
import { UserRole } from '@sentra-core/types';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  useGSuiteConnection,
  useGSuiteUsers,
  useInitiateGSuiteOAuth,
  useDisconnectGSuite,
  useInviteUser,
} from '@/hooks/use-comm';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { gsuiteKeys } from '@/hooks/use-comm';
import type { GSuiteDirectoryUser } from '@/lib/api';

export default function GSuiteSettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <GSuiteSettingsPage />
    </Suspense>
  );
}

function GSuiteSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const isAdminOrOwner = user?.role === UserRole.OWNER || user?.role === UserRole.ADMIN;

  const { data: connection, isLoading: connectionLoading } = useGSuiteConnection();
  const isConnected = connection?.connected === true;

  const gsuiteUsersQuery = useGSuiteUsers();
  const oauthMutation = useInitiateGSuiteOAuth();
  const disconnectMutation = useDisconnectGSuite();
  const inviteMutation = useInviteUser();

  const [search, setSearch] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Handle OAuth return
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success === '1') {
      toast.success('G Suite connected successfully');
      queryClient.invalidateQueries({ queryKey: gsuiteKeys.connection() });
    } else if (error) {
      toast.error('Failed to connect G Suite', decodeURIComponent(error));
    }
  }, [searchParams, queryClient]);

  // Auto-load users once connected
  const [usersFetched, setUsersFetched] = useState(false);
  async function fetchUsers() {
    if (loadingUsers || usersFetched) return;
    setLoadingUsers(true);
    try {
      await queryClient.fetchQuery({
        queryKey: gsuiteKeys.users(),
        queryFn: () => import('@/lib/api').then((m) => m.api.listGSuiteUsers()),
      });
      setUsersFetched(true);
    } catch (e) {
      toast.error('Failed to load G Suite users', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingUsers(false);
    }
  }

  const gsuiteUsers: GSuiteDirectoryUser[] =
    (queryClient.getQueryData(gsuiteKeys.users()) as { users: GSuiteDirectoryUser[] } | undefined)
      ?.users ?? [];

  const filteredUsers = gsuiteUsers.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleInvite(u: GSuiteDirectoryUser) {
    try {
      await inviteMutation.mutateAsync({ email: u.email, role: UserRole.FRONTSELL_AGENT });
      setInvitedEmails((prev) => new Set([...prev, u.email]));
      toast.success(`Invitation sent to ${u.email}`);
    } catch {
      // error toast handled by hook
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="G Suite Integration"
        description="Connect your Google Workspace to import team members and manage org-level email access."
      />

      {/* Connection card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Google Workspace</p>
              {connectionLoading ? (
                <p className="text-xs text-muted-foreground">Checking connection…</p>
              ) : isConnected ? (
                <p className="text-xs text-muted-foreground">
                  {connection.adminEmail} &middot; {connection.domain}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Not connected</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <>
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
                {isAdminOrOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 gap-1.5"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                )}
              </>
            ) : (
              isAdminOrOwner && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => oauthMutation.mutate()}
                  disabled={oauthMutation.isPending}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Connect G Suite
                </Button>
              )
            )}
          </div>
        </div>

        {/* How it works */}
        {!isConnected && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How it works</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Shield, label: 'Admin connects', desc: 'Sign in with a Google Workspace admin account' },
                { icon: Users, label: 'View directory', desc: 'See all users in your G Suite domain' },
                { icon: Mail, label: 'Import to CRM', desc: 'Send invitations to selected team members' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex gap-2.5 rounded-lg border p-3 bg-muted/30">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Directory users */}
      {isConnected && isAdminOrOwner && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="font-semibold text-sm">G Suite Directory</p>
              {gsuiteUsers.length > 0 && (
                <Badge variant="secondary" className="text-xs">{gsuiteUsers.length} users</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => { setUsersFetched(false); fetchUsers(); }}
                disabled={loadingUsers}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                {loadingUsers ? 'Loading…' : gsuiteUsers.length > 0 ? 'Refresh' : 'Load Users'}
              </Button>
            </div>
          </div>

          {gsuiteUsers.length === 0 && !loadingUsers && (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <Users className="h-8 w-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm font-medium">No users loaded</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Click &ldquo;Load Users&rdquo; to fetch your G Suite directory
              </p>
              <Button size="sm" className="gap-1.5" onClick={fetchUsers}>
                <Users className="h-3.5 w-3.5" />
                Load Users
              </Button>
            </div>
          )}

          {gsuiteUsers.length > 0 && (
            <>
              <div className="px-5 py-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
              </div>

              <div className="divide-y max-h-[480px] overflow-y-auto">
                {filteredUsers.map((u) => {
                  const invited = invitedEmails.has(u.email);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {u.photoUrl ? (
                           
                          <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {(u.firstName?.[0] ?? u.email[0]).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Shield className="h-2.5 w-2.5" />
                            Admin
                          </Badge>
                        )}
                        {u.isSuspended && (
                          <Badge variant="secondary" className="text-xs text-orange-600 bg-orange-50 border-orange-200">
                            Suspended
                          </Badge>
                        )}

                        {invited ? (
                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200 gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Invited
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={u.isSuspended || inviteMutation.isPending}
                            onClick={() => handleInvite(u)}
                          >
                            <UserPlus className="h-3 w-3" />
                            Invite
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No users match &ldquo;{search}&rdquo;</p>
                  </div>
                )}
              </div>

              {/* Footer note */}
              <div className="px-5 py-3 border-t bg-muted/20 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Invited users will receive an email to set up their account. They can then connect their Gmail from{' '}
                  <a href="/dashboard/settings/gmail" className="underline underline-offset-2">
                    Gmail Settings
                  </a>.
                </p>
                <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Non-admin info */}
      {!isAdminOrOwner && (
        <div className="rounded-xl border bg-muted/30 p-5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Only organization Owners and Admins can connect and manage G Suite integration.
          </p>
        </div>
      )}
    </div>
  );
}
