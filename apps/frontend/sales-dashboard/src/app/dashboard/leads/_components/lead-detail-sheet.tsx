'use client';

import { useState } from 'react';
import { DetailSheet, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  useLead, useLeadActivities, useChangeLeadStatus, useAssignLead, useAddLeadNote
} from '@/hooks/use-leads';
import { useMembers } from '@/hooks/use-organization';
import { ILead, LeadStatus, LeadActivityType, LEAD_STATUS_TRANSITIONS } from '@sentra-core/types';
import { ConvertLeadModal } from './convert-lead-modal';
import { MessageSquare, RefreshCw, UserCheck, GitBranch, AlertCircle } from 'lucide-react';
import { timeAgo } from '@/lib/format-date';

interface LeadDetailSheetProps {
  leadId: string | null;
  onClose: () => void;
}

const activityIcons: Record<LeadActivityType, React.ReactNode> = {
  [LeadActivityType.STATUS_CHANGE]: <RefreshCw className="h-3.5 w-3.5" />,
  [LeadActivityType.NOTE]: <MessageSquare className="h-3.5 w-3.5" />,
  [LeadActivityType.ASSIGNMENT_CHANGE]: <UserCheck className="h-3.5 w-3.5" />,
  [LeadActivityType.CONVERSION]: <GitBranch className="h-3.5 w-3.5" />,
  [LeadActivityType.CREATED]: <GitBranch className="h-3.5 w-3.5" />,
};

export function LeadDetailSheet({ leadId, onClose }: LeadDetailSheetProps) {
  const { data: lead, isLoading, isError } = useLead(leadId ?? '');
  const { data: activities } = useLeadActivities(leadId ?? '');
  const { data: members } = useMembers();
  const changeStatus = useChangeLeadStatus();
  const assignLead = useAssignLead();
  const addNote = useAddLeadNote();

  const [note, setNote] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);

  const allowedTransitions = lead ? LEAD_STATUS_TRANSITIONS[lead.status] : [];

  const handleAddNote = async () => {
    if (!note.trim() || !leadId) return;
    await addNote.mutateAsync({ id: leadId, content: note });
    setNote('');
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
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/10 rounded w-3/4" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-3" />
            <p className="text-sm text-muted-foreground">Failed to load lead details. Please try again.</p>
          </div>
        ) : lead ? (
          <>
            {/* Info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Status" value={<StatusBadge status={lead.status} />} />
              <InfoCard label="Source" value={<span className="text-sm">{lead.source ?? '—'}</span>} />
              <InfoCard label="Created" value={<span className="text-sm">{new Date(lead.createdAt).toLocaleDateString()}</span>} />
            </div>

            {/* Status change */}
            {allowedTransitions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Change Status</h3>
                <div className="flex gap-2 flex-wrap">
                  {allowedTransitions.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ id: lead.id, status: s })}
                    >
                      → {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Assign */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assign To</h3>
              <Select
                value={lead.assignedToId ?? ''}
                onValueChange={(v) => assignLead.mutate({ id: lead.id, assignedToId: v })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {members?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Convert */}
            {lead.status !== LeadStatus.CLOSED && !lead.convertedClientId && (
              <Button
                variant="outline"
                className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => setConvertOpen(true)}
              >
                Convert to Client
              </Button>
            )}

            {/* Activity timeline */}
            {activities?.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Activity</h3>
                <div className="space-y-2">
                  {activities.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="mt-0.5 h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground shrink-0">
                        {activityIcons[a.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground capitalize">{a.type.toLowerCase().replace(/_/g, ' ')}</p>
                        {(a.data as { content?: string }).content && (
                          <p className="text-sm mt-0.5">{(a.data as { content?: string }).content}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {timeAgo(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Add note */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Add Note</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Write a note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-white/5 border-white/10"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                />
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!note.trim() || addNote.isPending}
                >
                  Add
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DetailSheet>

      {lead && (
        <ConvertLeadModal
          open={convertOpen}
          onOpenChange={setConvertOpen}
          leadId={lead.id}
          onSuccess={onClose}
        />
      )}
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {value}
    </div>
  );
}
