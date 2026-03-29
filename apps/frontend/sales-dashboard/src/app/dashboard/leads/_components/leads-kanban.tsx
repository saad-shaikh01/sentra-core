'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ILead, LeadStatus, LEAD_STATUS_TRANSITIONS } from '@sentra-core/types';
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
import { toast } from '@/hooks/use-toast';
import { useChangeLeadStatus } from '@/hooks/use-leads';
import { cn } from '@/lib/utils';
import { LeadsKanbanCard } from './leads-kanban-card';

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

const boardViewportStyle = {
  height: 'clamp(26rem, calc(100dvh - 22rem), 44rem)',
} satisfies CSSProperties;

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
  const [activeTab, setActiveTab] = useState<LeadStatus>(LeadStatus.NEW);
  const [isMobile, setIsMobile] = useState(false);
  const [boardScrollState, setBoardScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const minFollowUpDate = new Date().toISOString().split('T')[0];
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const updateBoardScrollState = () => {
      const container = scrollContainerRef.current;

      if (!container) {
        return;
      }

      const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
      const hasOverflow = maxScrollLeft > 8;

      setBoardScrollState({
        hasOverflow,
        canScrollLeft: container.scrollLeft > 8,
        canScrollRight: container.scrollLeft < maxScrollLeft - 8,
      });
    };

    updateBoardScrollState();

    const container = scrollContainerRef.current;
    container?.addEventListener('scroll', updateBoardScrollState, { passive: true });
    window.addEventListener('resize', updateBoardScrollState);

    return () => {
      container?.removeEventListener('scroll', updateBoardScrollState);
      window.removeEventListener('resize', updateBoardScrollState);
    };
  }, [leads.length]);

  const scrollToColumn = (status: LeadStatus) => {
    setActiveTab(status);

    const element = document.getElementById(`kanban-col-${status}`);
    const container = scrollContainerRef.current;

    if (!element || !container) {
      return;
    }

    const targetScroll = element.offsetLeft - 16;
    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  };

  const scrollBoard = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    const offset = Math.max(container.clientWidth * 0.85, 280);
    container.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
    const hasOverflow = maxScrollLeft > 8;

    setBoardScrollState({
      hasOverflow,
      canScrollLeft: container.scrollLeft > 8,
      canScrollRight: container.scrollLeft < maxScrollLeft - 8,
    });

    if (!isMobile) {
      return;
    }

    const scrollLeft = container.scrollLeft;
    const itemWidth = container.clientWidth - 32;
    const index = Math.round(scrollLeft / itemWidth);

    if (COLUMNS[index]) {
      setActiveTab(COLUMNS[index].status);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId, source } = result;

    if (!destination || destination.droppableId === source.droppableId) {
      return;
    }

    const newStatus = destination.droppableId as LeadStatus;
    const lead = leads.find((item) => item.id === draggableId);

    if (!lead) {
      return;
    }

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
      <div className="md:hidden sticky top-20 z-10 mb-4 flex gap-1 overflow-x-auto border-b border-white/5 bg-black/20 px-4 pb-2 backdrop-blur-md no-scrollbar -mx-4">
        {COLUMNS.map(({ status, label }) => {
          const count = leads.filter((lead) => lead.status === status).length;

          return (
            <button
              key={status}
              onClick={() => scrollToColumn(status)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap transition-all',
                activeTab === status
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  activeTab === status ? 'bg-white/20' : 'bg-white/5'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {boardScrollState.hasOverflow && (
        <div className="mb-4 hidden items-center justify-end gap-2 md:flex">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollBoard('left')}
            disabled={!boardScrollState.canScrollLeft}
            className="h-9 w-9 rounded-full"
            aria-label="Scroll kanban left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollBoard('right')}
            disabled={!boardScrollState.canScrollRight}
            className="h-9 w-9 rounded-full"
            aria-label="Scroll kanban right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="relative">
          {boardScrollState.hasOverflow && (
            <>
              <div
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-16 bg-gradient-to-r from-[#09090d] to-transparent transition-opacity duration-200 md:block',
                  boardScrollState.canScrollLeft ? 'opacity-100' : 'opacity-0'
                )}
              />
              <div
                className={cn(
                  'pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-[#09090d] to-transparent transition-opacity duration-200 md:block',
                  boardScrollState.canScrollRight ? 'opacity-100' : 'opacity-0'
                )}
              />
            </>
          )}

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className={cn(
              'flex gap-6 overflow-x-auto overflow-y-hidden pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 transition-all hover:scrollbar-thumb-white/20 -mx-4 px-4 md:mx-0 md:px-0',
              'snap-x snap-mandatory md:snap-none'
            )}
            style={{
              ...boardViewportStyle,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent',
            }}
          >
            {COLUMNS.map(({ status, label }) => {
              const columnLeads = leads.filter((lead) => lead.status === status);

              return (
                <div
                  key={status}
                  id={`kanban-col-${status}`}
                  className="flex h-full w-[85vw] shrink-0 snap-center flex-col md:w-[340px]"
                >
                  <div
                    className={cn(
                      'rounded-t-3xl border border-b-0 border-white/10 bg-white/[0.04] px-5 py-5 backdrop-blur-xl',
                      COLUMN_COLORS[status],
                      'border-t-[6px]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] font-black uppercase tracking-[0.25em] text-foreground/80">
                          {label}
                        </span>
                        <span className="min-w-[24px] rounded-lg bg-white/10 px-2.5 py-1 text-center text-[11px] font-bold text-muted-foreground backdrop-blur-md">
                          {columnLeads.length}
                        </span>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-white/10 animate-pulse" />
                    </div>
                  </div>

                  <Droppable droppableId={status} isDropDisabled={isMobile}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'flex-1 overflow-y-auto overscroll-contain rounded-b-3xl border border-white/10 p-4 transition-all duration-500 ease-out scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10',
                          snapshot.isDraggingOver ? 'border-white/30 bg-white/[0.08] shadow-inner' : 'bg-white/[0.02]'
                        )}
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent',
                        }}
                      >
                        <div className="flex flex-col gap-4 pr-1">
                          {columnLeads.map((lead, index) => (
                            <LeadsKanbanCard
                              key={lead.id}
                              lead={lead}
                              index={index}
                              onClick={onLeadClick}
                              isDragDisabled={isMobile}
                            />
                          ))}
                        </div>
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      <Dialog
        open={pendingFollowUp !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFollowUp(null);
            setFollowUpDate('');
          }
        }}
      >
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

      <Dialog
        open={pendingLost !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLost(null);
            setLostReason('');
          }
        }}
      >
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
