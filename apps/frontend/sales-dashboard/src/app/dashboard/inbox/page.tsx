'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import { Search, Mail, Inbox as InboxIcon, Circle, Archive, ChevronDown, ChevronRight, Paperclip, AlertCircle, RefreshCw, Bold, Italic, List, ListOrdered, Link2, Strikethrough, Type, Underline as UnderlineIcon } from 'lucide-react';
import { useThreads, useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useIdentities } from '@/hooks/use-comm';
import { useDebounce } from '@/hooks/use-debounce';
import { timeAgo } from '@/lib/format-date';
import { ComposeDrawer } from '@/components/shared/comm/compose-drawer';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { CommThread, CommMessage, CommIdentity } from '@/types/comm.types';
import { COMM_ENABLED } from '@/lib/feature-flags';

type Filter = 'all' | 'unread' | 'sent' | 'archived';

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

function escapeHtml(value: string | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildForwardBody(threadSubject: string | undefined, message: CommMessage): string {
  const originalBody = message.bodyHtml
    ? message.bodyHtml
    : `<pre>${escapeHtml(message.bodyText ?? '')}</pre>`;

  return `
    <div><br /></div>
    <div style="border-left: 2px solid #d4d4d8; padding-left: 12px; color: #71717a;">
      <p><strong>From:</strong> ${escapeHtml(message.from?.email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(threadSubject ?? message.subject ?? '')}</p>
      <div>${originalBody}</div>
    </div>
  `;
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
  const { data: identities } = useIdentities();

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

  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [forwardMessage, setForwardMessage] = useState<CommMessage | null>(null);

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (thread?.hasUnread) markRead.mutate(threadId);
  }, [threadId]);

  useEffect(() => {
    replyEditor?.commands.setContent('', { emitUpdate: false });
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);
  }, [replyEditor, threadId]);

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
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleReply = async (replyAll = false) => {
    const bodyHtml = normalizeEditorHtml(replyEditor?.getHTML() ?? '');
    const bodyText = replyEditor?.getText().trim() || undefined;

    if ((!bodyHtml && !bodyText) || !lastMessage) return;
    const messageId = lastMessage.gmailMessageId ?? lastMessage.id ?? '';
    const dto: {
      identityId: string;
      bodyText?: string;
      bodyHtml?: string;
      attachmentS3Keys?: string[];
      replyAll?: boolean;
    } = {
      identityId: selectedIdentityId,
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
              onForward={() => setForwardMessage(msg)}
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
                  <Paperclip className="h-3 w-3" />
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
            data-testid="inline-reply-attachment-input"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isUploadingAttachment}
          >
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            {isUploadingAttachment ? 'Uploading...' : 'Attach'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void handleReply(true)} disabled={replyMutation.isPending || !selectedIdentityId}>
            Reply All
          </Button>
          <Button size="sm" onClick={() => void handleReply()} disabled={replyMutation.isPending || !selectedIdentityId}>
            {replyMutation.isPending ? 'Sending...' : 'Reply'}
          </Button>
        </div>
      </div>
      <ComposeDrawer
        open={!!forwardMessage}
        onClose={() => setForwardMessage(null)}
        mode="forward"
        forwardMessageId={forwardMessage?.gmailMessageId ?? forwardMessage?.id}
        defaultSubject={`Fwd: ${thread?.subject || ''}`}
        defaultBodyHtml={forwardMessage ? buildForwardBody(thread?.subject, forwardMessage) : ''}
      />
    </div>
  );
}

export function InlineMessageItem({
  message,
  isExpanded,
  onToggle,
  onForward,
}: {
  message: CommMessage;
  isExpanded: boolean;
  onToggle: () => void;
  onForward: () => void;
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
      if (iframe.contentDocument?.body) iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + 'px';
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [hasSafeHtml, isExpanded, safeHtml]);

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
          <div className="flex items-start justify-between gap-3 pt-3">
            <div className="text-xs text-muted-foreground">
            <p><span className="font-medium">From:</span> {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}</p>
            {message.to?.length > 0 && <p><span className="font-medium">To:</span> {message.to.map((a) => a.email).join(', ')}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={onForward}>
              Forward
            </Button>
          </div>
          <div className="rounded-lg overflow-hidden border border-white/10">
            {hasSafeHtml ? (
              <iframe ref={iframeRef} sandbox="" referrerPolicy="no-referrer" className="w-full min-h-[100px] bg-white" style={{ border: 'none' }} />
            ) : (
              <pre className="text-xs text-foreground/80 p-3 whitespace-pre-wrap leading-relaxed font-sans">{message.bodyText}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
