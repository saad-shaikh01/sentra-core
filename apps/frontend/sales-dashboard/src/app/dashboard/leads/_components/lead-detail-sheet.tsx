'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useLead,
  useLeadActivities,
  useChangeLeadStatus,
  useAssignLead,
  useAddLeadNote,
  useDeleteLeadNote,
  useEditLeadNote,
  useClaimLead,
  useUnclaimLead,
  useAddLeadCollaborator,
  useRemoveLeadCollaborator,
} from '@/hooks/use-leads';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ILeadActivity,
  ILeadDetail,
  IOrganizationMember,
  LeadActivityType,
  LEAD_STATUS_TRANSITIONS,
  LeadStatus,
  SaleType,
} from '@sentra-core/types';
import { ConvertLeadModal } from './convert-lead-modal';
import { SaleFormModal } from '@/app/dashboard/sales/_components/sale-form-modal';
import {
  AlertCircle,
  ArrowRightLeft,
  ClipboardList,
  GitBranch,
  Globe,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  RefreshCw,
  Send,
  Trash2,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { timeAgo } from '@/lib/format-date';
import { EntityEmailTimeline } from '@/components/shared/comm/entity-email-timeline';
import { TeamAssignmentSelect } from './team-assignment-select';
import { LeadNoteEditor } from './lead-note-editor';

interface LeadDetailSheetProps {
  leadId: string | null;
  onClose: () => void;
  onEdit: (lead: ILeadDetail) => void;
}

type DetailTab = 'details' | 'discussion' | 'activity' | 'emails';

type ActivityActor = {
  id: string;
  name: string;
  avatarUrl?: string;
};

type ActivityMeta = {
  title: string;
  description?: string;
  details?: Array<{ label: string; value: string }>;
  accentClassName?: string;
  icon: React.ReactNode;
};

const tabConfig: Array<{ key: DetailTab; label: string; icon?: React.ReactNode }> = [
  { key: 'details', label: 'Details' },
  { key: 'discussion', label: 'Discussion', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: 'activity', label: 'Activity', icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { key: 'emails', label: 'Emails', icon: <Mail className="h-3.5 w-3.5" /> },
];

const activityIcons: Record<LeadActivityType, React.ReactNode> = {
  [LeadActivityType.STATUS_CHANGE]: <RefreshCw className="h-4 w-4" />,
  [LeadActivityType.NOTE]: <MessageSquare className="h-4 w-4" />,
  [LeadActivityType.ASSIGNMENT_CHANGE]: <UserCheck className="h-4 w-4" />,
  [LeadActivityType.CONVERSION]: <GitBranch className="h-4 w-4" />,
  [LeadActivityType.CREATED]: <ClipboardList className="h-4 w-4" />,
  [LeadActivityType.OUTREACH_STARTED]: <Send className="h-4 w-4" />,
  [LeadActivityType.OUTREACH_SENT]: <Send className="h-4 w-4" />,
  [LeadActivityType.OUTREACH_REPLIED]: <MessageSquare className="h-4 w-4" />,
  [LeadActivityType.COLLABORATOR_ADDED]: <UserPlus className="h-4 w-4" />,
  [LeadActivityType.COLLABORATOR_REMOVED]: <UserMinus className="h-4 w-4" />,
  [LeadActivityType.CLAIMED]: <UserCheck className="h-4 w-4" />,
  [LeadActivityType.UNCLAIMED]: <UserMinus className="h-4 w-4" />,
};

const noteUrlPattern = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/gi;

function renderPlainTextWithLinks(content: string) {
  const lines = content.split('\n');

  return lines.map((line, lineIndex) => {
    const parts = line.split(noteUrlPattern);

    return (
      <Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('http://') || part.startsWith('https://')) {
            return (
              <a
                key={`part-${lineIndex}-${partIndex}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="mention underline underline-offset-2"
              >
                {part}
              </a>
            );
          }

          return <Fragment key={`part-${lineIndex}-${partIndex}`}>{part}</Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function LeadNoteContent({
  content,
  onImageClick,
}: {
  content: string;
  onImageClick: (src: string, alt?: string) => void;
}) {
  const safeHtml = useMemo(() => {
    if (!content.startsWith('<')) {
      return '';
    }

    return DOMPurify.sanitize(content, {
      ADD_TAGS: ['img'],
      ADD_ATTR: ['target', 'rel'],
      ALLOWED_ATTR: ['src', 'alt', 'href', 'target', 'rel', 'class', 'style'],
      ALLOW_DATA_ATTR: false,
      ADD_DATA_URI_TAGS: ['img'],
      FORCE_BODY: true,
    });
  }, [content]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const image = target.closest('img');
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    event.preventDefault();
    onImageClick(image.currentSrc || image.src, image.alt);
  };

  if (!safeHtml) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
        {content ? renderPlainTextWithLinks(content) : 'No note content.'}
      </p>
    );
  }

  return (
    <div
      className="text-sm leading-6 text-foreground/90 [&_a]:cursor-pointer [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_img]:mt-2 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border [&_img]:border-white/10 [&_img]:object-contain [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:ml-4 [&_ul]:list-disc [&_.mention]:cursor-default [&_.mention]:font-semibold [&_.mention]:text-primary"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

export function LeadDetailSheet({ leadId, onClose, onEdit }: LeadDetailSheetProps) {
  const { data: lead, isLoading, isError } = useLead(leadId ?? '');
  const { data: activities } = useLeadActivities(leadId ?? '');
  const { data: members } = useMembers();
  const { data: frontSellAgents } = useMembers({ permission: 'sales:leads:view_own' });
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const changeStatus = useChangeLeadStatus();
  const assignLead = useAssignLead();
  const addNote = useAddLeadNote();
  const editNote = useEditLeadNote();
  const deleteNote = useDeleteLeadNote();

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [createSaleOpen, setCreateSaleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  const [addCollabUserId, setAddCollabUserId] = useState('');

  const claimLead = useClaimLead();
  const unclaimLead = useUnclaimLead();
  const addCollaborator = useAddLeadCollaborator();
  const removeCollaborator = useRemoveLeadCollaborator();

  const allowedTransitions = lead ? LEAD_STATUS_TRANSITIONS[lead.status] : [];
  const minFollowUpDate = new Date().toISOString().split('T')[0];
  const canAssign = hasPermission('sales:leads:assign');
  const canConvert = hasPermission('sales:leads:convert');
  const canCreateSale = hasPermission('sales:sales:create');
  const isFrontsell = hasPermission('sales:leads:view_own');
  const showReadOnlyAssignee = !canAssign && !isFrontsell;
  const isLeadClosed = lead?.status === LeadStatus.CLOSED_WON || lead?.status === LeadStatus.CLOSED_LOST;
  const isOwner = !!user && lead?.assignedToId === user.id;
  const isCollaborator = !!user && (lead as any)?.collaborators?.some((c: { userId: string }) => c.userId === user.id);
  const canClaim = hasPermission('sales:leads:claim') && !lead?.assignedToId && !isLeadClosed;
  const canUnclaim = (isOwner || canAssign) && !!lead?.assignedToId && !isLeadClosed;
  const canManageCollaborators = isOwner || canAssign;

  const existingCollabIds = new Set(
    ((lead as any)?.collaborators ?? []).map((c: { userId: string }) => c.userId)
  );
  const availableForCollab = (frontSellAgents ?? []).filter(
    (m) => m.id !== lead?.assignedToId && !existingCollabIds.has(m.id)
  );

  useEffect(() => {
    setTeamId(lead?.teamId ?? null);
  }, [lead?.teamId]);

  const memberMap = useMemo(() => {
    return new Map((members ?? []).map((member) => [member.id, member]));
  }, [members]);

  const discussionItems = useMemo(() => {
    return (activities ?? []).filter((activity) => activity.type === LeadActivityType.NOTE);
  }, [activities]);

  const auditItems = useMemo(() => {
    return (activities ?? []).filter((activity) => activity.type !== LeadActivityType.NOTE);
  }, [activities]);

  const lastAssignmentActivity = useMemo(() => {
    return auditItems.find((activity) => activity.type === LeadActivityType.ASSIGNMENT_CHANGE);
  }, [auditItems]);

  const closeFollowUpDialog = () => {
    setFollowUpDialogOpen(false);
    setFollowUpDate('');
  };

  const closeLostDialog = () => {
    setLostDialogOpen(false);
    setLostReason('');
  };

  const handleAddNote = async (content: string, mentionedUserIds: string[]) => {
    if (!leadId) return;
    await addNote.mutateAsync({ id: leadId, content, mentionedUserIds });
  };

  const startEditingNote = (activity: ILeadActivity) => {
    setEditingNoteId(activity.id);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
  };

  const handleSaveEditedNote = async (content: string) => {
    if (!leadId || !editingNoteId) return;
    await editNote.mutateAsync({ leadId, noteId: editingNoteId, content });
    cancelEditingNote();
  };

  const canManageNote = (activity: ILeadActivity) => {
    if (!user || activity.userId !== user.id) {
      return false;
    }

    return Date.now() - new Date(activity.createdAt).getTime() <= 24 * 60 * 60 * 1000;
  };

  return (
    <>
      <DetailSheet
        open={!!leadId}
        onClose={onClose}
        title={lead?.title ?? 'Lead Details'}
        description={lead ? `Status: ${lead.status}` : undefined}
        action={lead && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-white/10"
            onClick={() => onEdit(lead)}
            aria-label="Edit lead"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      >
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-4 w-3/4 rounded bg-white/10" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Failed to load lead details. Please try again.</p>
          </div>
        ) : lead ? (
          <>
            <div className="-mt-2 mb-2 flex border-b border-white/10 overflow-x-auto whitespace-nowrap no-scrollbar">
              {tabConfig.map((tab) => (
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

            {activeTab === 'emails' && leadId ? (
              <EntityEmailTimeline entityType="lead" entityId={leadId} />
            ) : null}

            {activeTab === 'details' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</h3>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ContactRow icon={<User className="h-4 w-4" />} toneClassName="bg-blue-500/10 text-blue-400" label="Name" value={lead.name ?? '-'} />
                      <ContactRow icon={<Mail className="h-4 w-4" />} toneClassName="bg-emerald-500/10 text-emerald-400" label="Email" value={lead.email ?? '-'} />
                      <ContactRow icon={<Phone className="h-4 w-4" />} toneClassName="bg-amber-500/10 text-amber-400" label="Phone" value={lead.phone ?? '-'} />
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase text-muted-foreground">Website</p>
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-[150px] truncate text-sm font-medium text-primary hover:underline"
                            >
                              {lead.website.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <p className="text-sm font-medium">-</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard label="Status" value={<StatusBadge status={lead.status} />} />
                  <InfoCard label="Source" value={<span className="text-sm">{formatEnumLabel(lead.source)}</span>} />
                  <InfoCard label="Lead Type" value={<span className="text-sm">{formatEnumLabel(lead.leadType)}</span>} />
                  <InfoCard label="Lead Date" value={<span className="text-sm">{formatDateValue(lead.leadDate ?? lead.createdAt)}</span>} />
                </div>

                {lead.status === LeadStatus.FOLLOW_UP ? (
                  <InfoCard
                    label="Follow-up Date"
                    value={<span className="text-sm">{lead.followUpDate ? formatDateValue(lead.followUpDate) : '-'}</span>}
                  />
                ) : null}

                {lead.lostReason ? (
                  <InfoCard label="Lost Reason" value={<span className="text-sm">{lead.lostReason}</span>} />
                ) : null}

                {allowedTransitions.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change Status</h3>
                    <div className="flex flex-wrap gap-2">
                      {allowedTransitions.map((status) => (
                        <Button
                          key={status}
                          variant="outline"
                          size="sm"
                          disabled={changeStatus.isPending}
                          onClick={() => {
                            if (status === LeadStatus.FOLLOW_UP) {
                              setFollowUpDialogOpen(true);
                              return;
                            }

                            if (status === LeadStatus.CLOSED_LOST) {
                              setLostDialogOpen(true);
                              return;
                            }

                            changeStatus.mutate({ id: lead.id, status });
                          }}
                        >
                          {`-> ${status}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {lead.assignedTo ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Front Sell Agent</p>
                    <div className="flex items-center gap-3">
                      <ActorAvatar actor={{
                        id: lead.assignedTo.id,
                        name: lead.assignedTo.name,
                        avatarUrl: lead.assignedTo.avatarUrl,
                      }} />
                      <div>
                        <p className="text-sm font-semibold">{lead.assignedTo.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Active · assigned {timeAgo(lastAssignmentActivity?.createdAt ?? lead.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {canAssign ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Front Sell Agent</h3>
                    <Select
                      value={lead.assignedToId ?? ''}
                      onValueChange={(value) => assignLead.mutate({ id: lead.id, assignedToId: value })}
                    >
                      <SelectTrigger className="border-white/10 bg-white/5">
                        <SelectValue placeholder="Change agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {(frontSellAgents ?? []).map((member) => (
                          <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {showReadOnlyAssignee ? (
                  <InfoCard
                    label="Front Sell Agent"
                    value={<span className="text-sm">{lead.assignedTo?.name ?? (lead.assignedToId ? 'Assigned' : 'Unassigned')}</span>}
                  />
                ) : null}

                {/* Claim / Unclaim */}
                {(canClaim || canUnclaim) ? (
                  <div className="flex gap-2">
                    {canClaim ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                        disabled={claimLead.isPending}
                        onClick={() => leadId && claimLead.mutate(leadId)}
                      >
                        <UserCheck className="mr-2 h-3.5 w-3.5" />
                        Claim Lead
                      </Button>
                    ) : null}
                    {canUnclaim ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        disabled={unclaimLead.isPending}
                        onClick={() => leadId && unclaimLead.mutate(leadId)}
                      >
                        <UserMinus className="mr-2 h-3.5 w-3.5" />
                        Unclaim
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {/* Collaborators panel */}
                {(canManageCollaborators || isCollaborator || ((lead as any)?.collaborators?.length > 0)) ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Collaborators</h3>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {(lead as any)?.collaborators?.length ?? 0}
                      </span>
                    </div>

                    {((lead as any)?.collaborators?.length ?? 0) > 0 ? (
                      <div className="space-y-2">
                        {((lead as any)?.collaborators ?? []).map((collab: { id: string; userId: string; user?: { id: string; name: string; avatarUrl?: string } }) => (
                          <div key={collab.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={collab.user?.avatarUrl} alt={collab.user?.name} />
                                <AvatarFallback>{getInitials(collab.user?.name ?? 'U')}</AvatarFallback>
                              </Avatar>
                              <p className="text-sm font-medium">{collab.user?.name ?? collab.userId}</p>
                            </div>
                            {canManageCollaborators ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                disabled={removeCollaborator.isPending}
                                onClick={() => leadId && removeCollaborator.mutate({ leadId, userId: collab.userId })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No collaborators yet.</p>
                    )}

                    {canManageCollaborators && availableForCollab.length > 0 ? (
                      <div className="flex gap-2 pt-1">
                        <Select value={addCollabUserId} onValueChange={setAddCollabUserId}>
                          <SelectTrigger className="flex-1 h-8 text-xs border-white/10 bg-white/5">
                            <SelectValue placeholder="Add collaborator…" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableForCollab.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-white/10"
                          disabled={!addCollabUserId || addCollaborator.isPending}
                          onClick={() => {
                            if (!leadId || !addCollabUserId) return;
                            addCollaborator.mutate(
                              { leadId, userId: addCollabUserId },
                              { onSuccess: () => setAddCollabUserId('') }
                            );
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">Team</p>
                  <TeamAssignmentSelect
                    value={teamId}
                    leadId={lead.id}
                    onSuccess={setTeamId}
                  />
                </div>

                {canCreateSale || (canConvert && !isLeadClosed && !lead.convertedClientId) ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {canCreateSale && lead.status !== LeadStatus.CLOSED_LOST ? (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setCreateSaleOpen(true)}
                      >
                        New Sale
                      </Button>
                    ) : null}

                    {canConvert && !isLeadClosed && !lead.convertedClientId ? (
                      <Button
                        variant="outline"
                        className="flex-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => setConvertOpen(true)}
                      >
                        Convert to Client
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {lead.convertedClientId ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-sm font-medium text-emerald-200">Client created for this lead</p>
                    <p className="mt-1 text-xs text-emerald-100/80">
                      Future sales from this lead will be added to the existing client automatically.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'discussion' ? (
              <div className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Discussion</h3>
                      <p className="text-xs text-muted-foreground">Internal notes with author, avatar, and timestamp.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {discussionItems.length} notes
                    </span>
                  </div>

                  <LeadNoteEditor
                    members={(members ?? []).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? undefined }))}
                    onSubmit={handleAddNote}
                    isPending={addNote.isPending}
                  />
                </section>

                {discussionItems.length ? (
                  <div className="space-y-3">
                    {discussionItems.map((item) => {
                      const actor = resolveActivityActor(item, memberMap);
                      const noteContent = typeof item.data.content === 'string' ? item.data.content : '';
                      const isEditing = editingNoteId === item.id;
                      const canEditOrDelete = canManageNote(item);

                      return (
                        <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <ActorAvatar actor={actor} />
                              <div>
                                <p className="text-sm font-semibold">{actor.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {timeAgo(item.createdAt)} · {formatExactDateTime(item.createdAt)}
                                </p>
                              </div>
                            </div>
                            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                              Note
                            </span>
                          </div>
                          {isEditing ? (
                            <LeadNoteEditor
                              key={item.id}
                              members={(members ?? []).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? undefined }))}
                              initialContent={noteContent}
                              onSubmit={async (content) => handleSaveEditedNote(content)}
                              onCancel={cancelEditingNote}
                              isPending={editNote.isPending}
                              submitLabel="Save"
                            />
                          ) : (
                            <>
                              <LeadNoteContent
                                content={noteContent}
                                onImageClick={(src, alt) => setPreviewImage({ src, alt })}
                              />
                              {canEditOrDelete ? (
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => startEditingNote(item)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                                    onClick={() => deleteNote.mutate({ leadId: lead.id, noteId: item.id })}
                                    disabled={deleteNote.isPending}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={<MessageSquare className="h-5 w-5" />}
                    title="No discussion yet"
                    description="Start the internal discussion by adding the first note."
                  />
                )}
              </div>
            ) : null}

            {activeTab === 'activity' ? (
              <div className="space-y-3">
                {auditItems.length ? (
                  auditItems.map((item) => {
                    const actor = resolveActivityActor(item, memberMap);
                    const meta = buildActivityMeta(item, actor.name);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border bg-white/[0.03] p-4 ${
                          meta.accentClassName ?? 'border-white/10'
                        }`}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
                              {meta.icon}
                            </div>
                            <div className="flex items-center gap-3">
                              <ActorAvatar actor={actor} sizeClassName="h-9 w-9" />
                              <div>
                                <p className="text-sm font-semibold">{meta.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {actor.name} · {timeAgo(item.createdAt)} · {formatExactDateTime(item.createdAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {formatEnumLabel(item.type)}
                          </span>
                        </div>

                        {meta.description ? (
                          <p className="mb-3 text-sm leading-6 text-foreground/90">{meta.description}</p>
                        ) : null}

                        {meta.details?.length ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {meta.details.map((detail) => (
                              <div key={`${item.id}-${detail.label}`} className="rounded-xl border border-white/10 bg-black/10 p-3">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{detail.label}</p>
                                <p className="text-sm font-medium">{detail.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon={<ClipboardList className="h-5 w-5" />}
                    title="No activity recorded"
                    description="System actions like creation, status changes, assignments, and conversion will appear here."
                  />
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </DetailSheet>

      {lead ? (
        <Dialog open={followUpDialogOpen} onOpenChange={(open) => { if (!open) closeFollowUpDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Set Follow-Up Date</DialogTitle>
              <DialogDescription>Select the date before moving this lead to follow-up.</DialogDescription>
            </DialogHeader>

            <Input
              type="date"
              value={followUpDate}
              min={minFollowUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFollowUpDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!followUpDate || changeStatus.isPending}
                onClick={() => {
                  changeStatus.mutate({
                    id: lead.id,
                    status: LeadStatus.FOLLOW_UP,
                    followUpDate: new Date(followUpDate).toISOString(),
                  });
                  closeFollowUpDialog();
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {lead ? (
        <Dialog open={lostDialogOpen} onOpenChange={(open) => { if (!open) closeLostDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reason for Closing Lost</DialogTitle>
              <DialogDescription>Provide a short reason before marking this lead as lost.</DialogDescription>
            </DialogHeader>

            <Input
              value={lostReason}
              maxLength={500}
              placeholder="Reason for losing this lead"
              onChange={(event) => setLostReason(event.target.value)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeLostDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!lostReason.trim() || changeStatus.isPending}
                onClick={() => {
                  changeStatus.mutate({
                    id: lead.id,
                    status: LeadStatus.CLOSED_LOST,
                    lostReason: lostReason.trim(),
                  });
                  closeLostDialog();
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="max-w-4xl border-white/10 bg-[#09090b]/95 p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle>{previewImage?.alt || 'Note image'}</DialogTitle>
            <DialogDescription>Preview of the image shared in discussion.</DialogDescription>
          </DialogHeader>
          {previewImage ? (
            <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl border border-white/10 bg-black/30 p-2">
              <img
                src={previewImage.src}
                alt={previewImage.alt || 'Discussion note image'}
                className="max-h-[68vh] max-w-full rounded-lg object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {lead ? (
        <ConvertLeadModal
          open={convertOpen}
          onOpenChange={setConvertOpen}
          lead={lead}
          onSuccess={onClose}
        />
      ) : null}

      {lead ? (
        <SaleFormModal
          open={createSaleOpen}
          onOpenChange={setCreateSaleOpen}
          prefillLeadId={lead.id}
          prefillLeadLabel={lead.name ?? lead.title ?? 'this lead'}
          prefillBrandId={lead.brandId}
          prefillSaleType={SaleType.FRONTSELL}
          prefillSalesAgentId={lead.assignedToId ?? undefined}
        />
      ) : null}
    </>
  );
}

function ContactRow({
  icon,
  toneClassName,
  label,
  value,
}: {
  icon: React.ReactNode;
  toneClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClassName}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {value}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ActorAvatar({
  actor,
  sizeClassName = 'h-10 w-10',
}: {
  actor: ActivityActor;
  sizeClassName?: string;
}) {
  return (
    <Avatar className={sizeClassName}>
      <AvatarImage src={actor.avatarUrl} alt={actor.name} />
      <AvatarFallback>{getInitials(actor.name)}</AvatarFallback>
    </Avatar>
  );
}

function resolveActivityActor(
  activity: ILeadActivity,
  memberMap: Map<string, IOrganizationMember>,
): ActivityActor {
  if (activity.user) {
    return activity.user;
  }

  const member = memberMap.get(activity.userId);
  if (member) {
    return {
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl,
    };
  }

  return {
    id: activity.userId,
    name: 'Unknown User',
  };
}

function buildActivityMeta(activity: ILeadActivity, actorName: string): ActivityMeta {
  const data = activity.data;

  switch (activity.type) {
    case LeadActivityType.CREATED:
      return {
        title: `${actorName} created this lead`,
        description: 'Lead record was created and entered into the pipeline.',
        details: [
          { label: 'Title', value: readString(data.title) || '-' },
        ],
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.STATUS_CHANGE:
      return {
        title: `${actorName} updated the lead status`,
        description: buildStatusChangeDescription(data),
        details: compactDetails([
          { label: 'From', value: readString(data.from) },
          { label: 'To', value: readString(data.to) },
          { label: 'Follow Up Date', value: formatOptionalDate(readString(data.followUpDate)) },
          { label: 'Lost Reason', value: readString(data.lostReason) },
        ]),
        accentClassName: 'border-amber-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.ASSIGNMENT_CHANGE:
      return {
        title: `${actorName} changed ownership`,
        description: buildAssignmentDescription(data),
        details: compactDetails([
          { label: 'Previous Assignee', value: readString(data.fromName) || readString(data.from) },
          { label: 'New Assignee', value: readString(data.toName) || readString(data.to) },
        ]),
        accentClassName: 'border-sky-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.CONVERSION:
      return {
        title: `${actorName} converted this lead`,
        description: 'The lead was successfully converted into a client record.',
        details: compactDetails([
          { label: 'Client ID', value: readString(data.clientId) },
        ]),
        accentClassName: 'border-emerald-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.CLAIMED:
      return {
        title: `${actorName} claimed this lead`,
        description: 'Lead was picked up from the unassigned pool.',
        accentClassName: 'border-sky-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.UNCLAIMED:
      return {
        title: `${actorName} unclaimed this lead`,
        description: 'Lead was released back to the unassigned pool.',
        accentClassName: 'border-amber-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.COLLABORATOR_ADDED:
      return {
        title: `${actorName} added a collaborator`,
        details: compactDetails([
          { label: 'Collaborator', value: readString(data.name) || readString(data.userId) },
        ]),
        accentClassName: 'border-violet-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.COLLABORATOR_REMOVED:
      return {
        title: `${actorName} removed a collaborator`,
        details: compactDetails([
          { label: 'User ID', value: readString(data.userId) },
        ]),
        accentClassName: 'border-orange-500/20',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.OUTREACH_STARTED:
      return {
        title: `${actorName} started outreach`,
        description: 'Outreach sequence was initiated for this lead.',
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.OUTREACH_SENT:
      return {
        title: `${actorName} sent an outreach message`,
        icon: activityIcons[activity.type],
      };
    case LeadActivityType.OUTREACH_REPLIED:
      return {
        title: `Lead replied to outreach`,
        description: 'The lead responded to an outreach message.',
        accentClassName: 'border-emerald-500/20',
        icon: activityIcons[activity.type],
      };
    default:
      return {
        title: `${actorName} updated this lead`,
        description: 'Activity recorded on this lead.',
        icon: <ArrowRightLeft className="h-4 w-4" />,
      };
  }
}

function buildStatusChangeDescription(data: Record<string, unknown>): string {
  const from = readString(data.from) || 'Unknown';
  const to = readString(data.to) || 'Unknown';
  return `Status moved from ${formatEnumLabel(from)} to ${formatEnumLabel(to)}.`;
}

function buildAssignmentDescription(data: Record<string, unknown>): string {
  const fromName = readString(data.fromName) || 'Unassigned';
  const toName = readString(data.toName) || 'Unassigned';
  return `Assignment changed from ${fromName} to ${toName}.`;
}

function compactDetails(
  details: Array<{ label: string; value?: string }>,
): Array<{ label: string; value: string }> {
  return details
    .filter((detail): detail is { label: string; value: string } => Boolean(detail.value))
    .map((detail) => ({ label: detail.label, value: detail.value }));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function formatDateValue(value: Date | string): string {
  return new Date(value).toLocaleDateString();
}

function formatExactDateTime(value: Date | string): string {
  return new Date(value).toLocaleString();
}

function formatOptionalDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return formatExactDateTime(value);
}

function formatEnumLabel(value?: string): string {
  if (!value) {
    return '-';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}
