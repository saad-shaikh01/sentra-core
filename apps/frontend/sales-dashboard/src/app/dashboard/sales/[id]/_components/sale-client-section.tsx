'use client';

import { useState } from 'react';
import { User, Mail, Phone, ExternalLink, AlertTriangle, X } from 'lucide-react';
import { ISaleWithRelations } from '@sentra-core/types';
import { ClientDetailSheet } from '@/app/dashboard/clients/_components/client-detail-sheet';

interface SaleClientSectionProps {
  sale: ISaleWithRelations;
  collisionWarning?: { matched: boolean; matchedClientId: string; matchedClientName: string } | null;
}

export function SaleClientSection({ sale, collisionWarning }: SaleClientSectionProps) {
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const client = sale.client;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Client</h3>

      {collisionWarning && !warningDismissed ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-300">Client Collision Warning</p>
            <p className="text-amber-200/80 mt-0.5">
              This sale was linked to client &quot;{collisionWarning.matchedClientName}&quot; via email match.
              Please verify this is the correct client.
            </p>
          </div>
          <button onClick={() => setWarningDismissed(true)} className="text-amber-400 hover:text-amber-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {client ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">{client.companyName}</p>
              {client.contactName ? <p className="text-xs text-muted-foreground">{client.contactName}</p> : null}
            </div>
          </div>
          {client.email ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{client.email}</span>
            </div>
          ) : null}
          {client.phone ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{client.phone}</span>
            </div>
          ) : null}
          <button
            onClick={() => setClientSheetOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            View client profile <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No client linked</p>
      )}
      {client && (
        <ClientDetailSheet
          clientId={clientSheetOpen ? client.id : null}
          onClose={() => setClientSheetOpen(false)}
        />
      )}
    </div>
  );
}
