'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DetailSheet, StatusBadge } from '@/components/shared';
import { EntityEmailTimeline } from '@/components/shared/comm/entity-email-timeline';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAddClientNote,
  useAssignClient,
  useClient,
  useGrantPortalAccess,
  useRevokePortalAccess,
} from '@/hooks/use-clients';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import { timeAgo } from '@/lib/format-date';
import { useUIStore } from '@/stores/ui-store';
import {
  ClientActivityType,
  hasMinimumRole,
  IClient,
  IClientActivity,
  IOrganizationMember,
  ISale,
  UserRole,
} from '@sentra-core/types';
import {
  AlertCircle,
  ClipboardList,
  DollarSign,
  Mail,
  MessageSquare,
  Shield,
  UserCheck,
} from 'lucide-react';
import { SaleFormModal } from '@/app/dashboard/sales/_components/sale-form-modal';
import { SaleType } from '@sentra-core/types';
import { LeadNoteEditor } from '@/app/dashboard/leads/_components/lead-note-editor';

interface ClientDetailSheetProps {
  clientId: string | null;
  onClose: () => void;
}

type ClientDetail = IClient & { sales?: ISale[]; activities?: IClientActivity[] };
type ClientTab = 'details' | 'discussion' | 'activity' | 'emails';

export function ClientDetailSheet({ clientId, onClose }: ClientDetailSheetProps) {
  const { data: client, isLoading, isError } = useClient(clientId ?? '');
  const { user } = useAuth();
  const { data: allMembers } = useMembers();
  const { data: upsellAgents } = useMembers(UserRole.UPSELL_AGENT);
  const { data: projectManagers } = useMembers(UserRole.PROJECT_MANAGER);
  const assignClient = useAssignClient();
  const addClientNote = useAddClientNote();
  const grantPortalAccess = useGrantPortalAccess();
  const revokePortalAccess = useRevokePortalAccess();
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);

  const [activeTab, setActiveTab] = useState<ClientTab>('details');
  const [saleModalOpen, setSaleModalOpen] = useState(false);

  useEffect(() => {
    setActiveTab('details');
  }, [clientId]);

  const detailClient = client as ClientDetail | undefined;
  const activities = detailClient?.activities ?? [];
  const discussionNotes = useMemo(
    () => activities.filter((activity) => activity.type === ClientActivityType.NOTE),
    [activities],
  );
  const auditActivities = useMemo(
    () => activities.filter((activity) => activity.type !== ClientActivityType.NOTE),
    [activities],
  );
  const sales = detailClient?.sales ?? [];

  const latestUpsellActivity = useMemo(
    () => activities.find((activity) => activity.type === ClientActivityType.UPSELL_ASSIGNED),
    [activities],
  );
  const latestProjectManagerActivity = useMemo(
    () => activities.find((activity) => activity.type === ClientActivityType.PM_ASSIGNED),
    [activities],
  );
  const latestPortalGrantActivity = useMemo(
    () => activities.find((activity) => activity.type === ClientActivityType.PORTAL_ACCESS_GRANTED),
    [activities],
  );

  const canManageClient = user?.role ? hasMinimumRole(user.role, UserRole.SALES_MANAGER) : false;
  const portalState = detailClient ? getPortalState(detailClient) : null;

  const handleAddNote = async (content: string, mentionedUserIds: string[]) => {
    if (!clientId) return;
    await addClientNote.mutateAsync({ id: clientId, content, mentionedUserIds });
  };

  const confirmPortalGrant = () => {
    if (!detailClient) {
      return;
    }

    openConfirmDialog({
      title: 'Grant Portal Access?',
      description: `Send a portal invitation to ${detailClient.email}?`,
      onConfirm: () => grantPortalAccess.mutate(detailClient.id),
    });
  };

  const confirmPortalRevoke = () => {
    if (!detailClient) {
      return;
    }

    openConfirmDialog({
      title: 'Revoke Portal Access?',
      description: `This will immediately disable portal login for ${detailClient.email}.`,
      onConfirm: () => revokePortalAccess.mutate(detailClient.id),
    });
  };

  return (
    <>
    <DetailSheet
      open={!!clientId}
      onClose={onClose}
      title={detailClient?.contactName ?? detailClient?.email ?? 'Client Details'}
      description={detailClient?.email}
      action={
        detailClient ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => setSaleModalOpen(true)}
          >
            <DollarSign className="h-3.5 w-3.5" /> New Sale
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-4 w-3/4 rounded bg-white/10" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Failed to load client details. Please try again.
          </p>
        </div>
      ) : detailClient ? (
        <>
          <div className="-mt-2 mb-2 flex border-b border-white/10 overflow-x-auto whitespace-nowrap no-scrollbar">
            {([
              { key: 'details', label: 'Details', icon: null },
              {
                key: 'discussion',
                label: 'Discussion',
                icon: <MessageSquare className="h-3.5 w-3.5" />,
              },
              {
                key: 'activity',
                label: 'Activity',
                icon: <ClipboardList className="h-3.5 w-3.5" />,
              },
              { key: 'emails', label: 'Emails', icon: <Mail className="h-3.5 w-3.5" /> },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'details' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoCard label="Contact" value={detailClient.contactName ?? '-'} />
                <InfoCard label="Email" value={detailClient.email} />
                <InfoCard label="Phone" value={detailClient.phone ?? '-'} />
                <InfoCard label="Status" value={<StatusBadge status={detailClient.status} />} />
                <InfoCard label="Portal" value={<PortalStatusBadge client={detailClient} />} />
                <InfoCard
                  label="Created"
                  value={formatExactDateTime(detailClient.createdAt)}
                />
                <InfoCard
                  label="Last Updated"
                  value={formatExactDateTime(detailClient.updatedAt)}
                />
              </div>

              {detailClient.address ? (
                <InfoCard label="Address" value={detailClient.address} />
              ) : null}

              {detailClient.notes ? <InfoCard label="Notes" value={detailClient.notes} /> : null}

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Team Assignments</h3>
                    <p className="text-xs text-muted-foreground">
                      Upsell and project-management ownership stay optional and fully tracked.
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
                    <UserCheck className="h-4 w-4" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <AssignmentPanel
                    label="Upsell Agent"
                    assignee={detailClient.upsellAgent}
                    assignedAt={latestUpsellActivity?.createdAt}
                    options={upsellAgents ?? []}
                    canManage={canManageClient}
                    isPending={assignClient.isPending}
                    onAssign={(value) =>
                      assignClient.mutate({
                        id: detailClient.id,
                        upsellAgentId: value,
                        projectManagerId: undefined,
                      })
                    }
                  />
                  <AssignmentPanel
                    label="Project Manager"
                    assignee={detailClient.projectManager}
                    assignedAt={latestProjectManagerActivity?.createdAt}
                    options={projectManagers ?? []}
                    canManage={canManageClient}
                    isPending={assignClient.isPending}
                    onAssign={(value) =>
                      assignClient.mutate({
                        id: detailClient.id,
                        projectManagerId: value,
                        upsellAgentId: undefined,
                      })
                    }
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Portal Access</h3>
                    <p className="text-xs text-muted-foreground">
                      Grant or revoke login access separately from the client record itself.
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard label="Access Status" value={portalState?.label ?? '-'} />
                  <InfoCard label="Verification" value={detailClient.emailVerified ? 'Verified' : 'Pending'} />
                  <InfoCard
                    label="Granted At"
                    value={detailClient.portalGrantedAt ? formatExactDateTime(detailClient.portalGrantedAt) : '-'}
                  />
                  <InfoCard
                    label="Granted By"
                    value={latestPortalGrantActivity?.user?.name ?? detailClient.portalGrantedBy ?? '-'}
                  />
                  <InfoCard
                    label="Password Setup"
                    value={detailClient.mustSetPassword ? 'Pending first login' : 'Completed'}
                  />
                  <InfoCard label="Portal Email" value={detailClient.email} />
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-sm font-medium">{portalState?.label ?? 'No Access'}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {portalState?.description ?? 'Portal access status is unavailable.'}
                  </p>
                </div>

                {canManageClient ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {detailClient.portalAccess ? (
                      <Button
                        variant="outline"
                        className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                        disabled={revokePortalAccess.isPending}
                        onClick={confirmPortalRevoke}
                      >
                        Revoke Access
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                        disabled={grantPortalAccess.isPending}
                        onClick={confirmPortalGrant}
                      >
                        Grant Portal Access
                      </Button>
                    )}
                  </div>
                ) : null}
              </section>

              {sales.length ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Linked Sales</h3>
                      <p className="text-xs text-muted-foreground">
                        Latest sales attached to this client record.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            ${sale.totalAmount} {sale.currency}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sale.description?.trim() || 'No sale description'}
                          </p>
                        </div>
                        <StatusBadge status={sale.status} />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'discussion' ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Discussion Notes</p>
                </div>
                <LeadNoteEditor
                  members={(allMembers ?? []).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? undefined }))}
                  onSubmit={handleAddNote}
                  isPending={addClientNote.isPending}
                  placeholder="Write a note… type @ to mention someone"
                />
              </section>

              {discussionNotes.length ? (
                <div className="space-y-3">
                  {discussionNotes.map((activity) => (
                    <ActivityCard key={activity.id} activity={activity} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No discussion yet"
                  description="Internal notes will appear here once your team starts the conversation."
                />
              )}
            </div>
          ) : null}

          {activeTab === 'activity' ? (
            auditActivities.length ? (
              <div className="space-y-3">
                {auditActivities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No activity yet"
                description="Assignments, portal access changes, and other system events will appear here."
              />
            )
          ) : null}

          {activeTab === 'emails' && clientId ? (
            <EntityEmailTimeline entityType="client" entityId={clientId} />
          ) : null}
        </>
      ) : null}
    </DetailSheet>

      {detailClient && (
        <SaleFormModal
          open={saleModalOpen}
          onOpenChange={setSaleModalOpen}
          prefillClientId={detailClient.id}
          prefillClientName={detailClient.contactName ?? detailClient.email}
          prefillBrandId={detailClient.brandId}
          prefillSaleType={SaleType.UPSELL}
          prefillSalesAgentId={detailClient.upsellAgentId ?? undefined}
        />
      )}
    </>
  );
}

function ActivityCard({ activity }: { activity: IClientActivity }) {
  const meta = formatClientActivity(activity);
  const actorName = activity.user?.name ?? 'Unknown User';
  const isNote = activity.type === ClientActivityType.NOTE;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isNote
          ? 'border-sky-500/20 bg-sky-500/[0.06]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ActorAvatar name={actorName} avatarUrl={activity.user?.avatarUrl} />
          <div>
            <p className="text-sm font-semibold">{actorName}</p>
            <p className="text-xs text-muted-foreground">
              {timeAgo(activity.createdAt)} - {formatExactDateTime(activity.createdAt)}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {meta.badge}
        </span>
      </div>

      <p className="text-sm font-medium leading-6 text-foreground">{meta.title}</p>
      {meta.description ? (
        meta.description.startsWith('<') ? (
          <div
            className="mt-2 text-sm leading-6 text-foreground/80 [&_em]:italic [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc [&_.mention]:cursor-default [&_.mention]:font-semibold [&_.mention]:text-primary"
            dangerouslySetInnerHTML={{ __html: meta.description }}
          />
        ) : (
          <p className="mt-2 text-sm leading-6 text-foreground/80">{meta.description}</p>
        )
      ) : null}

      {meta.details.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {meta.details.map((detail) => (
            <div key={`${detail.label}:${detail.value}`} className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {detail.label}
              </p>
              <p className="mt-1 text-sm text-foreground">{detail.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssignmentPanel({
  label,
  assignee,
  assignedAt,
  options,
  canManage,
  isPending,
  onAssign,
}: {
  label: string;
  assignee?: { id: string; name: string; avatarUrl?: string };
  assignedAt?: Date | string;
  options: IOrganizationMember[];
  canManage: boolean;
  isPending: boolean;
  onAssign: (value: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {assignee ? (
        <div className="mb-3 flex items-center gap-3">
          <ActorAvatar name={assignee.name} avatarUrl={assignee.avatarUrl} />
          <div>
            <p className="text-sm font-semibold">{assignee.name}</p>
            <p className="text-xs text-muted-foreground">
              Active{assignedAt ? ` - assigned ${timeAgo(assignedAt)}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Unassigned</p>
      )}

      {canManage ? (
        <Select
          value={assignee?.id ?? 'none'}
          onValueChange={(value) => onAssign(value === 'none' ? null : value)}
        >
          <SelectTrigger className="border-white/10 bg-white/5" disabled={isPending}>
            <SelectValue placeholder={`Assign ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function PortalStatusBadge({ client }: { client: IClient }) {
  const portalState = getPortalState(client);
  return <span className={portalState.className}>{portalState.label}</span>;
}

function ActorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <Avatar className="h-10 w-10">
      <AvatarImage src={avatarUrl} alt={name} />
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function formatClientActivity(activity: IClientActivity): {
  badge: string;
  title: string;
  description?: string;
  details: Array<{ label: string; value: string }>;
} {
  const actor = activity.user?.name ?? 'Someone';
  const data = activity.data;
  const details: Array<{ label: string; value: string }> = [];

  switch (activity.type) {
    case ClientActivityType.CREATED:
      return {
        badge: 'Created',
        title: `${actor} created this client record.`,
        details,
      };
    case ClientActivityType.UPSELL_ASSIGNED: {
      const fromName = toDisplayValue(data.fromName);
      const toName = toDisplayValue(data.toName);
      if (fromName !== '-' || toName !== '-') {
        details.push({ label: 'Previous Upsell Agent', value: fromName });
        details.push({ label: 'Current Upsell Agent', value: toName });
      }

      return {
        badge: 'Upsell',
        title:
          data.from != null
            ? `${actor} changed the Upsell Agent assignment.`
            : `${actor} assigned an Upsell Agent.`,
        details,
      };
    }
    case ClientActivityType.PM_ASSIGNED: {
      const fromName = toDisplayValue(data.fromName);
      const toName = toDisplayValue(data.toName);
      if (fromName !== '-' || toName !== '-') {
        details.push({ label: 'Previous Project Manager', value: fromName });
        details.push({ label: 'Current Project Manager', value: toName });
      }

      return {
        badge: 'PM',
        title:
          data.from != null
            ? `${actor} changed the Project Manager assignment.`
            : `${actor} assigned a Project Manager.`,
        details,
      };
    }
    case ClientActivityType.STATUS_CHANGE:
      details.push({ label: 'Previous Status', value: formatEnumLabel(toDisplayValue(data.from)) });
      details.push({ label: 'Current Status', value: formatEnumLabel(toDisplayValue(data.to)) });
      return {
        badge: 'Status',
        title: `${actor} updated the client status.`,
        details,
      };
    case ClientActivityType.PORTAL_ACCESS_GRANTED:
      details.push({ label: 'Portal Email', value: toDisplayValue(data.email) });
      return {
        badge: 'Portal',
        title: `${actor} granted portal access and sent an invitation.`,
        details,
      };
    case ClientActivityType.PORTAL_ACCESS_REVOKED:
      details.push({ label: 'Portal Email', value: toDisplayValue(data.email) });
      return {
        badge: 'Portal',
        title: `${actor} revoked portal access.`,
        details,
      };
    case ClientActivityType.CHARGEBACK_FILED:
      details.push({ label: 'Amount', value: toCurrencyValue(data.amount) });
      details.push({ label: 'Outcome', value: formatEnumLabel(toDisplayValue(data.outcome)) });
      return {
        badge: 'Chargeback',
        title: `${actor} recorded a chargeback event.`,
        description: toOptionalText(data.note),
        details,
      };
    case ClientActivityType.REFUND_ISSUED:
      details.push({ label: 'Amount', value: toCurrencyValue(data.amount) });
      return {
        badge: 'Refund',
        title: `${actor} issued a refund.`,
        description: toOptionalText(data.note),
        details,
      };
    case ClientActivityType.NOTE:
      return {
        badge: 'Note',
        title: `${actor} added an internal note.`,
        description: toDisplayValue(data.content),
        details,
      };
    default:
      return {
        badge: formatEnumLabel(activity.type),
        title: `${actor} recorded ${formatEnumLabel(activity.type)}.`,
        details,
      };
  }
}

function getPortalState(client: IClient): {
  label: string;
  className: string;
  description: string;
} {
  if (!client.portalAccess) {
    return {
      label: 'No Access',
      className: 'text-sm text-muted-foreground',
      description: 'Portal login is disabled. The client record exists for internal tracking only.',
    };
  }

  if (client.emailVerified) {
    return {
      label: 'Active',
      className: 'text-sm text-emerald-300',
      description: 'Portal access is live and the client has already verified their email.',
    };
  }

  return {
    label: 'Pending',
    className: 'text-sm text-amber-300',
    description: 'An invitation was sent, but email verification is still pending.',
  };
}

function formatExactDateTime(value: Date | string): string {
  return new Date(value).toLocaleString();
}

function formatEnumLabel(value: string): string {
  if (!value || value === '-') {
    return '-';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}

function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim() || '-';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '-';
}

function toOptionalText(value: unknown): string | undefined {
  const text = toDisplayValue(value);
  return text === '-' ? undefined : text;
}

function toCurrencyValue(value: unknown): string {
  if (typeof value === 'number') {
    return `$${value}`;
  }

  return toDisplayValue(value);
}
