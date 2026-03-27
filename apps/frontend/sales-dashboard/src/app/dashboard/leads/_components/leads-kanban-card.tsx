'use client';

import { Draggable } from '@hello-pangea/dnd';
import { ILead } from '@sentra-core/types';
import { StatusBadge } from '@/components/shared';
import { timeAgo } from '@/lib/format-date';
import { cn } from '@/lib/utils';

interface LeadsKanbanCardProps {
  lead: ILead & { brandName?: string; assigneeName?: string };
  index: number;
  onClick: (lead: ILead) => void;
  isDragDisabled?: boolean;
}

export function LeadsKanbanCard({ lead, index, onClick, isDragDisabled }: LeadsKanbanCardProps) {
  const age = timeAgo(lead.leadDate ?? lead.createdAt);

  const initials = lead.assigneeName
    ? lead.assigneeName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <Draggable draggableId={lead.id} index={index} isDragDisabled={isDragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(lead)}
          className={cn(
            "group relative flex flex-col rounded-xl p-4 border transition-all duration-200 select-none",
            "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20 hover:shadow-xl hover:shadow-black/20",
            snapshot.isDragging ? "shadow-2xl shadow-black/50 rotate-[1.5deg] scale-[1.03] z-50 border-primary/40 bg-white/[0.08]" : "cursor-pointer"
          )}
        >
          {/* Top Row: Name & Status */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-[13px] font-bold text-foreground/90 leading-tight line-clamp-2 group-hover:text-foreground transition-colors">
              {lead.name || lead.email || 'No Name'}
            </h3>
            <StatusBadge status={lead.status} className="shrink-0 scale-90 origin-right" />
          </div>

          {/* Middle Row: Phone & Meta Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {lead.phone && (
              <span className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                {lead.phone}
              </span>
            )}
            {lead.brandName && (
              <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-foreground/90">
                {lead.brandName}
              </span>
            )}
            {lead.leadType && (
              <span className="inline-flex items-center rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                {lead.leadType}
              </span>
            )}
            {lead.source && (
              <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {lead.source}
              </span>
            )}
          </div>

          {/* Footer: Assignee & Age */}
          <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black",
                initials ? "bg-primary/20 text-primary ring-1 ring-primary/20" : "bg-white/5 text-muted-foreground ring-1 ring-white/10"
              )}>
                {initials || '?'}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground/70 transition-colors">
                {lead.assigneeName ?? 'Unassigned'}
              </span>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground/60">{age}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
