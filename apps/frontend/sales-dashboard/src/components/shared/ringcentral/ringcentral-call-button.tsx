'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, PhoneCall } from 'lucide-react';
import {
  useRingCentralConnections,
  useStartRingCentralCall,
} from '@/hooks/use-comm';
import { cn } from '@/lib/utils';
import type {
  RingCentralConnection,
  StartRingCentralCallDto,
} from '@/types/comm.types';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type RingCentralCallButtonProps = {
  phoneNumber?: string | null;
  contactName?: string;
  brandId?: string;
  entityType?: StartRingCentralCallDto['entityType'];
  entityId?: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
  disabled?: boolean;
} & Pick<ButtonProps, 'size' | 'variant'>;

export function RingCentralCallButton({
  phoneNumber,
  contactName,
  brandId,
  entityType,
  entityId,
  label = 'Call',
  showLabel = false,
  className,
  disabled,
  size,
  variant = 'outline',
}: RingCentralCallButtonProps) {
  const { data: connections, isLoading } = useRingCentralConnections();
  const startCall = useStartRingCentralCall();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedFromPhoneNumber, setSelectedFromPhoneNumber] = useState('');

  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const candidateConnections = useMemo(
    () => getCandidateConnections(connections ?? [], brandId),
    [brandId, connections],
  );
  const primaryConnection = useMemo(
    () => getPrimaryConnection(candidateConnections),
    [candidateConnections],
  );
  const selectedConnection =
    candidateConnections.find((connection) => connection.id === selectedConnectionId) ??
    primaryConnection;
  const outboundPhoneNumbers = useMemo(
    () => (selectedConnection ? getOutboundPhoneNumbers(selectedConnection) : []),
    [selectedConnection],
  );
  const resolvedSize = size ?? (showLabel ? 'sm' : 'icon');
  const cannotCall =
    disabled ||
    !normalizedPhoneNumber ||
    isLoading ||
    candidateConnections.length === 0;

  useEffect(() => {
    if (!dialogOpen || !primaryConnection) {
      return;
    }

    if (
      !selectedConnectionId ||
      !candidateConnections.some((connection) => connection.id === selectedConnectionId)
    ) {
      setSelectedConnectionId(primaryConnection.id);
    }
  }, [candidateConnections, dialogOpen, primaryConnection, selectedConnectionId]);

  useEffect(() => {
    if (!dialogOpen || !selectedConnection) {
      return;
    }

    const preferredFromPhoneNumber =
      getPreferredOutboundPhoneNumber(selectedConnection) ?? '';

    if (
      !selectedFromPhoneNumber ||
      !outboundPhoneNumbers.includes(selectedFromPhoneNumber)
    ) {
      setSelectedFromPhoneNumber(preferredFromPhoneNumber);
    }
  }, [dialogOpen, outboundPhoneNumbers, selectedConnection, selectedFromPhoneNumber]);

  const handleClick = async () => {
    if (!normalizedPhoneNumber || candidateConnections.length === 0) {
      return;
    }

    if (candidateConnections.length === 1) {
      const connection = candidateConnections[0];
      const availableNumbers = getOutboundPhoneNumbers(connection);
      if (availableNumbers.length <= 1) {
        try {
          await startCallWithConnection(connection, availableNumbers[0]);
        } catch {
          return;
        }
        return;
      }
    }

    if (primaryConnection) {
      setSelectedConnectionId(primaryConnection.id);
      setSelectedFromPhoneNumber(getPreferredOutboundPhoneNumber(primaryConnection) ?? '');
    }
    setDialogOpen(true);
  };

  const handleStartSelectedCall = async () => {
    if (!selectedConnection) {
      return;
    }

    try {
      await startCallWithConnection(
        selectedConnection,
        selectedFromPhoneNumber || outboundPhoneNumbers[0],
      );
      setDialogOpen(false);
    } catch {
      return;
    }
  };

  const startCallWithConnection = async (
    connection: RingCentralConnection,
    fromPhoneNumber?: string,
  ) => {
    if (!normalizedPhoneNumber) {
      return;
    }

    await startCall.mutateAsync({
      toPhoneNumber: normalizedPhoneNumber,
      ...(fromPhoneNumber ? { fromPhoneNumber } : {}),
      connectionId: connection.id,
      brandId: brandId ?? connection.brandId,
      contactName,
      entityType,
      entityId,
    });
  };

  const title = !normalizedPhoneNumber
    ? 'No phone number available'
    : candidateConnections.length === 0 && !isLoading
      ? 'Connect RingCentral in settings first'
      : undefined;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={resolvedSize}
        className={cn(showLabel ? 'gap-2' : 'shrink-0', className)}
        disabled={cannotCall || startCall.isPending}
        onClick={() => {
          void handleClick();
        }}
        title={title}
        aria-label={
          contactName
            ? `Call ${contactName}`
            : normalizedPhoneNumber
              ? `Call ${normalizedPhoneNumber}`
              : 'Call contact'
        }
      >
        {startCall.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PhoneCall className="h-4 w-4" />
        )}
        {showLabel ? <span>{label}</span> : null}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {contactName ? `Call ${contactName}` : 'Start RingCentral call'}
            </DialogTitle>
            <DialogDescription>
              Choose which RingCentral extension and outbound number to use for{' '}
              {normalizedPhoneNumber ?? 'this call'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dialing
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {contactName ?? normalizedPhoneNumber ?? '-'}
              </p>
              {contactName && normalizedPhoneNumber ? (
                <p className="mt-1 text-xs text-muted-foreground">{normalizedPhoneNumber}</p>
              ) : null}
            </div>

            {candidateConnections.length > 1 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Extension
                </p>
                <Select
                  value={selectedConnection?.id ?? ''}
                  onValueChange={setSelectedConnectionId}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select a RingCentral extension" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateConnections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {formatConnectionLabel(connection)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Outbound Number
              </p>
              {outboundPhoneNumbers.length > 1 ? (
                <Select
                  value={selectedFromPhoneNumber}
                  onValueChange={setSelectedFromPhoneNumber}
                >
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue placeholder="Select an outbound number" />
                  </SelectTrigger>
                  <SelectContent>
                    {outboundPhoneNumbers.map((outboundPhoneNumber) => (
                      <SelectItem key={outboundPhoneNumber} value={outboundPhoneNumber}>
                        {outboundPhoneNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground">
                  {outboundPhoneNumbers[0] ?? 'RingCentral default routing'}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={startCall.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={!selectedConnection || startCall.isPending}
              onClick={() => {
                void handleStartSelectedCall();
              }}
            >
              {startCall.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneCall className="h-4 w-4" />
              )}
              <span>Start Call</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getCandidateConnections(
  connections: RingCentralConnection[],
  brandId?: string,
): RingCentralConnection[] {
  if (!brandId) {
    return connections;
  }

  const brandMatches = connections.filter((connection) => connection.brandId === brandId);
  return brandMatches.length > 0 ? brandMatches : connections;
}

function getPrimaryConnection(
  connections: RingCentralConnection[],
): RingCentralConnection | undefined {
  return connections.find((connection) => connection.isDefault) ?? connections[0];
}

function getOutboundPhoneNumbers(connection: RingCentralConnection): string[] {
  const values = [
    connection.defaultOutboundPhoneNumber,
    ...connection.directPhoneNumbers,
    ...connection.phoneNumbers.map((record) => record.phoneNumber),
    connection.mainPhoneNumber,
  ];

  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function getPreferredOutboundPhoneNumber(
  connection: RingCentralConnection,
): string | undefined {
  return (
    connection.defaultOutboundPhoneNumber?.trim() ||
    connection.directPhoneNumbers.find((value) => Boolean(value?.trim()))?.trim() ||
    connection.phoneNumbers
      .map((record) => record.phoneNumber?.trim())
      .find((value): value is string => Boolean(value)) ||
    connection.mainPhoneNumber?.trim()
  );
}

function formatConnectionLabel(connection: RingCentralConnection): string {
  const primary =
    connection.displayName || connection.email || connection.extensionNumber || 'Extension';
  const secondary = connection.defaultOutboundPhoneNumber || connection.mainPhoneNumber;

  return secondary ? `${primary} · ${secondary}` : primary;
}

function normalizePhoneNumber(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
