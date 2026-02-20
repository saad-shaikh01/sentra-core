'use client';

import { Draggable } from '@hello-pangea/dnd';
import { ILead } from '@sentra-core/types';
import { StatusBadge } from '@/components/shared';
import { timeAgo } from '@/lib/format-date';

interface LeadsKanbanCardProps {
  lead: ILead & { brandName?: string; assigneeName?: string };
  index: number;
  onClick: (lead: ILead) => void;
}

export function LeadsKanbanCard({ lead, index, onClick }: LeadsKanbanCardProps) {
  const age = timeAgo(lead.createdAt);

  const initials = lead.assigneeName
    ? lead.assigneeName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead)}
          className={`
            rounded-xl p-4 border cursor-pointer transition-all duration-150 select-none
            bg-white/[0.04] border-white/10 hover:bg-white/[0.07] hover:border-white/20
            ${snapshot.isDragging ? 'shadow-2xl shadow-black/40 rotate-1 scale-[1.02]' : ''}
          `}
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{lead.title}</p>
            <StatusBadge status={lead.status} className="shrink-0" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {lead.brandName && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                  {lead.brandName}
                </span>
              )}
              {lead.source && (
                <span className="text-[10px] bg-white/5 text-muted-foreground px-2 py-0.5 rounded-full border border-white/10">
                  {lead.source}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{age}</span>
              {initials && (
                <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                  {initials}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
