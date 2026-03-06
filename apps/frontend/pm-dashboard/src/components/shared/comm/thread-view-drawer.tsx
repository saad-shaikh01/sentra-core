'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, ChevronDown, ChevronRight, Paperclip, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useIdentities } from '@/hooks/use-comm';
import { toast } from '@/hooks/use-toast';
import { timeAgo } from '@/lib/format-date';
import { api } from '@/lib/api';
import type { CommMessage, CommAttachment, CommIdentity } from '@/types/comm.types';

interface AliasOption {
  value: string;
  label: string;
  identityId: string;
  aliasEmail: string;
  isDefault: boolean;
}

function buildAliasOptions(identities: CommIdentity[]): AliasOption[] {
  const options: AliasOption[] = [];
  for (const identity of identities) {
    const aliases = identity.sendAsAliases ?? [];
    if (aliases.length === 0) {
      options.push({
        value: `${identity.id}||${identity.email}`,
        label: identity.displayName ? `${identity.displayName} <${identity.email}>` : identity.email,
        identityId: identity.id,
        aliasEmail: identity.email,
        isDefault: identity.isDefault,
      });
    } else {
      for (const alias of aliases) {
        options.push({
          value: `${identity.id}||${alias.email}`,
          label: alias.name ? `${alias.name} <${alias.email}>` : alias.email,
          identityId: identity.id,
          aliasEmail: alias.email,
          isDefault: identity.isDefault && alias.isDefault,
        });
      }
    }
  }
  return options;
}

interface ThreadViewDrawerProps {
  threadId: string | null;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
}

export function ThreadViewDrawer({ threadId, onClose, entityType, entityId }: ThreadViewDrawerProps) {
  const { data: thread, isLoading: threadLoading, isError: threadError } = useThread(threadId ?? '');
  const { data: messagesRes, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useMessages(
    threadId ? { threadId } : undefined,
  );
  const { data: identities } = useIdentities();
  const replyMutation = useReplyToMessage();
  const archiveMutation = useArchiveThread();
  const markRead = useMarkThreadRead();

  const [replyBody, setReplyBody] = useState('');
  const [selectedFrom, setSelectedFrom] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (threadId && thread?.hasUnread) markRead.mutate(threadId);
  }, [threadId]);

  useEffect(() => {
    if (!identities || identities.length === 0) return;
    const options = buildAliasOptions(identities);
    if (!options.length) return;

    let preferred: AliasOption | undefined;
    if (thread?.identityId) {
      preferred = options.find((o) => o.identityId === thread.identityId && o.isDefault)
        ?? options.find((o) => o.identityId === thread.identityId);
    }
    preferred = preferred ?? options.find((o) => o.isDefault) ?? options[0];
    if (!selectedFrom) setSelectedFrom(preferred.value);
  }, [identities, thread?.identityId]);

  useEffect(() => {
    if (lastMessage) {
      setExpandedIds(new Set([lastMessage.id ?? lastMessage.gmailMessageId ?? '']));
    }
  }, [lastMessage?.id]);

  const handleReply = async () => {
    if (!replyBody.trim() || !lastMessage || !threadId) return;
    const messageId = lastMessage.gmailMessageId ?? lastMessage.id ?? '';
    const [identityId, aliasEmail] = selectedFrom.split('||');
    const identity = identities?.find((i) => i.id === identityId);
    const fromAlias = aliasEmail !== identity?.email ? aliasEmail : undefined;

    await replyMutation.mutateAsync({
      messageId,
      dto: { identityId, fromAlias, bodyText: replyBody },
    });
    setReplyBody('');
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const aliasOptions = identities ? buildAliasOptions(identities) : [];

  return (
    <AnimatePresence>
      {threadId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-3xl bg-black/90 backdrop-blur-3xl border-l border-white/10 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-white/10 shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                {threadLoading ? (
                  <div className="h-5 w-48 bg-white/10 rounded animate-pulse" />
                ) : (
                  <>
                    <h2 className="text-base font-semibold text-foreground truncate">
                      {thread?.subject || '(no subject)'}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {messages.length} message{messages.length !== 1 ? 's' : ''}
                      {thread?.latestMessageAt && ` · ${timeAgo(thread.latestMessageAt)}`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-white/10"
                  onClick={() => threadId && archiveMutation.mutate(threadId)}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4 mr-1.5" /> Archive
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {threadError || messagesError ? (
                <div className="py-12 text-center space-y-3">
                  <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
                  <p className="text-sm text-muted-foreground">Failed to load thread.</p>
                  <button
                    onClick={() => refetchMessages()}
                    className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </button>
                </div>
              ) : messagesLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-24 bg-white/5 rounded-xl" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No messages in this thread.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const msgId = msg.id ?? msg.gmailMessageId ?? String(idx);
                  const isLast = idx === messages.length - 1;
                  return (
                    <MessageItem
                      key={msgId}
                      message={msg}
                      isExpanded={expandedIds.has(msgId) || isLast}
                      onToggle={() => toggleExpand(msgId)}
                    />
                  );
                })
              )}
            </div>

            {/* Reply box */}
            <div className="px-6 py-4 border-t border-white/10 space-y-3 shrink-0">
              {aliasOptions.length > 0 && (
                <select
                  value={selectedFrom}
                  onChange={(e) => setSelectedFrom(e.target.value)}
                  className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-white/30"
                >
                  {identities?.map((identity: CommIdentity) => {
                    const opts = aliasOptions.filter((o) => o.identityId === identity.id);
                    if (opts.length <= 1) {
                      const opt = opts[0];
                      return opt ? (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ) : null;
                    }
                    return (
                      <optgroup key={identity.id} label={identity.email}>
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                rows={4}
                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-white/30"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyBody.trim() || replyMutation.isPending || !selectedFrom}
                >
                  {replyMutation.isPending ? 'Sending...' : 'Reply'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MessageItem({
  message,
  isExpanded,
  onToggle,
}: {
  message: CommMessage;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isExpanded || !message.bodyHtml || !iframeRef.current) return;
    const iframe = iframeRef.current;
    iframe.srcdoc = message.bodyHtml;
    const onLoad = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + 'px';
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [isExpanded, message.bodyHtml]);

  const fromLabel = message.from?.name || message.from?.email || 'Unknown';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
            {fromLabel[0]?.toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-medium truncate">{fromLabel}</p>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground truncate">{message.snippet || message.bodyText?.slice(0, 80)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {message.attachments?.length > 0 && (
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
          <span className="text-[10px] text-muted-foreground/60">
            {message.sentAt ? timeAgo(message.sentAt) : ''}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10">
          <div className="pt-3 text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium">From:</span> {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}</p>
            {message.to?.length > 0 && (
              <p><span className="font-medium">To:</span> {message.to.map((a) => a.email).join(', ')}</p>
            )}
          </div>
          <div className="rounded-lg overflow-hidden border border-white/10">
            {message.bodyHtml ? (
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin"
                referrerPolicy="no-referrer"
                className="w-full min-h-[100px] bg-white"
                style={{ border: 'none' }}
              />
            ) : (
              <pre className="text-xs text-foreground/80 p-3 whitespace-pre-wrap leading-relaxed font-sans">
                {message.bodyText}
              </pre>
            )}
          </div>
          {message.attachments?.length > 0 && (
            <AttachmentList
              messageId={message.gmailMessageId ?? message.id ?? ''}
              attachments={message.attachments}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AttachmentList({ messageId, attachments }: { messageId: string; attachments: CommAttachment[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Attachments</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att, idx) => (
          <AttachmentItem key={idx} messageId={messageId} index={idx} attachment={att} />
        ))}
      </div>
    </div>
  );
}

function AttachmentItem({
  messageId,
  index,
  attachment,
}: {
  messageId: string;
  index: number;
  attachment: CommAttachment;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.getCommAttachmentUrl(messageId, index);
      const url = (res as any)?.data?.url ?? (res as any)?.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      toast.error('Failed to load attachment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <Paperclip className="h-3 w-3 text-muted-foreground/70" />
      )}
      <span className="truncate max-w-[140px]">{attachment.filename}</span>
    </button>
  );
}
