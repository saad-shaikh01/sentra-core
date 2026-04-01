'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, ChevronDown, ChevronRight, Paperclip, Link2, XCircle, Loader2, AlertCircle, RefreshCw, Bold, Italic, List, Underline as UnderlineIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useIdentities, useLinkThread, useUnlinkThread, useCommSettings } from '@/hooks/use-comm';
import { toast } from '@/hooks/use-toast';
import { timeAgo } from '@/lib/format-date';
import { api } from '@/lib/api';
import type { CommMessage, CommAttachment, CommIdentity } from '@/types/comm.types';
import { cn } from '@/lib/utils';
import { CommIntelligenceBadges, CommTrackingBadges, CommIntelligencePanel } from './tracking-state';
import { TrackingSendControl } from './tracking-send-control';

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

interface UploadAttachmentResponse {
  s3Key: string;
  cdnUrl: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface UploadedAttachment {
  s3Key: string;
  filename: string;
  size: number;
}

function normalizeEditorHtml(html: string): string | undefined {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<p></p>') {
    return undefined;
  }
  return trimmed;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function ReplyToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors ${
        active
          ? 'border-primary/40 bg-primary/20 text-primary'
          : 'border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function InlineReplyToolbar({ editor, visible }: { editor: Editor | null; visible: boolean }) {
  if (!editor || !visible) {
    return null;
  }

  const setLink = () => {
    const currentHref = editor.getAttributes('link').href as string | undefined;
    const value = window.prompt('Enter a link URL', currentHref ?? 'https://');
    if (value === null) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  };

  return (
    <div className="flex flex-wrap gap-2 border-b border-white/10 px-3 py-3">
      <ReplyToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Bold</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Italic</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Underline</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Bullets" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </ReplyToolbarButton>
    </div>
  );
}

export function ThreadViewDrawer({ threadId, onClose, entityType, entityId }: ThreadViewDrawerProps) {
  const { data: thread, isLoading: threadLoading, isError: threadError } = useThread(threadId ?? '');
  const { data: messagesRes, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useMessages(
    threadId ? { threadId } : undefined,
  );
  const { data: identities } = useIdentities();
  const { data: commSettings } = useCommSettings();
  const replyMutation = useReplyToMessage();
  const archiveMutation = useArchiveThread();
  const markRead = useMarkThreadRead();
  const [replyToolbarVisible, setReplyToolbarVisible] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const replyEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Image,
    ],
    content: '',
    onFocus: () => setReplyToolbarVisible(true),
    editorProps: {
      attributes: {
        class:
          'min-h-[120px] px-3 py-3 text-sm text-foreground focus:outline-none',
        role: 'textbox',
        'data-testid': 'reply-editor',
      },
    },
  });

  const [selectedFrom, setSelectedFrom] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [trackingEnabled, setTrackingEnabled] = useState(
    (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
  );
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null);
  const undoCancelRef = useRef<(() => void) | null>(null);

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (threadId && thread?.hasUnread) {
      markRead.mutate(threadId);
    }
  }, [threadId, thread?.hasUnread, markRead]);

  useEffect(() => {
    replyEditor?.commands.setContent('', { emitUpdate: false });
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);
  }, [replyEditor, threadId]);

  useEffect(() => {
    setTrackingEnabled(
      (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
    );
  }, [commSettings?.openTrackingEnabled, commSettings?.trackingEnabled, threadId]);

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
  }, [identities, thread?.identityId, selectedFrom]);

  useEffect(() => {
    if (lastMessage) {
      setExpandedIds(new Set([lastMessage.id ?? lastMessage.gmailMessageId ?? '']));
    }
  }, [lastMessage?.id, lastMessage?.gmailMessageId]);

  const uploadAttachment = async (file: File): Promise<UploadAttachmentResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.fetch<{ data?: UploadAttachmentResponse } | UploadAttachmentResponse>(
      '/attachments/upload',
      {
        method: 'POST',
        body: formData,
        service: 'comm',
      },
    );

    return ('data' in response ? response.data : response) as UploadAttachmentResponse;
  };

  const handleAttachmentUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) {
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const uploads = await Promise.all(Array.from(files).map((file) => uploadAttachment(file)));
      setUploadedAttachments((current) => [
        ...current,
        ...uploads.map((upload) => ({
          s3Key: upload.s3Key,
          filename: upload.filename,
          size: upload.size,
        })),
      ]);
    } catch (error) {
      toast.error('Failed to upload attachment', error instanceof Error ? error.message : undefined);
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleReply = async (replyAll = false) => {
    const bodyHtml = normalizeEditorHtml(replyEditor?.getHTML() ?? '');
    const bodyText = replyEditor?.getText().trim() || undefined;

    if ((!bodyHtml && !bodyText) || !lastMessage || !threadId) return;
    const messageId = lastMessage.gmailMessageId ?? lastMessage.id ?? '';
    const [identityId, aliasEmail] = selectedFrom.split('||');
    const identity = identities?.find((i) => i.id === identityId);
    const fromAlias = aliasEmail !== identity?.email ? aliasEmail : undefined;
    const dto: {
      identityId: string;
      fromAlias?: string;
      bodyText?: string;
      bodyHtml?: string;
      attachmentS3Keys?: string[];
      replyAll?: boolean;
      trackingEnabled?: boolean;
    } = {
      identityId,
      fromAlias,
      bodyText,
      bodyHtml,
      attachmentS3Keys:
        uploadedAttachments.length > 0 ? uploadedAttachments.map((attachment) => attachment.s3Key) : undefined,
      replyAll,
      trackingEnabled,
    };

    // Optimistically clear composer
    replyEditor?.commands.clearContent(true);
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);

    // Undo/recall: 5-second countdown before actual send
    const wasCancelled = await new Promise<boolean>((resolve) => {
      let remaining = 5;
      setUndoCountdown(remaining);

      const tick = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(tick);
          setUndoCountdown(null);
          resolve(false);
        } else {
          setUndoCountdown(remaining);
        }
      }, 1000);

      undoCancelRef.current = () => {
        clearInterval(tick);
        setUndoCountdown(null);
        resolve(true);
      };
    });

    if (wasCancelled) {
      toast.info('Send cancelled', 'Your reply was not sent.');
      return;
    }

    await replyMutation.mutateAsync({ messageId, dto });
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
            className={cn(
              "fixed right-0 top-0 z-50 h-full w-full sm:max-w-3xl bg-black/90 backdrop-blur-3xl border-l border-white/10 flex flex-col shadow-2xl",
              "transition-all duration-300"
            )}
          >
            {/* Header & Intelligence Panel */}
            <div className="px-4 sm:px-6 py-4 border-b border-white/10 bg-black/40 shrink-0">
              {threadLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-7 w-1/2 bg-white/5 rounded-lg" />
                    <div className="h-7 w-24 bg-white/5 rounded-lg" />
                  </div>
                  <div className="h-24 bg-white/5 rounded-2xl" />
                </div>
              ) : (
                <CommIntelligencePanel
                  source={thread}
                  className="mb-0 border-0 bg-transparent p-0 shadow-none"
                  title={thread?.subject || '(no subject)'}
                  subtitle={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="sm:hidden h-6 w-6 shrink-0 -ml-1"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <span>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
                      {thread?.latestMessageAt && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span>{timeAgo(thread.latestMessageAt)}</span>
                        </>
                      )}
                    </div>
                  }
                  actions={
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
                        onClick={() => threadId && archiveMutation.mutate(threadId)}
                        disabled={archiveMutation.isPending}
                      >
                        <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Archive</span>
                      </Button>
                      <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="hidden sm:flex h-8 w-8 hover:bg-white/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  }
                />
              )}
            </div>


            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
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
                  const isExpanded = expandedIds.has(msgId);
                  const isLast = idx === messages.length - 1;
                  return (
                    <MessageItem
                      key={msgId}
                      message={msg}
                      isExpanded={isExpanded || isLast}
                      onToggle={() => toggleExpand(msgId)}
                    />
                  );
                })
              )}
            </div>

            {/* Link widget */}
            {(entityType && entityId && thread) && (
              <LinkWidget
                threadId={threadId!}
                entityLinks={thread.entityLinks ?? []}
                currentEntityType={entityType}
                currentEntityId={entityId}
              />
            )}

            {/* Reply box */}
            <div className="px-4 sm:px-6 py-4 border-t border-white/10 space-y-3 shrink-0 bg-black/40 backdrop-blur-md">
              {aliasOptions.length > 0 && (
                <select
                  value={selectedFrom}
                  onChange={(e) => setSelectedFrom(e.target.value)}
                  className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none"
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
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-inner">
                <InlineReplyToolbar editor={replyEditor} visible={replyToolbarVisible} />
                <EditorContent editor={replyEditor} />
              </div>
              {uploadedAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedAttachments.map((attachment) => (
                    <span
                      key={attachment.s3Key}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px]"
                    >
                      <span className="truncate max-w-[120px]">{attachment.filename}</span>
                      <button
                        type="button"
                        aria-label={`Remove attachment ${attachment.filename}`}
                        onClick={() =>
                          setUploadedAttachments((current) =>
                            current.filter((candidate) => candidate.s3Key !== attachment.s3Key),
                          )
                        }
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {undoCountdown !== null && (
                <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <span className="text-xs text-amber-400">Sending in {undoCountdown}s…</span>
                  <button
                    type="button"
                    onClick={() => undoCancelRef.current?.()}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors px-2 py-0.5 rounded border border-amber-500/30 hover:border-amber-400/50"
                  >
                    Undo
                  </button>
                </div>
              )}
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    onChange={(event) => {
                      void handleAttachmentUpload(event.target.files);
                      event.target.value = '';
                    }}
                    className="hidden"
                    data-testid="drawer-reply-attachment-input"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={isUploadingAttachment}
                    className="h-9 px-2 sm:px-3 text-xs"
                  >
                    {isUploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline ml-1.5">{isUploadingAttachment ? 'Uploading...' : 'Attach'}</span>
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleReply(true)}
                    disabled={replyMutation.isPending || !selectedFrom}
                    className="h-9 px-2 sm:px-3 text-xs hidden sm:flex"
                  >
                    Reply All
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleReply()}
                    disabled={replyMutation.isPending || !selectedFrom}
                    className="h-9 px-4 sm:px-6 text-xs font-bold"
                  >
                    {replyMutation.isPending ? 'Sending...' : 'Reply'}
                  </Button>
                </div>
              </div>
              <TrackingSendControl
                value={trackingEnabled}
                onChange={setTrackingEnabled}
                settings={commSettings}
                hasHtmlSupport
                compact
              />
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
  const safeHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
        ADD_TAGS: ['img'],
        ALLOWED_ATTR: ['src', 'alt', 'href', 'target', 'rel', 'class', 'style'],
        ALLOW_DATA_ATTR: false,
        FORCE_BODY: true,
      })
    : '';
  const hasSafeHtml = safeHtml.trim().length > 0;

  useEffect(() => {
    if (!isExpanded || !hasSafeHtml || !iframeRef.current) return;
    const iframe = iframeRef.current;
    iframe.srcdoc = safeHtml;
    const onLoad = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = '0px';
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + 'px';
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [hasSafeHtml, isExpanded, safeHtml]);

  const fromLabel = message.from?.name || message.from?.email || 'Unknown';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 border border-white/5">
            {fromLabel[0]?.toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-semibold truncate">{fromLabel}</p>
            {!isExpanded && (
              <p className="text-[11px] text-muted-foreground truncate max-w-md">{message.snippet || message.bodyText?.slice(0, 80)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {message.attachments?.length > 0 && (
            <Paperclip className="h-3 w-3 text-muted-foreground/50" />
          )}
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
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
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 bg-black/20">
          <div className="pt-4 text-[11px] text-muted-foreground space-y-0.5 min-w-0">
            <p className="truncate"><span className="font-medium text-foreground/70">From:</span> {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}</p>
            {message.to?.length > 0 && (
              <p className="truncate"><span className="font-medium text-foreground/70">To:</span> {message.to.map((a) => a.email).join(', ')}</p>
            )}
          </div>
          <CommTrackingBadges source={message} compact showTiming />
          <CommIntelligenceBadges source={message} compact showReasons={false} />
          <div className="rounded-lg overflow-hidden border border-white/10 bg-white shadow-lg">
            {hasSafeHtml ? (
              <iframe
                ref={iframeRef}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="w-full min-h-[120px]"
                style={{ border: 'none', display: 'block' }}
              />
            ) : (
              <pre className="text-xs text-zinc-900 p-4 whitespace-pre-wrap leading-relaxed font-sans">
                {message.bodyText}
              </pre>
            )}
          </div>
          {/* Attachment list */}
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

interface AttachmentPreview {
  url: string;
  filename: string;
  mimeType: string;
}

function AttachmentPreviewModal({ preview, onClose }: { preview: AttachmentPreview; onClose: () => void }) {
  const isImage = preview.mimeType.startsWith('image/');
  const isPdf = preview.mimeType === 'application/pdf';

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-sm font-medium truncate max-w-[calc(100%-5rem)]">{preview.filename}</span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={preview.url}
            download={preview.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs hover:bg-white/20 transition-colors"
          >
            Download
          </a>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {isImage && (
          <img
            src={preview.url}
            alt={preview.filename}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        )}
        {isPdf && (
          <object
            data={preview.url}
            type="application/pdf"
            className="w-full h-full rounded-lg"
            style={{ minHeight: '70vh' }}
          >
            <p className="text-sm text-muted-foreground text-center py-8">
              PDF preview not supported.{' '}
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="underline">
                Download instead
              </a>
            </p>
          </object>
        )}
      </div>
    </div>
  );
}

function AttachmentList({ messageId, attachments }: { messageId: string; attachments: CommAttachment[] }) {
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Attachments</p>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, idx) => (
            <AttachmentItem key={idx} messageId={messageId} index={idx} attachment={att} onPreview={setPreview} />
          ))}
        </div>
      </div>
      {preview && <AttachmentPreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function AttachmentItem({
  messageId,
  index,
  attachment,
  onPreview,
}: {
  messageId: string;
  index: number;
  attachment: CommAttachment;
  onPreview: (p: AttachmentPreview) => void;
}) {
  const [loading, setLoading] = useState(false);
  const isPreviewable = attachment.mimeType.startsWith('image/') || attachment.mimeType === 'application/pdf';

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.getCommAttachmentUrl(messageId, index);
      const url = (res as any)?.data?.url ?? (res as any)?.url;
      if (!url) return;
      if (isPreviewable) {
        onPreview({ url, filename: attachment.filename, mimeType: attachment.mimeType });
      } else {
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
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Paperclip className="h-3 w-3" />
      )}
      <span className="truncate max-w-[150px]">{attachment.filename}</span>
      <span className="opacity-50">({formatFileSize(attachment.size)})</span>
    </button>
  );
}

function LinkWidget({
  threadId,
  entityLinks,
  currentEntityType,
  currentEntityId,
}: {
  threadId: string;
  entityLinks: Array<{ entityType: string; entityId: string }>;
  currentEntityType: string;
  currentEntityId: string;
}) {
  const linkThread = useLinkThread();
  const unlinkThread = useUnlinkThread();
  const [showSearch, setShowSearch] = useState(false);
  const [searchType, setSearchType] = useState<'lead' | 'client'>('lead');
  const [searchId, setSearchId] = useState('');

  const handleLink = () => {
    if (!searchId.trim()) return;
    linkThread.mutate({ threadId, entityType: searchType, entityId: searchId.trim() });
    setSearchId('');
    setShowSearch(false);
  };

  return (
    <div className="px-4 sm:px-6 py-3 border-t border-white/10 space-y-2 bg-black/20">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Linked to</p>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowSearch((p) => !p)}>
          <Link2 className="h-3 w-3 mr-1" /> Link
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {entityLinks.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50">
            No links yet for this {currentEntityType} ({currentEntityId.slice(0, 8)}…)
          </span>
        )}
        {entityLinks.map((link) => (
          <span
            key={`${link.entityType}:${link.entityId}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px]"
          >
            <span className="capitalize">{link.entityType}:</span>
            <span className="text-muted-foreground truncate max-w-[80px]">{link.entityId.slice(0, 8)}…</span>
            <button
              onClick={() => unlinkThread.mutate({ threadId, entityType: link.entityType, entityId: link.entityId })}
              className="hover:text-red-400 transition-colors"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {showSearch && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as 'lead' | 'client')}
            className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground focus:outline-none"
          >
            <option value="lead">Lead</option>
            <option value="client">Client</option>
          </select>
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Entity ID..."
            className="flex-1 text-[10px] bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30"
          />
          <Button size="sm" className="h-7 text-[10px]" onClick={handleLink} disabled={!searchId.trim()}>
            Link
          </Button>
        </div>
      )}
    </div>
  );
}
