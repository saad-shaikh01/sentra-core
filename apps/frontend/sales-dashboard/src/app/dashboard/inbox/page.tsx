'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import { Search, Mail, Inbox as InboxIcon, Circle, Archive, ChevronDown, ChevronRight, Paperclip, AlertCircle, RefreshCw, Bold, Italic, List, Link2, Underline as UnderlineIcon, SquarePen, MailOpen, ArrowLeft, X, Loader2 } from 'lucide-react';
import { useThreads, useThread, useMessages, useReplyToMessage, useArchiveThread, useMarkThreadRead, useMarkThreadUnread, useIdentities } from '@/hooks/use-comm';
import { useAuth } from '@/hooks/use-auth';
import { UserRole } from '@sentra-core/types';
import { useDebounce } from '@/hooks/use-debounce';
import { timeAgo } from '@/lib/format-date';
import { ComposeDrawer } from '@/components/shared/comm/compose-drawer';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { CommThread, CommMessage, CommIdentity, CommAttachment } from '@/types/comm.types';
import { COMM_ENABLED } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

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
  // For admin: '' = no account selected (empty state); '__all__' = all accounts; '<id>' = specific account
  // For regular user: '' = all own accounts; '<id>' = specific own account
  const [identityFilter, setIdentityFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { data: identities } = useIdentities();
  const { user } = useAuth();

  const isPrivileged = user?.role === UserRole.ADMIN || user?.role === UserRole.OWNER;

  // Split identities into own and team for the grouped dropdown
  const ownIdentities = identities?.filter((id) => id.userId === user?.id) ?? [];
  const teamIdentities = identities?.filter((id) => id.userId !== user?.id) ?? [];

  // Compute thread query params based on role and selection
  const threadsEnabled = !isPrivileged || identityFilter !== '';
  const threadsParams = (() => {
    if (identityFilter === '__all__') {
      return { search: debouncedSearch || undefined, filter, scope: 'all' as const };
    }
    return { search: debouncedSearch || undefined, filter, identityId: identityFilter || undefined };
  })();

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreads(threadsParams, { enabled: threadsEnabled });

  const threads = data?.pages.flatMap((p) => p.data) ?? [];

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
    <div className="flex h-[calc(100vh-120px)] sm:h-[calc(100vh-120px)] gap-0 rounded-2xl overflow-hidden border border-white/10 bg-black/20">
      {/* Master Column — thread list */}
      <div className={cn(
        "w-full sm:w-[340px] shrink-0 flex flex-col border-r border-white/10",
        selectedThreadId ? "hidden sm:flex" : "flex"
      )}>
        {/* Header with Compose button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
          <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
          <Button
            size="sm"
            onClick={() => setComposeOpen(true)}
            className="gap-1.5 h-8 px-3 text-xs shadow-lg shadow-primary/20"
          >
            <SquarePen className="h-3.5 w-3.5" />
            Compose
          </Button>
        </div>
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
        <div className="flex gap-1.5 px-4 py-2 border-b border-white/10 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
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
        {identities && identities.length > 0 && (
          <div className="px-4 py-2 border-b border-white/10">
            <select
              value={identityFilter}
              onChange={(e) => setIdentityFilter(e.target.value)}
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-white/30"
            >
              {isPrivileged ? (
                <>
                  <option value="">— Select an account —</option>
                  <option value="__all__">All Accounts</option>
                  {ownIdentities.length > 0 && (
                    <optgroup label="Your Accounts">
                      {ownIdentities.map((id: CommIdentity) => (
                        <option key={id.id} value={id.id}>
                          {id.displayName || id.email}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {teamIdentities.length > 0 && (
                    <optgroup label="Team Accounts">
                      {teamIdentities.map((id: CommIdentity) => (
                        <option key={id.id} value={id.id}>
                          {id.displayName ? `${id.displayName} · ${id.email}` : id.email}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : (
                <>
                  {identities.length > 1 && <option value="">All my accounts</option>}
                  {identities.map((id: CommIdentity) => (
                    <option key={id.id} value={id.id}>
                      {id.displayName || id.email}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {isPrivileged && !identityFilter ? (
            <div className="py-16 text-center space-y-2 px-4">
              <Mail className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Select an account to view inbox</p>
              <p className="text-xs text-muted-foreground/50">Choose a Gmail account above or select "All Accounts"</p>
            </div>
          ) : isLoading ? (
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
                const hasUnread = !!thread.hasUnread;
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
                        {isPrivileged && identityFilter === '__all__' && thread.identityId && (
                          <p className="text-[10px] text-primary/60 truncate mt-0.5">
                            {identities?.find((id) => id.id === thread.identityId)?.email ?? thread.identityId}
                          </p>
                        )}
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

      {/* Detail Column — thread detail */}
      <div className={cn(
        "flex-1 flex flex-col bg-black/10 overflow-hidden",
        !selectedThreadId ? "hidden sm:flex" : "flex"
      )}>
        {selectedThreadId ? (
          <InlineThreadView threadId={selectedThreadId} onClose={() => setSelectedThreadId(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Select a thread to read</p>
            <p className="text-xs text-muted-foreground/50">Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs">c</kbd> to compose a new email</p>
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
  const { user } = useAuth();
  const replyMutation = useReplyToMessage();
  const archiveMutation = useArchiveThread();
  const markRead = useMarkThreadRead();
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  const markUnread = useMarkThreadUnread();
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

  const defaultIdentityId = identities
    ? (identities.find((i) => i.isDefault) ?? identities[0])?.id ?? ''
    : '';
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [forwardMessage, setForwardMessage] = useState<CommMessage | null>(null);

  const activeIdentityId = selectedIdentityId || defaultIdentityId;

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (thread?.hasUnread) markReadRef.current.mutate(threadId);
  }, [threadId, thread?.hasUnread]);

  useEffect(() => {
    replyEditor?.commands.setContent('', { emitUpdate: false });
    setReplyToolbarVisible(false);
    setUploadedAttachments([]);
  }, [replyEditor, threadId]);

  useEffect(() => {
    if (lastMessage) {
      const id = lastMessage.id ?? lastMessage.gmailMessageId ?? '';
      setExpandedIds(new Set([id]));
    }
  }, [lastMessage?.id, lastMessage?.gmailMessageId]);

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
      identityId: activeIdentityId,
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
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 shrink-0 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="sm:hidden h-8 w-8 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            {threadLoading ? <div className="h-5 w-48 bg-white/10 rounded animate-pulse" /> : (
              <>
                <h2 className="text-sm sm:text-base font-semibold truncate">{thread?.subject || '(no subject)'}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                  {thread?.latestMessageAt && ` · ${timeAgo(thread.latestMessageAt)}`}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
            title={thread?.hasUnread ? 'Mark as read' : 'Mark as unread'}
            onClick={() => thread?.hasUnread ? markRead.mutate(threadId) : markUnread.mutate(threadId)}
          >
            <MailOpen className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{thread?.hasUnread ? 'Mark Read' : 'Mark Unread'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
            onClick={() => archiveMutation.mutate(threadId)}
          >
            <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Archive</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 bg-black/20">
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
      <div className="px-4 sm:px-6 py-4 border-t border-white/10 space-y-3 shrink-0 bg-black/40 backdrop-blur-md">
        {identities && identities.length > 0 && (
          <select value={activeIdentityId} onChange={(e) => setSelectedIdentityId(e.target.value)}
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none">
            {identities.map((id: CommIdentity) => {
              const isOwn = id.userId === user?.id;
              const label = isOwn
                ? `${id.displayName || id.email} <${id.email}>`
                : `${id.displayName ? `${id.displayName} · ` : ''}${id.email} (team)`;
              return (
                <option key={id.id} value={id.id}>{label}</option>
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
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
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
              data-testid="inline-reply-attachment-input"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={isUploadingAttachment}
              className="h-9 px-2 sm:px-3 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{isUploadingAttachment ? 'Uploading...' : 'Attach'}</span>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleReply(true)}
              disabled={replyMutation.isPending || !activeIdentityId}
              className="h-9 px-2 sm:px-3 text-xs hidden sm:flex"
            >
              Reply All
            </Button>
            <Button
              size="sm"
              onClick={() => void handleReply()}
              disabled={replyMutation.isPending || !activeIdentityId}
              className="h-9 px-4 sm:px-6 text-xs font-bold"
            >
              {replyMutation.isPending ? 'Sending...' : 'Reply'}
            </Button>
          </div>
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
      if (iframe.contentDocument?.body) {
        // Reset height before calculating to ensure accurate measurement
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
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 border border-white/5">
            {fromLabel[0]?.toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-semibold truncate">{fromLabel}</p>
            {!isExpanded && <p className="text-[11px] text-muted-foreground truncate max-w-md">{message.snippet || message.bodyText?.slice(0, 80)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {message.attachments?.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground/50" />}
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{message.sentAt ? timeAgo(message.sentAt) : ''}</span>
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/50" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 bg-black/20">
          <div className="flex items-start justify-between gap-3 pt-4">
            <div className="text-[11px] text-muted-foreground space-y-0.5 min-w-0">
              <p className="truncate"><span className="font-medium text-foreground/70">From:</span> {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}</p>
              {message.to?.length > 0 && (
                <p className="truncate">
                  <span className="font-medium text-foreground/70">To:</span> {message.to.map((a) => a.email).join(', ')}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onForward} className="h-7 text-[10px] px-2.5">
              Forward
            </Button>
          </div>
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
              <pre className="text-xs text-zinc-900 p-4 whitespace-pre-wrap leading-relaxed font-sans">{message.bodyText}</pre>
            )}
          </div>
          {message.attachments?.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-2 border-t border-white/5">
              {message.attachments.map((at, idx) => (
                <AttachmentItem key={idx} messageId={message.gmailMessageId ?? message.id} index={idx} attachment={at} />
              ))}
            </div>
          )}
        </div>
      )}
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
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <Paperclip className="h-3 w-3" />
      )}
      <span className="truncate max-w-[150px]">{attachment.filename}</span>
      <span className="opacity-50">({formatFileSize(attachment.size)})</span>
    </button>
  );
}
