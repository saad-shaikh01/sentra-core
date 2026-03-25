'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ISaleActivity, SaleActivityType } from '@sentra-core/types';
import { useAddSaleNote } from '@/hooks/use-sales';
import { MessageSquarePlus } from 'lucide-react';

interface SaleActivityTimelineProps {
  activities: ISaleActivity[];
  saleId: string;
}

const ACTIVITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  [SaleActivityType.CREATED]: { label: 'Sale Created', color: 'text-blue-400', dot: 'bg-blue-500' },
  [SaleActivityType.STATUS_CHANGE]: { label: 'Status Changed', color: 'text-blue-400', dot: 'bg-blue-500' },
  [SaleActivityType.INVOICE_CREATED]: { label: 'Invoice Generated', color: 'text-blue-400', dot: 'bg-blue-500' },
  [SaleActivityType.INVOICE_UPDATED]: { label: 'Invoice Updated', color: 'text-blue-400', dot: 'bg-blue-400' },
  [SaleActivityType.PAYMENT_RECEIVED]: { label: 'Payment Received', color: 'text-emerald-400', dot: 'bg-emerald-500' },
  [SaleActivityType.PAYMENT_FAILED]: { label: 'Payment Failed', color: 'text-red-400', dot: 'bg-red-500' },
  [SaleActivityType.REFUND_ISSUED]: { label: 'Refund Issued', color: 'text-purple-400', dot: 'bg-purple-500' },
  [SaleActivityType.CHARGEBACK_FILED]: { label: 'Chargeback Filed', color: 'text-red-400', dot: 'bg-red-500' },
  [SaleActivityType.NOTE]: { label: 'Note Added', color: 'text-slate-400', dot: 'bg-slate-500' },
  [SaleActivityType.MANUAL_ADJUSTMENT]: { label: 'Manual Adjustment', color: 'text-orange-400', dot: 'bg-orange-500' },
  [SaleActivityType.DISCOUNT_APPLIED]: { label: 'Discount Applied', color: 'text-amber-400', dot: 'bg-amber-500' },
};

function formatActivityData(type: string, data: Record<string, unknown> | null): string {
  if (!data) return '';
  try {
    switch (type) {
      case SaleActivityType.CREATED:
        return `Sale created with status ${data.status ?? ''}${data.totalAmount ? `, total $${data.totalAmount}` : ''}`;
      case SaleActivityType.STATUS_CHANGE:
        return data.to
          ? `Status changed from ${data.from ?? '?'} → ${data.to}`
          : data.action === 'ARCHIVED' ? 'Sale archived' : `Status changed`;
      case SaleActivityType.PAYMENT_RECEIVED:
        return `Payment of $${data.amount ?? '?'} received${data.transactionId ? ` (Ref: ${String(data.transactionId).slice(0, 10)})` : ''}`;
      case SaleActivityType.PAYMENT_FAILED:
        return `Payment of $${data.amount ?? '?'} failed${data.reason ? ` — ${data.reason}` : ''}`;
      case SaleActivityType.REFUND_ISSUED:
        return `Refund of $${data.amount ?? '?'} issued`;
      case SaleActivityType.CHARGEBACK_FILED:
        return `Chargeback of $${data.amount ?? '?'} filed${data.notes ? ` — ${data.notes}` : ''}`;
      case SaleActivityType.NOTE:
        return String(data.note ?? '');
      case SaleActivityType.DISCOUNT_APPLIED:
        return `Discount applied${data.discountValue ? ` (${data.discountValue}${data.discountType === 'PERCENTAGE' ? '%' : ''})` : ''}`;
      case SaleActivityType.INVOICE_CREATED:
        return `Invoice ${data.invoiceNumber ?? ''} created${data.amount ? ` for $${data.amount}` : ''}`;
      case SaleActivityType.INVOICE_UPDATED:
        return `Invoice ${data.invoiceNumber ?? ''} updated${data.status ? `: ${data.status}` : ''}`;
      default:
        return '';
    }
  } catch {
    return '';
  }
}

function ActivityEntry({ activity }: { activity: ISaleActivity }) {
  const config = ACTIVITY_CONFIG[activity.type] ?? { label: activity.type, color: 'text-muted-foreground', dot: 'bg-muted' };
  const summary = formatActivityData(activity.type, activity.data);
  const actorLabel = !activity.userId || activity.userId === 'system' ? 'System' : activity.userId.slice(0, 8);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${config.dot}`} />
        <div className="w-px flex-1 bg-white/10 mt-1" />
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
          <span className="text-[10px] text-muted-foreground">by {actorLabel}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(activity.createdAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
        </div>
        {summary ? (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{summary}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SaleActivityTimeline({ activities, saleId }: SaleActivityTimelineProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const addNote = useAddSaleNote();

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote.mutateAsync({ id: saleId, note: noteText.trim() });
    setNoteText('');
    setNoteOpen(false);
  };

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Activity</h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setNoteOpen(true)}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> Add Note
          </Button>
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="mt-2">
            {activities.map((activity) => (
              <ActivityEntry key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={noteOpen} onOpenChange={(open) => { setNoteOpen(open); if (!open) setNoteText(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Textarea
              placeholder="Enter a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">{noteText.length} / 2000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNote} disabled={!noteText.trim() || addNote.isPending}>
              {addNote.isPending ? 'Saving...' : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
