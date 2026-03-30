'use client';

import { Loader2, PhoneCall, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import {
  useCancelRingCentralCall,
  useRingCentralActiveCalls,
  useRingCentralCalls,
  useRingCentralConnections,
} from '@/hooks/use-comm';
import { COMM_ENABLED } from '@/lib/feature-flags';
import type {
  RingCentralActiveCall,
  RingCentralTrackedCall,
} from '@/types/comm.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 4_000;

export function RingCentralCallDock() {
  const { data: connections } = useRingCentralConnections();
  const hasConnections = (connections?.length ?? 0) > 0;
  const { data: trackedCalls, isFetching: isFetchingTrackedCalls } = useRingCentralCalls(
    { status: 'open', limit: 5 },
    {
      enabled: COMM_ENABLED && hasConnections,
      refetchInterval: POLL_INTERVAL_MS,
    },
  );
  const { data: activeCalls, isFetching: isFetchingActiveCalls } = useRingCentralActiveCalls(
    undefined,
    {
      enabled: COMM_ENABLED && hasConnections,
      refetchInterval: POLL_INTERVAL_MS,
    },
  );
  const cancelCall = useCancelRingCentralCall();

  if (!COMM_ENABLED || !hasConnections) {
    return null;
  }

  const dialingCalls = (trackedCalls ?? []).filter(
    (call) => call.callStatus === 'queued' || call.callStatus === 'dialing',
  );
  const liveCalls = activeCalls ?? [];

  if (dialingCalls.length === 0 && liveCalls.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm">
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0f1117]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              RingCentral
            </p>
            <h3 className="mt-1 text-sm font-semibold text-foreground">
              Live calling
            </h3>
          </div>
          {isFetchingTrackedCalls || isFetchingActiveCalls ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {dialingCalls.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Connecting
            </p>
            {dialingCalls.map((call) => (
              <QueuedCallRow
                key={call.id}
                call={call}
                onCancel={(id) => cancelCall.mutate(id)}
                isCanceling={cancelCall.isPending}
              />
            ))}
          </div>
        ) : null}

        {liveCalls.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active
            </p>
            {liveCalls.map((call) => (
              <ActiveCallRow key={call.id} call={call} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QueuedCallRow({
  call,
  onCancel,
  isCanceling,
}: {
  call: RingCentralTrackedCall;
  onCancel: (id: string) => void;
  isCanceling: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <p className="truncate text-sm font-medium text-foreground">
              {call.contactName ?? call.toPhoneNumber}
            </p>
          </div>
          {call.contactName ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {call.toPhoneNumber}
            </p>
          ) : null}
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {call.connectionLabel ?? 'RingCentral'}{call.fromPhoneNumber ? ` · ${call.fromPhoneNumber}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={call.callStatus === 'dialing' ? 'default' : 'outline'}>
            {call.callStatus === 'dialing' ? 'Dialing' : 'Queued'}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-300"
            disabled={isCanceling}
            onClick={() => onCancel(call.id)}
            aria-label="Cancel RingCentral call"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {call.failureReason ? (
        <p className="mt-2 text-xs text-red-300">{call.failureReason}</p>
      ) : null}
    </div>
  );
}

function ActiveCallRow({ call }: { call: RingCentralActiveCall }) {
  const normalizedDirection = call.direction?.toLowerCase();
  const DirectionIcon =
    normalizedDirection === 'inbound' ? PhoneIncoming : PhoneOutgoing;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DirectionIcon className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <p className="truncate text-sm font-medium text-foreground">
              {call.toName || call.toPhoneNumber || 'Live call'}
            </p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatActiveCallParties(call)}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {call.connectionLabel ?? 'RingCentral'}{call.duration != null ? ` · ${formatDuration(call.duration)}` : ''}
          </p>
        </div>

        <Badge variant="success">Live</Badge>
      </div>
    </div>
  );
}

function formatActiveCallParties(call: RingCentralActiveCall): string {
  const from = call.fromName || call.fromPhoneNumber || 'Unknown';
  const to = call.toName || call.toPhoneNumber || 'Unknown';
  return `${from} to ${to}`;
}

function formatDuration(durationInSeconds: number): string {
  const minutes = Math.floor(durationInSeconds / 60);
  const seconds = durationInSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
