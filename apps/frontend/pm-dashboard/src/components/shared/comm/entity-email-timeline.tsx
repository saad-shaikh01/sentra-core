'use client';

import { useEffect, useState } from 'react';
import { Paperclip, ArrowRight, ArrowLeft, Mail, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEntityTimeline } from '@/hooks/use-comm';
import { useDebounce } from '@/hooks/use-debounce';
import { timeAgo } from '@/lib/format-date';
import { ThreadViewDrawer } from './thread-view-drawer';
import type { CommMessageSummary } from '@/types/comm.types';
import { COMM_ENABLED } from '@/lib/feature-flags';

interface EntityEmailTimelineProps {
  entityType: 'lead' | 'client' | 'project';
  entityId: string;
}

export function EntityEmailTimeline({ entityType, entityId }: EntityEmailTimelineProps) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CommMessageSummary[]>([]);
  const debouncedSearch = useDebounce(search, 300);
  const { data: timeline, isLoading, isError, refetch, isFetching } = useEntityTimeline(
    COMM_ENABLED ? entityType : '',
    COMM_ENABLED ? entityId : '',
    COMM_ENABLED
      ? {
          page,
          limit: 10,
          search: debouncedSearch || undefined,
          filter,
        }
      : undefined,
  );
  const messages = items;
  const hasMore = (timeline?.meta.totalPages ?? 1) > page;

  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [debouncedSearch, entityId, entityType, filter]);

  useEffect(() => {
    if (!timeline) return;

    setItems((previous) => {
      if (page === 1) {
        return timeline.data;
      }

      const seenIds = new Set(previous.map((item) => item.id));
      return [
        ...previous,
        ...timeline.data.filter((item) => !seenIds.has(item.id)),
      ];
    });
  }, [page, timeline]);

  if (!COMM_ENABLED) {
    return (
      <div className="py-10 text-center space-y-2">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Email integration is disabled.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email timeline"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === value
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'border border-white/10 text-muted-foreground hover:text-foreground'
                }`}
              >
                {value === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((value) => (
              <div key={value} className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="h-3 bg-white/10 rounded w-1/2" />
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
            <p className="text-sm text-muted-foreground">Failed to load emails.</p>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <Mail className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No emails linked to this {entityType} yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Connect Gmail accounts in the Sales Dashboard to sync emails.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <EmailCard
                key={msg.id}
                message={msg}
                onClick={() => setOpenThreadId(msg.gmailThreadId ?? msg.threadId ?? msg.id)}
              />
            ))}
          </div>
        )}

        {hasMore && !isError && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={isFetching}
            >
              {isFetching ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
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
