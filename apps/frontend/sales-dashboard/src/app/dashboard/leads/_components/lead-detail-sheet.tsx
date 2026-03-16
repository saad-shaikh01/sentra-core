'use client';

import { useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
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
} from '@/hooks/use-leads';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organization';
import {
  hasMinimumRole,
  ILeadActivity,
  ILeadDetail,
  IOrganizationMember,
  LeadActivityType,
  LEAD_STATUS_TRANSITIONS,
  LeadStatus,
  UserRole,
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
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { timeAgo } from '@/lib/format-date';
import { EntityEmailTimeline } from '@/components/shared/comm/entity-email-timeline';

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
};

export function LeadDetailSheet({ leadId, onClose, onEdit }: LeadDetailSheetProps) {
  const { data: lead, isLoading, isError } = useLead(leadId ?? '');
  const { data: activities } = useLeadActivities(leadId ?? '');
  const { data: members } = useMembers();
  const { data: frontSellAgents } = useMembers(UserRole.FRONTSELL_AGENT);
  const { user } = useAuth();
  const changeStatus = useChangeLeadStatus();
  const assignLead = useAssignLead();
  const addNote = useAddLeadNote();
  const editNote = useEditLeadNote();
  const deleteNote = useDeleteLeadNote();

  const [note, setNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [createSaleOpen, setCreateSaleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const allowedTransitions = lead ? LEAD_STATUS_TRANSITIONS[lead.status] : [];
  const minFollowUpDate = new Date().toISOString().split('T')[0];
  const userRole = user?.role;
  const canAssign = userRole ? hasMinimumRole(userRole, UserRole.SALES_MANAGER) : false;
  const canConvert = userRole ? hasMinimumRole(userRole, UserRole.SALES_MANAGER) : false;
  const canCreateSale = userRole ? hasMinimumRole(userRole, UserRole.PROJECT_MANAGER) : false;
  const showReadOnlyAssignee = !!userRole && !canAssign;
  const isLeadClosed = lead?.status === LeadStatus.CLOSED_WON || lead?.status === LeadStatus.CLOSED_LOST;

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

  const handleAddNote = async () => {
    if (!note.trim() || !leadId) {
      return;
    }

    await addNote.mutateAsync({ id: leadId, content: note.trim() });
    setNote('');
  };

  const startEditingNote = (activity: ILeadActivity) => {
    const content = typeof activity.data.content === 'string' ? activity.data.content : '';
    setEditingNoteId(activity.id);
    setEditingNoteContent(content);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
  };

  const handleSaveEditedNote = async () => {
    if (!leadId || !editingNoteId || !editingNoteContent.trim()) {
      return;
    }

    await editNote.mutateAsync({
      leadId,
      noteId: editingNoteId,
      content: editingNoteContent.trim(),
    });
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
            <div className="-mt-2 mb-2 flex border-b border-white/10">
              {tabConfig.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
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

                <div className="grid grid-cols-2 gap-3">
                  <InfoCard label="Status" value={<StatusBadge status={lead.status} />} />
                  <InfoCard label="Source" value={<span className="text-sm">{formatEnumLabel(lead.source)}</span>} />
                  <InfoCard label="Lead Type" value={<span className="text-sm">{formatEnumLabel(lead.leadType)}</span>} />
                  <InfoCard label="Lead Date" value={<span className="text-sm">{formatDateValue(lead.leadDate ?? lead.createdAt)}</span>} />
                </div>

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

                {canCreateSale || (canConvert && !isLeadClosed && !lead.convertedClientId) ? (
                  <div className="flex gap-2">
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

                  <div className="space-y-2">
                    <Label htmlFor="lead-note">Add Note</Label>
                    <div className="space-y-2">
                      <textarea
                        id="lead-note"
                        placeholder="Write a note for this lead"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleAddNote}
                          disabled={!note.trim() || addNote.isPending}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
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
                            <div className="space-y-3">
                              <textarea
                                value={editingNoteContent}
                                onChange={(event) => setEditingNoteContent(event.target.value)}
                                rows={4}
                                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                              />
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={cancelEditingNote}>
                                  <X className="mr-2 h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleSaveEditedNote}
                                  disabled={!editingNoteContent.trim() || editNote.isPending}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{noteContent || 'No note content.'}</p>
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

      {leadId && lead ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="fixed right-16 top-5 z-[60] h-8 w-8 hover:bg-white/10"
          onClick={() => onEdit(lead)}
          aria-label="Edit lead"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}

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
          { label: 'Client', value: readString(data.companyName) },
          { label: 'Client ID', value: readString(data.clientId) },
        ]),
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
