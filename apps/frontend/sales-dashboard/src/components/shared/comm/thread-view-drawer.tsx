'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, ChevronDown, ChevronRight, Paperclip, Link2, XCircle, Loader2, AlertCircle, RefreshCw, Bold, Italic, List, ListOrdered, Strikethrough, Type, Underline as UnderlineIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useIdentities, useLinkThread, useUnlinkThread } from '@/hooks/use-comm';
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
        <span>Bold</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
        <span>Italic</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
        <span>Underline</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
        <span>Strike</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Bullet List" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
        <span>Bullets</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Ordered List" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
        <span>Numbered</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
        <span>Link</span>
      </ReplyToolbarButton>
      <ReplyToolbarButton
        label="Clear Formatting"
        active={false}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Type className="h-3.5 w-3.5" />
        <span>Clear</span>
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

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  // Auto-mark read when opened
  useEffect(() => {
    if (threadId && thread?.hasUnread) {
      markRead.mutate(threadId);
    }
  }, [threadId]);

  useEffect(() => {
    replyEditor?.commands.setContent('', { emitUpdate: false });
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);
  }, [replyEditor, threadId]);

  // Default alias selection — prefer identity that owns the thread
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

  // Expand last message by default
  useEffect(() => {
    if (lastMessage) {
      setExpandedIds(new Set([lastMessage.id ?? lastMessage.gmailMessageId ?? '']));
    }
  }, [lastMessage?.id]);

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
    } = {
      identityId,
      fromAlias,
      bodyText,
      bodyHtml,
      attachmentS3Keys:
        uploadedAttachments.length > 0 ? uploadedAttachments.map((attachment) => attachment.s3Key) : undefined,
      replyAll,
    };

    await replyMutation.mutateAsync({
      messageId,
      dto,
    });
    replyEditor?.commands.clearContent(true);
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);
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
              <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
                <InlineReplyToolbar editor={replyEditor} visible={replyToolbarVisible} />
                <EditorContent editor={replyEditor} />
              </div>
              {uploadedAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedAttachments.map((attachment) => (
                    <span
                      key={attachment.s3Key}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
                    >
                      <span>{attachment.filename}</span>
                      <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
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
              <div className="flex justify-end gap-2">
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
                >
                  {isUploadingAttachment ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
                  {isUploadingAttachment ? 'Uploading...' : 'Attach'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleReply(true)}
                  disabled={replyMutation.isPending || !selectedFrom}
                >
                  Reply All
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleReply()}
                  disabled={replyMutation.isPending || !selectedFrom}
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
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + 'px';
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [hasSafeHtml, isExpanded, safeHtml]);

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
            {hasSafeHtml ? (
              <iframe
                ref={iframeRef}
                sandbox=""
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
    <div className="px-6 py-3 border-t border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked to</p>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowSearch((p) => !p)}>
          <Link2 className="h-3 w-3 mr-1" /> Link to...
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {entityLinks.length === 0 && (
          <span className="text-xs text-muted-foreground/50">No links yet</span>
        )}
        {entityLinks.map((link) => (
          <span
            key={`${link.entityType}:${link.entityId}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs"
          >
            <span className="capitalize">{link.entityType}:</span>
            <span className="text-muted-foreground">{link.entityId.slice(0, 8)}…</span>
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
            className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground focus:outline-none"
          >
            <option value="lead">Lead</option>
            <option value="client">Client</option>
          </select>
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Entity ID..."
            className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30"
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleLink} disabled={!searchId.trim()}>
            Link
          </Button>
        </div>
      )}
    </div>
  );
}
