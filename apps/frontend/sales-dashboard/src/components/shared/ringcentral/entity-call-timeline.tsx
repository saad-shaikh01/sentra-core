'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useRingCentralCalls,
  useUpdateRingCentralCallAnnotation,
} from '@/hooks/use-comm';
import { RingCentralCallButton } from './ringcentral-call-button';
import { timeAgo } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { RingCentralTrackedCall } from '@/types/comm.types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type EntityCallTimelineProps = {
  entityType: 'lead' | 'client';
  entityId: string;
  phoneNumber?: string | null;
  contactName?: string;
  brandId?: string;
};

export function EntityCallTimeline({
  entityType,
  entityId,
  phoneNumber,
  contactName,
  brandId,
}: EntityCallTimelineProps) {
  const { data: calls, isLoading, isError, refetch } = useRingCentralCalls(
    { entityType, entityId, status: 'all', limit: 20 },
    { enabled: !!entityId },
  );

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((index) => (
          <div key={index} className="h-20 rounded-xl bg-white/[0.03] border border-white/10" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-10 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
        <p className="text-sm text-muted-foreground">Failed to load call history.</p>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Call History</p>
          {phoneNumber ? (
            <RingCentralCallButton
              phoneNumber={phoneNumber}
              contactName={contactName}
              brandId={brandId}
              entityType={entityType}
              entityId={entityId}
              showLabel={true}
              className="h-8 px-3"
            />
          ) : null}
        </div>
        <div className="py-8 text-center space-y-2">
          <Phone className="h-7 w-7 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No calls logged yet</p>
          <p className="text-xs text-muted-foreground/60">
            Calls linked to this record will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Call History</p>
        {phoneNumber ? (
          <RingCentralCallButton
            phoneNumber={phoneNumber}
            contactName={contactName}
            brandId={brandId}
            entityType={entityType}
            entityId={entityId}
            showLabel={true}
            className="h-8 px-3"
          />
        ) : null}
      </div>

      <div className="space-y-2">
        {calls.map((call) => (
          <CallHistoryCard key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

function CallHistoryCard({ call }: { call: RingCentralTrackedCall }) {
  const updateCallAnnotation = useUpdateRingCentralCallAnnotation();
  const [isEditing, setIsEditing] = useState(false);
  const [disposition, setDisposition] = useState(call.disposition ?? '');
  const [notes, setNotes] = useState(call.notes ?? '');

  useEffect(() => {
    setDisposition(call.disposition ?? '');
    setNotes(call.notes ?? '');
  }, [call.disposition, call.notes]);

  const DirectionIcon = resolveDirectionIcon(call);
  const contactLabel =
    call.contactName ??
    call.toName ??
    call.fromName ??
    call.matchedPhoneNumber ??
    call.toPhoneNumber;
  const callTimestamp = call.eventTime ?? call.createdAt;
  const hasAnnotation = Boolean(call.disposition || call.notes);

  const handleSave = async () => {
    await updateCallAnnotation.mutateAsync({
      callId: call.id,
      dto: {
        disposition: disposition || undefined,
        notes: notes || undefined,
      },
    });
    setIsEditing(false);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', resolveIconTone(call))}>
              <DirectionIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{contactLabel}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatCallRoute(call)}
              </p>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatStatusLabel(call)}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            {callTimestamp ? timeAgo(callTimestamp) : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {call.connectionLabel ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
            {call.connectionLabel}
          </span>
        ) : null}
        {call.direction ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
            {call.direction}
          </span>
        ) : null}
        {call.missedCall ? (
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300">
            Missed call
          </span>
        ) : null}
        {call.source ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
            {call.source}
          </span>
        ) : null}
        {call.disposition ? (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
            {formatDisposition(call.disposition)}
          </span>
        ) : null}
      </div>

      {call.failureReason ? (
        <p className="text-xs text-red-300">{call.failureReason}</p>
      ) : null}

      {call.notes ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {call.notes}
          </p>
          {call.notesUpdatedAt ? (
            <p className="mt-2 text-[10px] text-muted-foreground/60">
              Updated {timeAgo(call.notesUpdatedAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {isEditing ? (
        <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Call disposition
            </p>
            <Select value={disposition || 'none'} onValueChange={(value) => setDisposition(value === 'none' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a disposition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No disposition</SelectItem>
                {CALL_DISPOSITIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Call notes
            </p>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Capture outcome, objections, and next step."
              rows={4}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={updateCallAnnotation.isPending}
              onClick={() => void handleSave()}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {updateCallAnnotation.isPending ? 'Saving...' : 'Save notes'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setIsEditing(true)}
          >
            {hasAnnotation ? 'Edit call log' : 'Log call'}
          </Button>
        </div>
      )}
    </div>
  );
}

const CALL_DISPOSITIONS = [
  { value: 'connected', label: 'Connected' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'follow_up_required', label: 'Follow-up required' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong_number', label: 'Wrong number' },
];

function resolveDirectionIcon(call: RingCentralTrackedCall) {
  if (call.missedCall) {
    return PhoneMissed;
  }

  return call.direction === 'Inbound' ? PhoneIncoming : PhoneOutgoing;
}

function resolveIconTone(call: RingCentralTrackedCall): string {
  if (call.missedCall || call.callStatus === 'failed') {
    return 'bg-red-500/10 text-red-300';
  }

  return call.direction === 'Inbound'
    ? 'bg-emerald-500/10 text-emerald-300'
    : 'bg-sky-500/10 text-sky-300';
}

function formatCallRoute(call: RingCentralTrackedCall): string {
  const from = call.fromPhoneNumber ?? call.fromName ?? 'Unknown';
  const to = call.toPhoneNumber ?? call.toName ?? 'Unknown';
  return `${from} to ${to}`;
}

function formatStatusLabel(call: RingCentralTrackedCall): string {
  if (call.missedCall) {
    return 'Missed';
  }

  return call.callStatus
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDisposition(disposition: string): string {
  return disposition
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
