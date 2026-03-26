'use client';

import { useState, useEffect, useRef } from 'react';
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
import { cn } from '@/lib/utils';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: LeadStatus.NEW, label: 'New' },
  { status: LeadStatus.CONTACTED, label: 'Contacted' },
  { status: LeadStatus.PROPOSAL, label: 'Proposal' },
  { status: LeadStatus.FOLLOW_UP, label: 'Follow Up' },
  { status: LeadStatus.WON, label: 'Won' },
  { status: LeadStatus.LOST, label: 'Lost' },
  { status: LeadStatus.NCE, label: 'NCE' },
  { status: LeadStatus.INVALID, label: 'Invalid' },
];

const COLUMN_COLORS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'border-t-blue-500/60',
  [LeadStatus.CONTACTED]: 'border-t-amber-500/60',
  [LeadStatus.PROPOSAL]: 'border-t-purple-500/60',
  [LeadStatus.FOLLOW_UP]: 'border-t-orange-500/60',
  [LeadStatus.WON]: 'border-t-emerald-500/60',
  [LeadStatus.LOST]: 'border-t-red-500/60',
  [LeadStatus.NCE]: 'border-t-slate-500/60',
  [LeadStatus.INVALID]: 'border-t-rose-500/60',
};

interface LeadsKanbanProps {
  leads: Array<ILead & { brandName?: string; assigneeName?: string }>;
  onLeadClick: (lead: ILead) => void;
}

export function LeadsKanban({ leads, onLeadClick }: LeadsKanbanProps) {
  const changeStatus = useChangeLeadStatus();
  const [pendingFollowUp, setPendingFollowUp] = useState<{ leadId: string } | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [pendingLost, setPendingLost] = useState<{ leadId: string } | null>(null);
  const [lostReason, setLostReason] = useState<string>('');
  const minFollowUpDate = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<LeadStatus>(LeadStatus.NEW);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const scrollToColumn = (status: LeadStatus) => {
    setActiveTab(status);
    const element = document.getElementById(`kanban-col-${status}`);
    if (element && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const targetScroll = element.offsetLeft - 16; // 16 is padding
      container.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    if (!isMobile || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.clientWidth - 32; // Approx width of one col including gaps

    const index = Math.round(scrollLeft / itemWidth);
    if (COLUMNS[index]) {
      setActiveTab(COLUMNS[index].status);
    }
  };

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

    if (newStatus === LeadStatus.LOST) {
      setPendingLost({ leadId: lead.id });
      return;
    }

    changeStatus.mutate({ id: draggableId, status: newStatus });
  };

  return (
    <>
      {/* Mobile Column Selector */}
      <div className="md:hidden flex overflow-x-auto no-scrollbar gap-1 mb-4 border-b border-white/5 pb-2 -mx-4 px-4 sticky top-20 bg-black/20 backdrop-blur-md z-10">
        {COLUMNS.map(({ status, label }) => {
          const count = leads.filter((l) => l.status === status).length;
          return (
            <button
              key={status}
              onClick={() => scrollToColumn(status)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                activeTab === status
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                activeTab === status ? "bg-white/20" : "bg-white/5"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={cn(
            "flex gap-4 md:grid md:grid-cols-2 xl:grid-cols-8",
            "overflow-x-auto md:overflow-x-visible pb-6 -mx-4 px-4 md:mx-0 md:px-0",
            "snap-x snap-mandatory md:snap-none no-scrollbar"
          )}
        >
          {COLUMNS.map(({ status, label }) => {
            const columnLeads = leads.filter((l) => l.status === status);
            return (
              <div
                key={status}
                id={`kanban-col-${status}`}
                className="flex flex-col min-h-[400px] w-[85vw] shrink-0 md:w-auto snap-center"
              >
                <div className={`rounded-t-2xl border border-b-0 border-white/10 ${COLUMN_COLORS[status]} border-t-2 px-4 py-3 bg-white/[0.02]`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="text-xs font-bold bg-white/10 rounded-full px-2 py-0.5">{columnLeads.length}</span>
                  </div>
                </div>
                <Droppable droppableId={status} isDropDisabled={isMobile}>
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
                          isDragDisabled={isMobile}
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

      <Dialog open={pendingLost !== null} onOpenChange={(open) => {
        if (!open) {
          setPendingLost(null);
          setLostReason('');
        }
      }}>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingLost(null);
                setLostReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!lostReason.trim() || changeStatus.isPending}
              onClick={() => {
                if (!pendingLost || !lostReason.trim()) {
                  return;
                }

                changeStatus.mutate({
                  id: pendingLost.leadId,
                  status: LeadStatus.LOST,
                  lostReason: lostReason.trim(),
                });
                setPendingLost(null);
                setLostReason('');
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
