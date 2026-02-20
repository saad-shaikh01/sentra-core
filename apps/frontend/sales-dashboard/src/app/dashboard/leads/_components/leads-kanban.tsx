'use client';

import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { ILead, LeadStatus, LEAD_STATUS_TRANSITIONS } from '@sentra-core/types';
import { LeadsKanbanCard } from './leads-kanban-card';
import { useChangeLeadStatus } from '@/hooks/use-leads';
import { toast } from '@/hooks/use-toast';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: LeadStatus.NEW, label: 'New' },
  { status: LeadStatus.CONTACTED, label: 'Contacted' },
  { status: LeadStatus.PROPOSAL, label: 'Proposal' },
  { status: LeadStatus.CLOSED, label: 'Closed' },
];

const COLUMN_COLORS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'border-t-blue-500/60',
  [LeadStatus.CONTACTED]: 'border-t-amber-500/60',
  [LeadStatus.PROPOSAL]: 'border-t-purple-500/60',
  [LeadStatus.CLOSED]: 'border-t-emerald-500/60',
};

interface LeadsKanbanProps {
  leads: Array<ILead & { brandName?: string; assigneeName?: string }>;
  onLeadClick: (lead: ILead) => void;
}

export function LeadsKanban({ leads, onLeadClick }: LeadsKanbanProps) {
  const changeStatus = useChangeLeadStatus();

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

    changeStatus.mutate({ id: draggableId, status: newStatus });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-4 gap-4">
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
  );
}
