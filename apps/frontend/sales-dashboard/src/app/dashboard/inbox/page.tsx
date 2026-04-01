'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import DOMPurify from 'dompurify';
import {
  Search, Mail, Archive, Paperclip, AlertCircle, RefreshCw,
  Bold, Italic, List, Link2, Underline as UnderlineIcon,
  SquarePen, MailOpen, ArrowLeft, X, Loader2, ChevronDown, ChevronUp,
  ChevronRight, Reply, CornerUpRight, TriangleAlert, CircleDot, Clock3, BadgeCheck,
  Inbox as InboxIcon, CheckSquare, Square, MailCheck, MailX,
} from 'lucide-react';
import {
  useThreads, useThread, useMessages, useReplyToMessage,
  useArchiveThread, useMarkThreadRead, useMarkThreadUnread, useIdentities, useCommIntelligenceSummary, useCommSettings,
  useBatchThreadAction,
} from '@/hooks/use-comm';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { ComposeDrawer } from '@/components/shared/comm/compose-drawer';
import { CommIntelligenceBadges, CommTrackingBadges, CommIntelligencePanel } from '@/components/shared/comm/tracking-state';
import { TrackingSendControl } from '@/components/shared/comm/tracking-send-control';
import { CommAlertsPanel } from '@/components/shared/comm/alerts-panel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { CommThread, CommMessage, CommIdentity, CommAttachment, CommIntelligenceSummary, CommSettings } from '@/types/comm.types';
import { COMM_ENABLED } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type Filter =
  | 'all'
  | 'unread'
  | 'sent'
  | 'archived'
  | 'fresh'
  | 'waiting'
  | 'ghosted'
  | 'replied'
  | 'bounced'
  | 'failed'
  | 'opened'
  | 'unopened'
  | 'suspicious'
  | 'needs_follow_up'
  | 'hot_lead'
  | 'overdue'
  | 'opened_no_reply'
  | 'suspicious_only';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeEditorHtml(html: string): string | undefined {
  const trimmed = html.trim();
  return (!trimmed || trimmed === '<p></p>') ? undefined : trimmed;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function escapeHtml(value: string | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// Gmail-like smart date: today → time, this year → "Mar 15", older → "Mar 15, 2023"
function formatEmailDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isThisYear) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// Colorful avatar background based on name hash — like Gmail
const AVATAR_COLORS = [
  'bg-red-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500',
  'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-green-500',
  'bg-yellow-500', 'bg-orange-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const color = getAvatarColor(name);
  const sz = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold text-white shrink-0', color, sz)}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

// ─── Attachment upload types ─────────────────────────────────────────────────

interface UploadAttachmentResponse {
  s3Key: string; cdnUrl: string; filename: string; mimeType: string; size: number;
}
interface UploadedAttachment { s3Key: string; filename: string; size: number; }

// ─── Reply Toolbar ────────────────────────────────────────────────────────────

function ToolbarBtn({ label, active, onClick, children }: {
  label: string; active: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button" aria-label={label} aria-pressed={active} onClick={onClick}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded transition-colors text-sm',
        active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ReplyToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const setLink = () => {
    const cur = editor.getAttributes('link').href as string | undefined;
    const val = window.prompt('Enter URL', cur ?? 'https://');
    if (val === null) return;
    const t = val.trim();
    if (!t) { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: t }).run();
  };
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/10">
      <ToolbarBtn label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
      <ToolbarBtn label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
      <ToolbarBtn label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolbarBtn>
      <ToolbarBtn label="Bullets" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarBtn>
      <ToolbarBtn label="Link" active={editor.isActive('link')} onClick={setLink}><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
    </div>
  );
}

// ─── Page entry ───────────────────────────────────────────────────────────────

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

// ─── Main inbox layout ────────────────────────────────────────────────────────

function InboxContent() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [checkedThreadIds, setCheckedThreadIds] = useState<Set<string>>(new Set());
  const batchAction = useBatchThreadAction();
  const [composeOpen, setComposeOpen] = useState(false);
  const [identityFilter, setIdentityFilter] = useState('');
  const [summaryRange] = useState(() => {
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    };
  });
  const debouncedSearch = useDebounce(search, 300);
  const { data: identities } = useIdentities();
  const { data: intelligenceSummary } = useCommIntelligenceSummary(summaryRange);
  const { data: commSettings } = useCommSettings();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  const isPrivileged = hasPermission('sales:settings:view');
  const ownIdentities = identities?.filter((id) => id.userId === user?.id) ?? [];
  const teamIdentities = identities?.filter((id) => id.userId !== user?.id) ?? [];

  const threadsEnabled = !isPrivileged || identityFilter !== '';
  const threadsParams = (() => {
    if (identityFilter === '__all__') return { search: debouncedSearch || undefined, filter, scope: 'all' as const };
    return { search: debouncedSearch || undefined, filter, identityId: identityFilter || undefined };
  })();

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useThreads(threadsParams, { enabled: threadsEnabled });

  const threads = data?.pages.flatMap((p) => p.data) ?? [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setComposeOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filters: { label: string; value: Filter; icon: typeof InboxIcon }[] = [
    { label: 'All Mail', value: 'all', icon: InboxIcon },
    { label: 'Unread', value: 'unread', icon: MailOpen },
    { label: 'Fresh', value: 'fresh', icon: CircleDot },
    { label: 'Waiting', value: 'waiting', icon: Clock3 },
    { label: 'Ghosted', value: 'ghosted', icon: AlertCircle },
    { label: 'Replied', value: 'replied', icon: BadgeCheck },
    { label: 'Sent', value: 'sent', icon: CornerUpRight },
    { label: 'Bounced', value: 'bounced', icon: TriangleAlert },
    { label: 'Failed', value: 'failed', icon: AlertCircle },
    { label: 'Archived', value: 'archived', icon: Archive },
  ];
  const trackingFilters: { label: string; value: Filter; icon: typeof InboxIcon }[] = [
    { label: 'Opened', value: 'opened', icon: CircleDot },
    { label: 'Unopened', value: 'unopened', icon: MailOpen },
    { label: 'Suspicious', value: 'suspicious', icon: TriangleAlert },
  ];
  const queueFilters: { label: string; value: Filter; icon: typeof InboxIcon }[] = [
    { label: 'Needs Follow-up', value: 'needs_follow_up', icon: Clock3 },
    { label: 'Hot Leads', value: 'hot_lead', icon: BadgeCheck },
    { label: 'Overdue', value: 'overdue', icon: AlertCircle },
    { label: 'Opened, No Reply', value: 'opened_no_reply', icon: MailOpen },
    { label: 'Suspicious Only', value: 'suspicious_only', icon: TriangleAlert },
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f]">

      {/* ── Left sidebar (Gmail-style nav) ── */}
      <div className={cn(
        'w-[220px] shrink-0 flex flex-col border-r border-white/10 bg-black/30',
        selectedThreadId ? 'hidden lg:flex' : 'hidden sm:flex',
      )}>
        {/* Compose */}
        <div className="p-3">
          <Button
            onClick={() => setComposeOpen(true)}
            className="w-full gap-2 h-10 shadow-lg shadow-primary/20 font-semibold"
          >
            <SquarePen className="h-4 w-4" />
            Compose
          </Button>
        </div>

        {/* Nav filters */}
        <nav className="flex-1 px-2 space-y-0.5">
          {filters.map(({ label, value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm transition-colors',
                filter === value
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-2 pb-2 pt-3 border-t border-white/10">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open tracking</p>
          <div className="space-y-0.5">
            {trackingFilters.map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm transition-colors',
                  filter === value
                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 pb-2 pt-3 border-t border-white/10">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Priority queues</p>
          <div className="space-y-0.5">
            {queueFilters.map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm transition-colors',
                  filter === value
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Account selector */}
        {identities && identities.length > 0 && (
          <div className="p-3 border-t border-white/10 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Account</p>
            <Select value={identityFilter} onValueChange={setIdentityFilter}>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 w-full">
                <SelectValue placeholder={isPrivileged ? 'Select account' : 'All accounts'} />
              </SelectTrigger>
              <SelectContent>
                {isPrivileged ? (
                  <>
                    <SelectItem value="__all__">All Accounts</SelectItem>
                    {ownIdentities.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Your Accounts</SelectLabel>
                        {ownIdentities.map((id: CommIdentity) => (
                          <SelectItem key={id.id} value={id.id}>{id.displayName || id.email}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {teamIdentities.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Team Accounts</SelectLabel>
                        {teamIdentities.map((id: CommIdentity) => (
                          <SelectItem key={id.id} value={id.id}>
                            {id.displayName ? `${id.displayName} · ${id.email}` : id.email}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </>
                ) : (
                  <>
                    {identities.length > 1 && <SelectItem value="">All my accounts</SelectItem>}
                    {identities.map((id: CommIdentity) => (
                      <SelectItem key={id.id} value={id.id}>{id.displayName || id.email}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ── Thread list ── */}
      <div className={cn(
        'w-full sm:w-[320px] lg:w-[360px] shrink-0 flex flex-col border-r border-white/10',
        selectedThreadId ? 'hidden sm:flex' : 'flex',
      )}>
        {/* Search */}
        <div className="px-3 py-2.5 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail…"
              className="w-full pl-9 pr-3 h-9 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        <div className="px-3 py-3 border-b border-white/10 bg-white/[0.02]">
          <InboxSummaryCards
            summary={intelligenceSummary}
            commSettings={commSettings}
            onSelectThread={setSelectedThreadId}
          />
        </div>

        {/* Mobile: filter chips + compose */}
        <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Button size="sm" onClick={() => setComposeOpen(true)} className="gap-1.5 h-7 text-xs">
            <SquarePen className="h-3 w-3" /> Compose
          </Button>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all',
                  filter === f.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:hidden flex items-center gap-1 px-3 pb-2 border-b border-white/10 overflow-x-auto no-scrollbar">
          {trackingFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all',
                filter === f.value ? 'bg-cyan-500/15 text-cyan-300' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sm:hidden flex items-center gap-1 px-3 pb-2 border-b border-white/10 overflow-x-auto no-scrollbar">
          {queueFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all',
                filter === f.value ? 'bg-emerald-500/15 text-emerald-300' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Batch action bar */}
        {checkedThreadIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
            <span className="text-xs font-medium text-primary">{checkedThreadIds.size} selected</span>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                disabled={batchAction.isPending}
                onClick={() => batchAction.mutate({ threadIds: Array.from(checkedThreadIds), action: 'mark_read' }, { onSuccess: () => setCheckedThreadIds(new Set()) })}
              >
                <MailCheck className="h-3.5 w-3.5" /> Read
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                disabled={batchAction.isPending}
                onClick={() => batchAction.mutate({ threadIds: Array.from(checkedThreadIds), action: 'mark_unread' }, { onSuccess: () => setCheckedThreadIds(new Set()) })}
              >
                <MailX className="h-3.5 w-3.5" /> Unread
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                disabled={batchAction.isPending}
                onClick={() => batchAction.mutate({ threadIds: Array.from(checkedThreadIds), action: 'archive' }, { onSuccess: () => setCheckedThreadIds(new Set()) })}
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCheckedThreadIds(new Set())}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Thread list body */}
        <div className="flex-1 overflow-y-auto">
          {isPrivileged && !identityFilter ? (
            <div className="py-20 text-center space-y-2 px-4">
              <Mail className="h-10 w-10 mx-auto text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Select an account</p>
              <p className="text-xs text-muted-foreground/50">Choose from the sidebar</p>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-white/5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-white/5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-white/5 rounded w-2/3" />
                    <div className="h-3 bg-white/5 rounded w-full" />
                    <div className="h-3 bg-white/5 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-16 text-center space-y-3 px-4">
              <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
              <p className="text-sm text-muted-foreground">Failed to load emails.</p>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : threads.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <InboxIcon className="h-10 w-10 mx-auto text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No emails found.</p>
            </div>
          ) : (
            <>
              {threads.map((thread: CommThread) => {
                const tid = thread.id ?? thread.gmailThreadId ?? '';
                const isSelected = tid === selectedThreadId;
                const hasUnread = !!thread.hasUnread;
                const senderName = thread.participants?.[0]?.name || thread.participants?.[0]?.email || 'Unknown';
                return (
                  <ThreadRow
                    key={tid}
                    thread={thread}
                    tid={tid}
                    isSelected={isSelected}
                    hasUnread={hasUnread}
                    senderName={senderName}
                    identityEmail={
                      isPrivileged && identityFilter === '__all__'
                        ? (identities?.find((id) => id.id === thread.identityId)?.email)
                        : undefined
                    }
                    isChecked={checkedThreadIds.has(tid)}
                    onCheck={(checked) => {
                      setCheckedThreadIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(tid);
                        else next.delete(tid);
                        return next;
                      });
                    }}
                    onClick={() => setSelectedThreadId(tid)}
                  />
                );
              })}
              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Thread detail ── */}
      <div className={cn(
        'flex-1 flex flex-col overflow-hidden bg-[#0a0a0f]',
        !selectedThreadId ? 'hidden sm:flex' : 'flex',
      )}>
        {selectedThreadId ? (
            <ThreadView
              threadId={selectedThreadId}
              onClose={() => setSelectedThreadId(null)}
              identities={identities ?? []}
              userId={user?.id ?? ''}
              commSettings={commSettings}
            />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
            <Mail className="h-16 w-16 mx-auto text-muted-foreground/10" />
            <p className="text-sm text-muted-foreground">Select an email to read</p>
            <p className="text-xs text-muted-foreground/40">
              Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">c</kbd> to compose
            </p>
          </div>
        )}
      </div>

      <ComposeDrawer open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

// ─── Thread row (Gmail-style) ─────────────────────────────────────────────────

function ThreadRow({
  thread, tid, isSelected, hasUnread, senderName, identityEmail, isChecked, onCheck, onClick,
}: {
  thread: CommThread; tid: string; isSelected: boolean; hasUnread: boolean;
  senderName: string; identityEmail?: string; isChecked?: boolean;
  onCheck?: (checked: boolean) => void; onClick: () => void;
}) {
  const archiveMutation = useArchiveThread();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] transition-colors relative group cursor-pointer',
        isSelected ? 'bg-primary/10' : isChecked ? 'bg-primary/5' : hasUnread ? 'bg-white/[0.02] hover:bg-white/[0.05]' : 'hover:bg-white/[0.03]',
      )}
    >
      {/* Unread indicator */}
      {hasUnread && !isSelected && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
      )}

      {/* Checkbox (shown on hover or when any checked) */}
      {(hovered || isChecked) ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCheck?.(!isChecked); }}
          className="h-9 w-9 flex items-center justify-center shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {isChecked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
      ) : (
        <button type="button" onClick={onClick} className="h-9 w-9 shrink-0 flex items-center justify-center">
          <Avatar name={senderName} />
        </button>
      )}

      <button type="button" onClick={onClick} className="flex-1 text-left min-w-0 py-0">
      <div className="flex-1 min-w-0">
        {/* Row 1: sender + date */}
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm truncate', hasUnread ? 'font-semibold text-foreground' : 'text-foreground/80')}>
            {senderName}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {/* Hover actions */}
            {hovered && !isSelected ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); archiveMutation.mutate(tid); }}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Archive"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <span className={cn('text-[11px] whitespace-nowrap', hasUnread ? 'text-primary font-medium' : 'text-muted-foreground/60')}>
              {formatEmailDate(thread.latestMessageAt ?? thread.lastMessageAt)}
            </span>
          </div>
        </div>

        {/* Row 2: subject */}
        <p className={cn('text-xs truncate', hasUnread ? 'font-medium text-foreground' : 'text-foreground/60')}>
          {thread.subject || '(no subject)'}
        </p>

        {/* Row 3: snippet + identity */}
        <p className="text-xs text-muted-foreground/50 truncate mt-0.5 leading-tight">
          {thread.snippet}
        </p>
        <CommTrackingBadges
          source={thread}
          compact
          showTiming={false}
          className="mt-1"
        />
        <CommIntelligenceBadges
          source={thread}
          compact
          showReasons={false}
          showMetrics={false}
          className="mt-1"
        />
        {identityEmail && (
          <p className="text-[10px] text-primary/50 truncate">{identityEmail}</p>
        )}
      </div>
      </button>
    </div>
  );
}

// ─── Thread detail view ────────────────────────────────────────────────────────

function InboxSummaryCards({
  summary,
  commSettings,
  onSelectThread,
}: {
  summary?: CommIntelligenceSummary;
  commSettings?: CommSettings;
  onSelectThread: (threadId: string | null) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const cards = [
    { label: 'Tracked sends', value: summary?.totals.trackedSends ?? 0, tone: 'text-foreground' },
    { label: 'Replies', value: summary?.totals.replies ?? 0, tone: 'text-emerald-400' },
    { label: 'Estimated opens', value: summary?.totals.estimatedOpens ?? 0, tone: 'text-cyan-400' },
    { label: 'Needs follow-up', value: summary?.queues.needsFollowUp ?? 0, tone: 'text-amber-400' },
    { label: 'Hot leads', value: summary?.queues.hotLeads ?? 0, tone: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 group transition-opacity hover:opacity-80"
        >
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/90">
              Intelligence Snapshot
            </p>
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              Last 30d
              {commSettings?.trackingEnabled === false && ' · tracking off'}
            </p>
          </div>
          <div className="h-5 w-5 rounded-full flex items-center justify-center bg-white/5 border border-white/5 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors">
            {isCollapsed ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </div>
        </button>
        <CommAlertsPanel onSelectThread={(threadId) => onSelectThread(threadId)} />
      </div>

      {!isCollapsed && (
        <>
          <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-5">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2 transition-colors hover:bg-white/[0.05]"
              >
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium leading-none mb-1.5">
                  {card.label}
                </p>
                <p className={cn('text-base font-bold tracking-tight leading-none', card.tone)}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {summary?.responseTimes && (
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Typical response window <span className="text-foreground/70 font-medium">{summary.responseTimes.humanWindow ?? 'not enough history'}</span>.
                {summary.responseTimes.signalQuality !== 'usable' && ' Signal quality is building.'}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed italic">
              Open signals are estimated. Gmail image proxying and security scanners can create noise.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ThreadView({
  threadId, onClose, identities, userId, commSettings,
}: {
  threadId: string; onClose: () => void;
  identities: CommIdentity[]; userId: string; commSettings?: CommSettings;
}) {
  const { data: thread, isLoading: threadLoading } = useThread(threadId);
  const { data: messagesRes, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useMessages({ threadId });
  const archiveMutation = useArchiveThread();
  const markRead = useMarkThreadRead();
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  const markUnread = useMarkThreadUnread();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [forwardMessage, setForwardMessage] = useState<CommMessage | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);

  const messages = messagesRes?.data ?? [];
  const lastMessage = messages[messages.length - 1];

  // Auto mark read
  useEffect(() => {
    if (thread?.hasUnread) markReadRef.current.mutate(threadId);
  }, [threadId, thread?.hasUnread]);

  // Auto expand last message
  useEffect(() => {
    if (lastMessage) {
      const id = lastMessage.id ?? lastMessage.gmailMessageId ?? '';
      setExpandedIds(new Set([id]));
    }
  }, [lastMessage?.id, lastMessage?.gmailMessageId]);

  // Reset reply on thread change
  useEffect(() => {
    setReplyOpen(false);
    setForwardMessage(null);
  }, [threadId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Redesigned Thread Intelligence Panel ── */}
      <div className="sticky top-0 z-10 bg-[#0a0a0f] px-4 sm:px-6 py-4 border-b border-white/5 shrink-0">
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
                <span>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
                {thread?.latestMessageAt && (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span>Last active {formatEmailDate(thread.latestMessageAt)}</span>
                  </>
                )}
              </div>
            }
            actions={
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={thread?.hasUnread ? 'Mark as read' : 'Mark as unread'}
                  onClick={() => thread?.hasUnread ? markRead.mutate(threadId) : markUnread.mutate(threadId)}
                >
                  <MailOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Archive"
                  onClick={() => { archiveMutation.mutate(threadId); onClose(); }}
                >
                  <Archive className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Refresh"
                  onClick={() => refetchMessages()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            }
          />
        )}
      </div>

      {/* ── Scrollable body: messages + reply ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Messages */}
        <div className="px-4 sm:px-6 py-4 space-y-2">
          {messagesError ? (
            <div className="py-16 text-center space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-red-400/60" />
              <p className="text-sm text-muted-foreground">Failed to load thread.</p>
              <Button variant="ghost" size="sm" onClick={() => refetchMessages()} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : messagesLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2].map((i) => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">No messages in this thread.</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const msgId = msg.id ?? msg.gmailMessageId ?? String(idx);
              const isLast = idx === messages.length - 1;
              return (
                <InlineMessageItem
                  key={msgId}
                  message={msg}
                  isExpanded={expandedIds.has(msgId) || isLast}
                  onToggle={() => toggleExpand(msgId)}
                  onForward={() => setForwardMessage(msg)}
                />
              );
            })
          )}
        </div>

        {/* ── Collapsed reply prompt ── */}
        {!replyOpen && lastMessage && !messagesLoading && (
          <div className="px-4 sm:px-6 pb-6">
            <button
              onClick={() => setReplyOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left group"
            >
              <Reply className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              <span className="text-sm text-muted-foreground group-hover:text-foreground/70 transition-colors">
                Reply to {lastMessage.from?.name || lastMessage.from?.email || 'this thread'}…
              </span>
            </button>
          </div>
        )}

        {/* ── Expanded reply box ── */}
        {replyOpen && (
          <div className="px-4 sm:px-6 pb-6">
            <ReplyBox
              lastMessage={lastMessage}
              identities={identities}
              userId={userId}
              commSettings={commSettings}
              onClose={() => setReplyOpen(false)}
            />
          </div>
        )}
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

// ─── Reply box (Gmail-style bottom compose) ────────────────────────────────────

function ReplyBox({
  lastMessage, identities, userId, commSettings, onClose,
}: {
  lastMessage: CommMessage | undefined;
  identities: CommIdentity[]; userId: string; commSettings?: CommSettings; onClose: () => void;
}) {
  const replyMutation = useReplyToMessage();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(
    (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
  );

  const defaultIdentityId = (identities.find((i) => i.isDefault) ?? identities[0])?.id ?? '';
  const [selectedIdentityId, setSelectedIdentityId] = useState(defaultIdentityId);
  const activeIdentityId = selectedIdentityId || defaultIdentityId;

  useEffect(() => {
    setTrackingEnabled(
      (commSettings?.trackingEnabled ?? true) && (commSettings?.openTrackingEnabled ?? true),
    );
  }, [commSettings?.openTrackingEnabled, commSettings?.trackingEnabled, lastMessage?.id, lastMessage?.gmailMessageId]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }), Image],
    content: '',
    editorProps: {
      attributes: {
        class: 'min-h-[100px] max-h-[200px] overflow-y-auto px-3 py-3 text-sm text-foreground focus:outline-none',
        'data-testid': 'reply-editor',
      },
    },
  });

  const uploadAttachment = async (file: File): Promise<UploadAttachmentResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.fetch<{ data?: UploadAttachmentResponse } | UploadAttachmentResponse>(
      '/attachments/upload', { method: 'POST', body: formData, service: 'comm' },
    );
    return ('data' in response ? response.data : response) as UploadAttachmentResponse;
  };

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsUploadingAttachment(true);
    try {
      const uploads = await Promise.all(Array.from(files).map(uploadAttachment));
      setUploadedAttachments((cur) => [...cur, ...uploads.map((u) => ({ s3Key: u.s3Key, filename: u.filename, size: u.size }))]);
    } finally { setIsUploadingAttachment(false); }
  };

  const handleReply = async (replyAll = false) => {
    const bodyHtml = normalizeEditorHtml(editor?.getHTML() ?? '');
    const bodyText = editor?.getText().trim() || undefined;
    if ((!bodyHtml && !bodyText) || !lastMessage) return;
    const messageId = lastMessage.gmailMessageId ?? lastMessage.id ?? '';
    await replyMutation.mutateAsync({
      messageId,
      dto: {
        identityId: activeIdentityId, bodyText, bodyHtml,
        attachmentS3Keys: uploadedAttachments.length > 0 ? uploadedAttachments.map((a) => a.s3Key) : undefined,
        replyAll,
        trackingEnabled,
      },
    });
    editor?.commands.clearContent(true);
    setUploadedAttachments([]);
    onClose();
  };

  const ownIdentities = identities.filter((i) => i.userId === userId);
  const teamIdentities = identities.filter((i) => i.userId !== userId);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden">
      {/* From selector + close */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span className="shrink-0">From:</span>
          <Select value={activeIdentityId} onValueChange={setSelectedIdentityId}>
            <SelectTrigger className="h-6 text-xs bg-transparent border-0 p-0 focus:ring-0 shadow-none min-w-0 max-w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ownIdentities.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Your Accounts</SelectLabel>
                  {ownIdentities.map((id) => (
                    <SelectItem key={id.id} value={id.id}>{id.displayName || id.email}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {teamIdentities.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Team Accounts</SelectLabel>
                  {teamIdentities.map((id) => (
                    <SelectItem key={id.id} value={id.id}>{id.displayName ? `${id.displayName} · ${id.email}` : id.email}</SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Toolbar + editor */}
      <ReplyToolbar editor={editor} />
      <EditorContent editor={editor} />

      {/* Attachments */}
      {uploadedAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 py-2 border-t border-white/5">
          {uploadedAttachments.map((a) => (
            <span key={a.s3Key} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px]">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[120px]">{a.filename}</span>
              <button
                type="button"
                onClick={() => setUploadedAttachments((cur) => cur.filter((x) => x.s3Key !== a.s3Key))}
                className="text-muted-foreground hover:text-foreground ml-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Send bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-white/5">
        <div className="flex items-center gap-1">
          <input
            ref={attachmentInputRef} type="file" multiple className="hidden"
            onChange={(e) => { void handleAttachmentUpload(e.target.files); e.target.value = ''; }}
          />
          <Button variant="ghost" size="sm" onClick={() => attachmentInputRef.current?.click()}
            disabled={isUploadingAttachment} className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            {isUploadingAttachment ? 'Uploading…' : 'Attach'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void handleReply(true)}
            disabled={replyMutation.isPending || !activeIdentityId}
            className="h-8 text-xs text-muted-foreground hover:text-foreground hidden sm:flex">
            Reply All
          </Button>
          <Button size="sm" onClick={() => void handleReply()}
            disabled={replyMutation.isPending || !activeIdentityId}
            className="h-8 px-5 text-xs font-semibold shadow-lg shadow-primary/20">
            {replyMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</> : 'Send'}
          </Button>
        </div>
      </div>
      <div className="px-3 pb-3">
        <TrackingSendControl
          value={trackingEnabled}
          onChange={setTrackingEnabled}
          settings={commSettings}
          hasHtmlSupport
          compact
        />
      </div>
    </div>
  );
}

// ─── Message item ─────────────────────────────────────────────────────────────

export function InlineMessageItem({
  message, isExpanded, onToggle, onForward,
}: {
  message: CommMessage; isExpanded: boolean; onToggle: () => void; onForward: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadingAttachment, setLoadingAttachment] = useState<number | null>(null);
  const safeHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
        ADD_TAGS: ['img'],
        ALLOWED_ATTR: ['src', 'alt', 'href', 'target', 'rel', 'class', 'style'],
        ALLOW_DATA_ATTR: false, FORCE_BODY: true,
      })
    : '';
  const hasSafeHtml = safeHtml.trim().length > 0;
  const fromLabel = message.from?.name || message.from?.email || 'Unknown';

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

  return (
    <div className={cn(
      'rounded-xl border transition-colors overflow-hidden',
      isExpanded ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 bg-transparent hover:bg-white/[0.02]',
    )}>
      {/* Header row */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 transition-colors">
        <Avatar name={fromLabel} size="sm" />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{fromLabel}</p>
            <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap shrink-0">
              {formatEmailDate(message.sentAt)}
            </span>
          </div>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground/60 truncate leading-tight mt-0.5">
              {message.snippet || message.bodyText?.slice(0, 80)}
            </p>
          )}
          {isExpanded && (
            <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
              to {message.to?.map((a) => a.email).join(', ') || 'me'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {message.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 text-muted-foreground/40" />}
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/40" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
        </div>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="border-t border-white/5">
          {/* From/To metadata */}
          <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
            <div className="text-[11px] text-muted-foreground space-y-0.5 min-w-0">
              <p className="truncate">
                <span className="text-foreground/50">From: </span>
                {message.from?.name ? `${message.from.name} <${message.from.email}>` : message.from?.email}
              </p>
              {message.to?.length > 0 && (
                <p className="truncate">
                  <span className="text-foreground/50">To: </span>
                  {message.to.map((a) => a.email).join(', ')}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onForward} className="h-7 text-[11px] px-2.5 shrink-0">
              <CornerUpRight className="h-3 w-3 mr-1" /> Forward
            </Button>
          </div>

          <div className="px-4 pb-3 space-y-2">
            <CommTrackingBadges source={message} compact showTiming={false} />
            <CommIntelligenceBadges source={message} compact showReasons={false} />
          </div>

          {/* Email body */}
          <div className="mx-4 mb-4 rounded-lg overflow-hidden border border-white/10 bg-white shadow-lg">
            {hasSafeHtml ? (
              <iframe
                ref={iframeRef}
                title="Email body"
                sandbox="allow-same-origin"
                scrolling="no"
                style={{ width: '100%', border: 'none', display: 'block', minHeight: '60px' }}
              />
            ) : (
              <pre className="px-4 py-3 text-xs text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                {message.bodyText || '(empty)'}
              </pre>
            )}
          </div>

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {message.attachments.map((att: CommAttachment, i: number) => {
                const isLoading = loadingAttachment === i;
                const gmailMessageId = message.gmailMessageId ?? message.id ?? '';
                const handleOpen = async (e: React.MouseEvent) => {
                  e.preventDefault();
                  if (isLoading) return;
                  // If CDN URL is already known, open directly
                  if (att.cdnUrl) { window.open(att.cdnUrl, '_blank', 'noopener,noreferrer'); return; }
                  setLoadingAttachment(i);
                  try {
                    const res = await api.getCommAttachmentUrl(gmailMessageId, i);
                    const url = (res as any)?.data?.url ?? (res as any)?.url;
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    else toast.error('Attachment unavailable');
                  } catch (err: any) {
                    const reason = err?.data?.reason ?? err?.reason;
                    const msg = reason === 'TOKEN_EXPIRED'
                      ? 'Gmail token expired — reconnect the account in Settings → Gmail.'
                      : 'Attachment could not be retrieved. Try again or reconnect the account.';
                    toast.error('Could not open attachment', msg);
                  } finally {
                    setLoadingAttachment(null);
                  }
                };
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { void handleOpen(e); }}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    <span className="truncate max-w-[140px]">{att.filename}</span>
                    {att.size && <span className="text-muted-foreground/60">· {formatFileSize(att.size)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

