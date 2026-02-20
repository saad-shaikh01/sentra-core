'use client';

import { DetailSheet, StatusBadge } from '@/components/shared';
import { useClient } from '@/hooks/use-clients';
import { IClient, ISale } from '@sentra-core/types';
import { AlertCircle } from 'lucide-react';

interface ClientDetailSheetProps {
  clientId: string | null;
  onClose: () => void;
}

export function ClientDetailSheet({ clientId, onClose }: ClientDetailSheetProps) {
  const { data: client, isLoading, isError } = useClient(clientId ?? '');

  return (
    <DetailSheet
      open={!!clientId}
      onClose={onClose}
      title={client?.companyName ?? 'Client Details'}
      description={client?.email}
    >
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 bg-white/10 rounded w-3/4" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load client details. Please try again.</p>
        </div>
      ) : client ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <InfoCard label="Company" value={client.companyName} />
            <InfoCard label="Contact" value={client.contactName ?? '—'} />
            <InfoCard label="Email" value={client.email} />
            <InfoCard label="Phone" value={client.phone ?? '—'} />
          </div>

          {client.address && (
            <InfoCard label="Address" value={client.address} />
          )}
          {client.notes && (
            <InfoCard label="Notes" value={client.notes} />
          )}

          {/* Linked sales if included */}
          {(client as IClient & { sales?: ISale[] }).sales?.length ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Linked Sales
              </h3>
              <div className="space-y-2">
                {(client as IClient & { sales?: ISale[] }).sales!.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10"
                  >
                    <span className="text-sm font-medium">${sale.totalAmount} {sale.currency}</span>
                    <StatusBadge status={sale.status} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </DetailSheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
