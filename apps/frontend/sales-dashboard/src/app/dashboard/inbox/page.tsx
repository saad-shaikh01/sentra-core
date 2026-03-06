'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Mail, Inbox as InboxIcon, Circle, Archive, ChevronDown, ChevronRight, Paperclip, AlertCircle, RefreshCw } from 'lucide-react';
import { useThreads, useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useIdentities } from '@/hooks/use-comm';
import { useDebounce } from '@/hooks/use-debounce';
import { timeAgo } from '@/lib/format-date';
import { useUIStore } from '@/stores/ui-store';
import { ComposeDrawer } from '@/components/shared/comm/compose-drawer';
import { Button } from '@/components/ui/button';
import type { CommThread, CommMessage, CommIdentity } from '@/types/comm.types';
import { COMM_ENABLED } from '@/lib/feature-flags';

type Filter = 'all' | 'unread' | 'sent' | 'archived';

export default function InboxPage() {
  if (!COMM_ENABLED) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] space-y-3">
        <Mail className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Email integration is not enabled.</p>
      </div>
    );
  }
  return <InboxContent />;
}

function InboxContent() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [identityFilter, setIdentityFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const clearCommUnread = useUIStore((s) => s.clearCommUnread);
  const { data: identities } = useIdentities();

  // Clear unread badge when inbox is visited
  useEffect(() => {
    clearCommUnread();
  }, []);

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreads({ search: debouncedSearch || undefined, filter, identityId: identityFilter || undefined });

  const threads = data?.pages.flatMap((p) => p.data) ?? [];

  // Keyboard shortcut: 'c' to compose
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'c' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      setComposeOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Sent', value: 'sent' },
    { label: 'Archived', value: 'archived' },
  ];

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 rounded-2xl overflow-hidden border border-white/10">
      {/* Left column — thread list */}
      <div className="w-[340px] shrink-0 flex flex-col border-r border-white/10 bg-black/20 backdrop-blur-sm">
        {/* Search */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-white/10">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === f.value
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Identity filter */}
        {identities && identities.length > 1 && (
          <div className="px-4 py-2 border-b border-white/10">
            <select
              value={identityFilter}
              onChange={(e) => setIdentityFilter(e.target.value)}
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-white/30"
            >
              <option value="">All accounts</option>
              {identities.map((id: CommIdentity) => (
                <option key={id.id} value={id.id}>
                  {id.displayName || id.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-1 p-2 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center space-y-3 px-4">
              <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
              <p className="text-sm text-muted-foreground">Failed to load emails.</p>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : threads.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <InboxIcon className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No emails found.</p>
            </div>
          ) : (
            <>
              {threads.map((thread: CommThread) => {
                const tid = thread.id ?? thread.gmailThreadId ?? '';
                const isSelected = tid === selectedThreadId;
                const hasUnread = thread.hasUnread || !thread.isRead;
                return (
                  <button
                    key={tid}
                    onClick={() => setSelectedThreadId(tid)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all group ${
                      isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {hasUnread && (
                        <Circle className="h-2 w-2 mt-1.5 fill-primary text-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs truncate ${hasUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                            {thread.participants?.[0]?.name || thread.participants?.[0]?.email || 'Unknown'}
                          </p>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">
                            {thread.latestMessageAt || thread.lastMessageAt
                              ? timeAgo(thread.latestMessageAt ?? thread.lastMessageAt!)
                              : ''}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${hasUnread ? 'font-medium text-foreground' : 'text-foreground/70'}`}>
                          {thread.subject || '(no subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {thread.snippet}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right column — thread detail */}
      <div className="flex-1 flex items-center justify-center bg-black/10 overflow-y-auto">
        {selectedThreadId ? (
          <InlineThreadView threadId={selectedThreadId} onClose={() => setSelectedThreadId(null)} />
        ) : (
          <div className="text-center space-y-3">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Select a thread to read</p>
            <p className="text-xs text-muted-foreground/50">Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs">c</kbd> to compose</p>
          </div>
        )}
      </div>

      <ComposeDrawer open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

function InlineThreadView({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { data: thread, isLoading: threadLoading, isError: threadError } = useThread(threadId);
  const { data: messagesRes, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useMessages({ threadId });
  const { data: identities } = useIdentities();
  const replyMutation = useReplyToMessage();
  const archiveMutation = useArchiveThread();
  const markRead = useMarkThreadRead();

  const [replyBody, setReplyBody] = useState('');
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (thread?.hasUnread) markRead.mutate(threadId);
  }, [threadId]);

  useEffect(() => {
    if (identities && identities.length > 0 && !selectedIdentityId) {
      const def = identities.find((i) => i.isDefault) ?? identities[0];
      setSelectedIdentityId(def.id);
    }
  }, [identities]);

  useEffect(() => {
    if (lastMessage) {
      const id = lastMessage.id ?? lastMessage.gmailMessageId ?? '';
      setExpandedIds(new Set([id]));
    }
  }, [lastMessage?.id]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !lastMessage) return;
    const messageId = lastMessage.gmailMessageId ?? lastMessage.id ?? '';
    await replyMutation.mutateAsync({ messageId, dto: { identityId: selectedIdentityId, bodyText: replyBody } });
    setReplyBody('');
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex-1 min-w-0">
          {threadLoading ? <div className="h-5 w-48 bg-white/10 rounded animate-pulse" /> : (
            <>
              <h2 className="text-base font-semibold truncate">{thread?.subject || '(no subject)'}</h2>
              <p className="text-xs text-muted-foreground">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
                {thread?.latestMessageAt && ` · ${timeAgo(thread.latestMessageAt)}`}
              </p>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => archiveMutation.mutate(threadId)}>
          <Archive className="h-4 w-4 mr-1" /> Archive
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {threadError || messagesError ? (
          <div className="py-12 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
            <p className="text-sm text-muted-foreground">Failed to load thread.</p>
            <Button variant="ghost" size="sm" onClick={() => refetchMessages()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : messagesLoading ? (
          <div className="space-y-3 animate-pulse">{[1, 2].map((i) => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}</div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Mail className="h-8 w-8 mx-auto text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No messages in this thread.</p>
          </div>
        ) : messages.map((msg, idx) => {
          const msgId = msg.id ?? msg.gmailMessageId ?? String(idx);
          return (
            <InlineMessageItem
              key={msgId}
              message={msg}
              isExpanded={expandedIds.has(msgId) || idx === messages.length - 1}
              onToggle={() => toggleExpand(msgId)}
            />
          );
        })}
      </div>

      {/* Reply */}
      <div className="px-6 py-4 border-t border-white/10 space-y-3 shrink-0">
        {identities && identities.length > 0 && (
          <select value={selectedIdentityId} onChange={(e) => setSelectedIdentityId(e.target.value)}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none">
            {identities.map((id: CommIdentity) => (
              <option key={id.id} value={id.id}>{id.displayName} &lt;{id.email}&gt;</option>
            ))}
          </select>
        )}
        <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply..." rows={3}
          className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none" />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleReply} disabled={!replyBody.trim() || replyMutation.isPending || !selectedIdentityId}>
            {replyMutation.isPending ? 'Sending...' : 'Reply'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InlineMessageItem({ message, isExpanded, onToggle }: { message: CommMessage; isExpanded: boolean; onToggle: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isExpanded || !message.bodyHtml || !iframeRef.current) return;
    const iframe = iframeRef.current;
    iframe.srcdoc = message.bodyHtml;
    const onLoad = () => {
      if (iframe.contentDocument?.body) iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + 'px';
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [isExpanded, message.bodyHtml]);

  const fromLabel = message.from?.name || message.from?.email || 'Unknown';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
            {fromLabel[0]?.toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-medium truncate">{fromLabel}</p>
            {!isExpanded && <p className="text-xs text-muted-foreground truncate">{message.snippet || message.bodyText?.slice(0, 80)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {message.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 text-muted-foreground/50" />}
          <span className="text-[10px] text-muted-foreground/60">{message.sentAt ? timeAgo(message.sentAt) : ''}</span>
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10">
          <div className="pt-3 text-xs text-muted-foreground">
            <p><span className="font-medium">From:</span> {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}</p>
            {message.to?.length > 0 && <p><span className="font-medium">To:</span> {message.to.map((a) => a.email).join(', ')}</p>}
          </div>
          <div className="rounded-lg overflow-hidden border border-white/10">
            {message.bodyHtml ? (
              <iframe ref={iframeRef} sandbox="allow-same-origin" referrerPolicy="no-referrer" className="w-full min-h-[100px] bg-white" style={{ border: 'none' }} />
            ) : (
              <pre className="text-xs text-foreground/80 p-3 whitespace-pre-wrap leading-relaxed font-sans">{message.bodyText}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
