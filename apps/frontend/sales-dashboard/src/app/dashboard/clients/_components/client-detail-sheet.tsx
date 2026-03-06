'use client';

import { DetailSheet, StatusBadge } from '@/components/shared';
import { useState } from 'react';
import { useClient } from '@/hooks/use-clients';
import { IClient, ISale } from '@sentra-core/types';
import { AlertCircle, Mail } from 'lucide-react';
import { EntityEmailTimeline } from '@/components/shared/comm/entity-email-timeline';

interface ClientDetailSheetProps {
  clientId: string | null;
  onClose: () => void;
}

export function ClientDetailSheet({ clientId, onClose }: ClientDetailSheetProps) {
  const { data: client, isLoading, isError } = useClient(clientId ?? '');
  const [activeTab, setActiveTab] = useState<'details' | 'emails'>('details');

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
          {/* Tab switcher */}
          <div className="flex border-b border-white/10 -mt-2 mb-2">
            {(['details', 'emails'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 capitalize ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'emails' && <Mail className="h-3.5 w-3.5" />}
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'emails' && clientId ? (
            <EntityEmailTimeline entityType="client" entityId={clientId} />
          ) : activeTab === 'details' && (
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
          )}
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
