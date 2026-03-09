'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { ILead, LeadStatus, LEAD_STATUS_TRANSITIONS } from '@sentra-core/types';
import { LeadsKanbanCard } from './leads-kanban-card';
import { useChangeLeadStatus } from '@/hooks/use-leads';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: LeadStatus.NEW, label: 'New' },
  { status: LeadStatus.CONTACTED, label: 'Contacted' },
  { status: LeadStatus.PROPOSAL, label: 'Proposal' },
  { status: LeadStatus.FOLLOW_UP, label: 'Follow Up' },
  { status: LeadStatus.CLOSED, label: 'Closed' },
];

const COLUMN_COLORS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'border-t-blue-500/60',
  [LeadStatus.CONTACTED]: 'border-t-amber-500/60',
  [LeadStatus.PROPOSAL]: 'border-t-purple-500/60',
  [LeadStatus.FOLLOW_UP]: 'border-t-orange-500/60',
  [LeadStatus.CLOSED]: 'border-t-emerald-500/60',
};

interface LeadsKanbanProps {
  leads: Array<ILead & { brandName?: string; assigneeName?: string }>;
  onLeadClick: (lead: ILead) => void;
}

export function LeadsKanban({ leads, onLeadClick }: LeadsKanbanProps) {
  const changeStatus = useChangeLeadStatus();
  const [pendingFollowUp, setPendingFollowUp] = useState<{ leadId: string } | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const minFollowUpDate = new Date().toISOString().split('T')[0];

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId as LeadStatus;
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead) return;

    const allowed = LEAD_STATUS_TRANSITIONS[lead.status];
    if (!allowed.includes(newStatus)) {
      toast.error('Invalid transition', `Cannot move lead from ${lead.status} to ${newStatus}`);
      return;
    }

    if (newStatus === LeadStatus.FOLLOW_UP) {
      setPendingFollowUp({ leadId: lead.id });
      return;
    }

    changeStatus.mutate({ id: draggableId, status: newStatus });
  };

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-4">
          {COLUMNS.map(({ status, label }) => {
            const columnLeads = leads.filter((l) => l.status === status);
            return (
              <div key={status} className="flex flex-col min-h-[400px]">
                <div className={`rounded-t-2xl border border-b-0 border-white/10 ${COLUMN_COLORS[status]} border-t-2 px-4 py-3 bg-white/[0.02]`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="text-xs font-bold bg-white/10 rounded-full px-2 py-0.5">{columnLeads.length}</span>
                  </div>
                </div>
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`
                        flex-1 rounded-b-2xl border border-white/10 p-3 space-y-2 transition-colors duration-200
                        ${snapshot.isDraggingOver ? 'bg-white/[0.05] border-white/20' : 'bg-white/[0.02]'}
                      `}
                    >
                      {columnLeads.map((lead, i) => (
                        <LeadsKanbanCard
                          key={lead.id}
                          lead={lead}
                          index={i}
                          onClick={onLeadClick}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <Dialog open={pendingFollowUp !== null} onOpenChange={(open) => { if (!open) setPendingFollowUp(null); }}>
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
            <Button type="button" variant="outline" onClick={() => setPendingFollowUp(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!followUpDate || changeStatus.isPending}
              onClick={() => {
                if (!pendingFollowUp || !followUpDate) {
                  return;
                }

                changeStatus.mutate({
                  id: pendingFollowUp.leadId,
                  status: LeadStatus.FOLLOW_UP,
                  followUpDate: new Date(followUpDate).toISOString(),
                });
                setPendingFollowUp(null);
                setFollowUpDate('');
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
