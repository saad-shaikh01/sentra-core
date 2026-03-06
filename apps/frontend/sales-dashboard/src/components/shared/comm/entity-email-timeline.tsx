'use client';

import { useState } from 'react';
import { Paperclip, ArrowRight, ArrowLeft, Mail, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEntityTimeline } from '@/hooks/use-comm';
import { timeAgo } from '@/lib/format-date';
import { ThreadViewDrawer } from './thread-view-drawer';
import type { CommMessageSummary } from '@/types/comm.types';
import Link from 'next/link';
import { COMM_ENABLED } from '@/lib/feature-flags';

interface EntityEmailTimelineProps {
  entityType: 'lead' | 'client' | 'project';
  entityId: string;
}

export function EntityEmailTimeline({ entityType, entityId }: EntityEmailTimelineProps) {
  const { data: messages, isLoading, isError, refetch } = useEntityTimeline(
    COMM_ENABLED ? entityType : '',
    COMM_ENABLED ? entityId : '',
  );
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  if (!COMM_ENABLED) {
    return (
      <div className="py-10 text-center space-y-2">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Email integration is disabled.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="h-3 bg-white/10 rounded w-1/2" />
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-3 bg-white/10 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-10 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
        <p className="text-sm text-muted-foreground">Failed to load emails.</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="py-10 text-center space-y-3">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No emails yet.</p>
        <p className="text-xs text-muted-foreground/60">
          Connect a Gmail account in{' '}
          <Link href="/dashboard/settings/gmail" className="underline hover:text-foreground">
            Settings
          </Link>{' '}
          to start syncing emails.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {messages.map((msg) => (
          <EmailCard
            key={msg.id}
            message={msg}
            onClick={() => setOpenThreadId(msg.gmailThreadId ?? msg.threadId ?? msg.id)}
          />
        ))}
      </div>

      <ThreadViewDrawer
        threadId={openThreadId}
        onClose={() => setOpenThreadId(null)}
        entityType={entityType}
        entityId={entityId}
      />
    </>
  );
}

function EmailCard({ message, onClick }: { message: CommMessageSummary; onClick: () => void }) {
  const isOutbound = message.isSentByIdentity || message.direction === 'outbound';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all group space-y-1"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
              isOutbound ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {isOutbound ? (
              <ArrowRight className="h-3 w-3" />
            ) : (
              <ArrowLeft className="h-3 w-3" />
            )}
          </span>
          <span className="text-xs font-medium truncate">
            {isOutbound ? 'You' : (message.from.name || message.from.email)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {message.hasAttachments && (
            <Paperclip className="h-3 w-3 text-muted-foreground/50" />
          )}
          <span className="text-[10px] text-muted-foreground/60">
            {message.sentAt ? timeAgo(message.sentAt) : ''}
          </span>
        </div>
      </div>
      <p className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
        {message.subject || '(no subject)'}
      </p>
      {message.snippet && (
        <p className="text-xs text-muted-foreground truncate">{message.snippet}</p>
      )}
    </button>
  );
}
