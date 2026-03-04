# comm-service — Frontend Ticket Pack

**Apps:** `apps/frontend/sales-dashboard` + `apps/frontend/pm-dashboard`
**Stack:** Next.js, React Query (TanStack), Zustand, Tailwind, shadcn/ui
**API client pattern:** Extend existing `ApiClient` in `lib/api.ts` with `service: 'comm'`
**Milestone mapping:** M1=COMM-FE-001–005 | M2=006–010 | M3=011–014 | M4=015–018 | M5=019–020

---

## COMM-FE-001 — Comm API Client + Shared Hooks Foundation
**Milestone:** M1 | **Estimate:** 1 day | **Apps:** both

**Scope:**
Extend `ApiClient` in both `apps/frontend/sales-dashboard/src/lib/api.ts` and `apps/frontend/pm-dashboard/src/lib/api.ts`:

1. Add `commUrl` pointing to `NEXT_PUBLIC_COMM_API_URL || 'http://localhost:3004/api/comm'`
2. Add `service: 'comm'` support in `fetch()` method (same pattern as `'pm'`)
3. Add comm-specific API methods:

```typescript
// Identities
listIdentities(): Promise<CommIdentityListResponse>
initiateOAuth(brandId: string): Promise<{ redirectUrl: string }>
disconnectIdentity(id: string): Promise<void>
setDefaultIdentity(id: string): Promise<void>

// Threads
listThreads(params?: ListThreadsParams): Promise<PaginatedResponse<CommThread>>
getThread(id: string): Promise<CommThreadDetail>
archiveThread(id: string): Promise<void>
markThreadRead(id: string): Promise<void>

// Messages
listMessages(params?: ListMessagesParams): Promise<PaginatedResponse<CommMessage>>
getMessage(id: string): Promise<CommMessage>
sendMessage(dto: SendMessageDto, idempotencyKey: string): Promise<CommMessage>
replyToMessage(id: string, dto: ReplyDto, idempotencyKey: string): Promise<CommMessage>
forwardMessage(id: string, dto: ForwardDto, idempotencyKey: string): Promise<CommMessage>

// Timeline
getEntityTimeline(entityType: string, entityId: string, params?: PaginationParams): Promise<PaginatedResponse<CommMessageSummary>>

// Links
linkThread(threadId: string, entityType: string, entityId: string): Promise<void>
unlinkThread(threadId: string, entityType: string, entityId: string): Promise<void>

// Attachments
getAttachmentUrl(messageId: string, attachmentIndex: number): Promise<{ url: string }>
```

4. Create shared TypeScript types in `src/types/comm.types.ts`:

```typescript
interface CommIdentity {
  id: string; brandId: string; email: string; displayName: string;
  isDefault: boolean;
  syncState: { status: 'active'|'error'|'paused'; lastSyncAt: string|null; lastError: string|null };
}

interface CommThread {
  id: string; subject: string; snippet: string; participants: string[];
  latestMessageAt: string; messageCount: number; hasAttachments: boolean;
  isRead: boolean; isArchived: boolean; labelIds: string[];
  entityLinks: EntityLink[];
}

interface CommMessage {
  id: string; threadId: string; direction: 'inbound'|'outbound';
  from: EmailAddress; to: EmailAddress[]; cc: EmailAddress[];
  subject: string; bodyHtml: string; bodyText: string; snippet: string;
  attachments: CommAttachment[]; sentAt: string; labelIds: string[];
}

interface CommMessageSummary {
  id: string; threadId: string; direction: 'inbound'|'outbound';
  from: EmailAddress; subject: string; snippet: string; sentAt: string;
  hasAttachments: boolean;
}

interface EntityLink { entityType: 'lead'|'client'|'project'; entityId: string }
interface EmailAddress { name: string; email: string }
interface CommAttachment { filename: string; mimeType: string; size: number; isInline: boolean }
```

**Acceptance:** `api.listThreads()` returns typed response; TypeScript compiles without errors.

---

## COMM-FE-002 — React Query Hooks for Comm
**Milestone:** M1 | **Estimate:** 1 day | **Apps:** both (shared `src/hooks/use-comm.ts`)

**Scope:**
Create `src/hooks/use-comm.ts` with all React Query hooks:

```typescript
// Read hooks
export function useIdentities() → useQuery
export function useThreads(params?) → useInfiniteQuery (for inbox)
export function useThread(id) → useQuery
export function useMessages(params?) → useQuery
export function useEntityTimeline(entityType, entityId, params?) → useQuery

// Mutation hooks
export function useSendMessage() → useMutation (generates UUID idempotency key internally)
export function useReplyToMessage() → useMutation
export function useArchiveThread() → useMutation (optimistic update: remove from inbox list)
export function useMarkThreadRead() → useMutation (optimistic update: isRead → true)
export function useLinkThread() → useMutation
export function useUnlinkThread() → useMutation
export function useInitiateOAuth() → useMutation
export function useDisconnectIdentity() → useMutation
```

**Query key factory:**
```typescript
export const commKeys = {
  all: ['comm'] as const,
  identities: () => [...commKeys.all, 'identities'],
  threads: (params?) => [...commKeys.all, 'threads', params],
  thread: (id) => [...commKeys.all, 'threads', id],
  timeline: (entityType, entityId, params?) => [...commKeys.all, 'timeline', entityType, entityId, params],
}
```

**Cache invalidation:** All mutations invalidate appropriate `commKeys.*` entries.

**Idempotency key:** `useSendMessage` and `useReplyToMessage` generate a `crypto.randomUUID()` per mutation invocation, pass as `Idempotency-Key` header via API client.

**Acceptance:** `useThreads()` returns paginated data; `useSendMessage()` triggers refetch on success.

---

## COMM-FE-003 — Email Timeline Tab in Lead Detail Sheet (sales-dashboard)
**Milestone:** M1 | **Estimate:** 1 day | **App:** sales-dashboard

**Scope:**
Update `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx`:

1. Add "Emails" tab alongside existing Activity/Notes tabs (use `Tabs` from shadcn or match existing tab pattern)
2. Create `_components/lead-email-timeline.tsx`:

```typescript
// Props: leadId: string
// Uses: useEntityTimeline('lead', leadId)
// Renders: chronological list of CommMessageSummary cards
```

Each email card shows:
- Direction indicator: `→` (outbound) or `←` (inbound) with color
- From name + email (or "You" for outbound)
- Subject (truncated)
- Snippet (1 line, muted)
- Timestamp (relative: "2 hours ago")
- Attachment paperclip icon if `hasAttachments`
- Click → opens `ThreadViewDrawer` (COMM-FE-006)

3. Empty state: "No emails yet — connect a Gmail account in Settings" with link
4. Loading skeleton: 3 skeleton cards (same pattern as other skeletons in the app)

**Acceptance:**
- Timeline shows inbound/outbound emails linked to the lead
- Empty state shown when no emails
- Clicking a card opens thread detail

---

## COMM-FE-004 — Email Timeline Tab in Client Detail Sheet (sales-dashboard)
**Milestone:** M1 | **Estimate:** 0.5 day | **App:** sales-dashboard

**Scope:**
Identical to COMM-FE-003 but for `client-detail-sheet.tsx`:
- Reuse `lead-email-timeline.tsx` as `entity-email-timeline.tsx` with `entityType` prop
- Add "Emails" tab to client detail sheet

**Acceptance:** Client detail sheet shows linked emails.

---

## COMM-FE-005 — Gmail Settings Page (sales-dashboard)
**Milestone:** M1 | **Estimate:** 1 day | **App:** sales-dashboard

**Scope:**
Create `apps/frontend/sales-dashboard/src/app/dashboard/settings/gmail/page.tsx`:

```
/dashboard/settings/gmail
```

**UI sections:**

1. **Connected Accounts** list:
   - For each `CommIdentity`: avatar, display name, email, brand badge, sync status badge (`active` = green, `error` = red, `paused` = amber)
   - "Set as Default" button (if not already default for brand)
   - "Disconnect" button with confirmation modal
   - If `status = error`: inline alert "Token expired — reconnect required" + "Reconnect" button

2. **Connect New Account** button:
   - Opens modal: select brand → click "Connect Gmail"
   - `useInitiateOAuth(brandId)` → redirects to Google consent
   - On return from OAuth: URL contains `?success=1&identityId=xxx` or `?error=...`
   - Show toast: "Gmail connected successfully" or error

3. **Sync Status** section: shows last sync time per account

Add link to this page from the settings nav (sidebar or top nav settings area).

**Acceptance:**
- User can connect Gmail for a brand
- Connected accounts listed with sync status
- Disconnect works with confirmation

---

## COMM-FE-006 — Thread View Drawer (shared component)
**Milestone:** M2 | **Estimate:** 1.5 days | **Apps:** both

**Scope:**
Create `src/components/shared/comm/thread-view-drawer.tsx` in both apps (or extract to shared lib):

```typescript
interface ThreadViewDrawerProps {
  threadId: string | null;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
}
```

**Drawer layout (right-side slide-over, wide ~720px):**

```
┌──────────────────────────────────────────────────────┐
│ Subject                              [Archive] [×]   │
│ 3 messages · lead@example.com · 2 days ago           │
├──────────────────────────────────────────────────────┤
│ [Message 1 - collapsed if old]                       │
│ [Message 2 - collapsed]                              │
│ [Latest Message - expanded]                          │
│   From: Alice <alice@brand.com>                      │
│   To: client@example.com                             │
│   [email body rendered in sandboxed iframe]          │
│   [Attachments if any]                               │
├──────────────────────────────────────────────────────┤
│ ┌─ Reply ──────────────────────────────────────────┐ │
│ │ Identity selector: [Brand A <brand@...]          │ │
│ │ [Rich text area - min-height 80px]               │ │
│ │                              [Reply] [Forward]   │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Email body rendering:**
- Render `bodyHtml` in a `<iframe sandbox="allow-same-origin" referrerpolicy="no-referrer">` element
- Set `srcdoc` attribute (never `src`)
- Auto-resize iframe to content height

**Reply box:**
- `<textarea>` or minimal rich text (no full editor needed for V1)
- **Alias selector** dropdown (flattened list of `sendAsAliases[]` from all `useIdentities()` — each option is an alias, not a raw identity; pre-selects the alias that received the original thread)
- "Reply" button → `useReplyToMessage()` mutation (sends `identityId` of the owner + `fromAlias` of the selected alias)
- Loading state on button while pending

**Collapsed messages:** older messages show sender + snippet + date, expand on click.

**Acceptance:**
- Thread opens with messages in chronological order
- Latest message expanded by default
- Reply sends and updates thread in-place (invalidate thread query)
- Email body renders without XSS (sandboxed iframe)

---

## COMM-FE-007 — Compose New Email Drawer (sales-dashboard + pm-dashboard)
**Milestone:** M2 | **Estimate:** 1 day | **App:** both

**Scope:**
Create `src/components/shared/comm/compose-drawer.tsx`:

```typescript
interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;           // pre-fill recipient (e.g., from lead email)
  defaultEntityType?: string;   // auto-link on send
  defaultEntityId?: string;
}
```

**UI:**
- Floating drawer (bottom-right corner, like Gmail compose, 480px wide)
- Fields: From (**alias selector** — lists `sendAsAliases[]` across all connected identities, grouped by brand; shows `{displayName} <{email}>`), To (tag input), CC (collapsible), Subject, Body (textarea)
- "Send" button → `useSendMessage()` with generated `Idempotency-Key`
- On success: close drawer, toast "Email sent", invalidate threads + timeline queries
- On error: show inline error (do not close drawer)

**Trigger:**
- sales-dashboard: "Compose" button in leads page header + within lead detail sheet
- pm-dashboard: "Email Client" button on project detail page (see COMM-FE-021)

**Acceptance:**
- Email appears in Gmail sent box after send
- Timeline updates after send (via cache invalidation)
- Duplicate send prevented by idempotency key

---

## COMM-FE-008 — Inbox View Page (sales-dashboard)
**Milestone:** M2 | **Estimate:** 1.5 days | **App:** sales-dashboard

**Scope:**
Create `apps/frontend/sales-dashboard/src/app/dashboard/inbox/page.tsx`:

```
/dashboard/inbox
```

**Layout: two-column (list + detail)**

Left column (thread list):
- Search input (debounced 300ms → `useThreads({ search })`)
- Filter chips: All / Unread / Sent / Archived
- `useInfiniteQuery` threads with "Load more" at bottom
- Each row: sender avatar initial, from name, subject, snippet, time, unread dot
- Click → opens right column (ThreadViewDrawer or inline panel)

Right column:
- Default: empty state "Select a thread to read"
- When thread selected: renders `ThreadViewDrawer` content inline (not as overlay)

**Keyboard shortcut:** `c` to open compose drawer (when not in input focus).

Add "Inbox" nav item to sales-dashboard sidebar with unread count badge.

**Acceptance:**
- Thread list loads and scrolls
- Selecting thread shows detail
- Search filters threads in real time (debounced)

---

## COMM-FE-009 — Manual Link Widget (sales-dashboard)
**Milestone:** M2 | **Estimate:** 0.5 day | **App:** sales-dashboard

**Scope:**
Add "Link to entity" UI to `ThreadViewDrawer`:

**"Link Thread" section at bottom of drawer:**
- Shows current entity links as chips: `[Lead: Acme Inc ×]`
- "Link to..." button → dropdown with entity type selector (Lead / Client) + search input
- On select: `useLinkThread(threadId, entityType, entityId)`
- "×" on chip: `useUnlinkThread()`

**Acceptance:**
- Thread can be linked to any lead or client
- Existing links shown as removable chips
- Link change reflected immediately in timeline tab

---

## COMM-FE-010 — Email Timeline Tab in PM Project Detail (pm-dashboard)
**Milestone:** M2 | **Estimate:** 0.5 day | **App:** pm-dashboard

**Scope:**
Add "Emails" tab to project detail page `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/page.tsx`:
- Reuse `EntityEmailTimeline` component (`entityType='project'`, `entityId=projectId`)
- Same cards pattern as lead/client timeline
- Click → opens `ThreadViewDrawer` (which includes reply box — PM users can reply from here)

**Acceptance:** Project page shows linked emails in timeline; PM can click to view + reply.

---

## COMM-FE-011 — useCommSocket Hook (Realtime)
**Milestone:** M3 | **Estimate:** 1 day | **Apps:** both

**Scope:**
Create `src/hooks/use-comm-socket.ts`:

```typescript
export function useCommSocket() {
  // Connect to Socket.io /comm namespace
  // Auth: { token: localStorage.getItem('accessToken') }
  // Auto-reconnect on disconnect
  // Return: { isConnected, socket }
}

export function useCommEvents(options: {
  onNewMessage?: (msg: CommMessageSummary) => void;
  onThreadUpdated?: (thread: CommThreadSummary) => void;
  onSyncProgress?: (progress: SyncProgress) => void;
  onIdentityError?: (error: IdentityError) => void;
}) {
  // Subscribe to WS events and call the provided callbacks
  // Invalidate React Query cache on message:new, thread:updated
}
```

**Integration:**
- Call `useCommEvents` in the layout component of both dashboards
- On `message:new`: invalidate `commKeys.threads()` and `commKeys.timeline()` queries
- On `identity:error`: show persistent toast with "Reconnect Gmail" action

**Acceptance:**
- New email appears in inbox without refresh
- Identity error shown as persistent notification

---

## COMM-FE-012 — Realtime Unread Badge
**Milestone:** M3 | **Estimate:** 0.5 day | **Apps:** both

**Scope:**
- Track unread thread count in Zustand: `useCommStore` with `unreadCount: number`
- `useCommEvents` increments count on `message:new` (inbound)
- Count clears when thread opened (`useMarkThreadRead` mutation)
- Render count badge on "Inbox" nav item (sales-dashboard) and notification bell (pm-dashboard)
- Badge: red circle, max display "99+"

**Acceptance:** Badge increments on new inbound email; clears after reading.

---

## COMM-FE-013 — Sync Progress + Identity Status UI
**Milestone:** M3 | **Estimate:** 0.5 day | **App:** sales-dashboard settings

**Scope:**
Update Gmail settings page (COMM-FE-005):
- Subscribe to `sync:progress` WS event for connected identities
- Show progress bar on identity card during active sync: "Syncing... 450 / 1200 messages"
- After sync complete: show last sync time ("Last synced 2 minutes ago")
- `identity:error` event → show error state on card with reconnect button

**Acceptance:** Sync progress visible in settings during initial sync.

---

## COMM-FE-014 — WS Reconnect + Connection Status
**Milestone:** M3 | **Estimate:** 0.5 day | **Apps:** both

**Scope:**
- Show subtle "Reconnecting..." indicator (status bar or toast) when WS disconnects
- Auto-reconnect with exponential backoff (socket.io client handles this natively)
- On reconnect: refetch all active comm queries to catch missed updates
- Connection status exposed via `useCommSocket().isConnected`

**Acceptance:** Brief disconnect does not require page reload; data auto-recovers on reconnect.

---

## COMM-FE-015 — Multi-Identity Compose (M4)
**Milestone:** M4 | **Estimate:** 0.5 day | **Apps:** sales-dashboard

**Scope:**
Enhance `ComposeDrawer` (COMM-FE-007) and `ThreadViewDrawer` reply box (COMM-FE-006):
- Group identities by brand in selector: `Brand A (default)`, `Brand B`, etc.
- Default selection: if composing from within lead context that has a brand, pre-select default identity for that brand
- For reply: pre-select identity that received original thread

**Acceptance:** Correct sender identity pre-selected based on context.

---

## COMM-FE-016 — Attachment Viewer
**Milestone:** M4 | **Estimate:** 0.5 day | **Apps:** both

**Scope:**
In `ThreadViewDrawer`, for each message with attachments:
- List attachments below email body: `📎 filename.pdf (245 KB)`
- Click → call `api.getAttachmentUrl(messageId, index)` → open presigned URL in new tab
- Image attachments: show inline thumbnail (lazy loaded)
- Show spinner while fetching presigned URL

**Acceptance:** Attachments open without exposing raw Gmail API URLs to client.

---

## COMM-FE-017 — Thread Search UI (sales-dashboard Inbox)
**Milestone:** M4 | **Estimate:** 0.5 day | **App:** sales-dashboard

**Scope:**
Enhance inbox page (COMM-FE-008) search:
- Debounced input already hits `useThreads({ search })` (COMM-FE-008)
- Add identity filter: dropdown "All accounts / Brand A / Brand B"
- Add date range filter: "Last 7 days / 30 days / 90 days / Custom"
- Highlight search term in subject + snippet results

**Acceptance:** Search filters and identity filter work in combination.

---

## COMM-FE-018 — Gmail Settings in PM Dashboard
**Milestone:** M4 | **Estimate:** 0.5 day | **App:** pm-dashboard

**Scope:**
Add read-only Gmail identity status view to pm-dashboard settings:
- List connected identities (same data as sales-dashboard settings)
- Read-only: no connect/disconnect (those actions live in sales-dashboard only)
- Shows sync status per identity
- Link: "Manage Gmail accounts in Sales Dashboard →"

**Acceptance:** PM users can see which Gmail accounts are connected and their sync status.

---

## COMM-FE-021 — PM Dashboard Active Email Actions (Send/Reply from Project Context)
**Milestone:** M2 | **Estimate:** 1 day | **App:** pm-dashboard

> **Gap fix:** Original plan only put read-only email timeline in pm-dashboard (COMM-FE-010). PM team needs full send/reply capability in the context of a project — composing client updates, replying to client questions, etc.

**Scope:**
Add active email capabilities to the PM project detail page `apps/frontend/pm-dashboard/src/app/dashboard/projects/[id]/page.tsx`:

**1. "Email Client" button on project detail header:**
- Visible when `project.clientId` is set
- Opens `ComposeDrawer` (COMM-FE-007, now available in pm-dashboard) with:
  - `defaultTo`: resolved client email (fetched from core-service client record)
  - `defaultEntityType: 'project'`
  - `defaultEntityId: project.id`
  - `defaultSubject`: pre-filled with `[Project: {project.name}]` prefix

**2. ThreadViewDrawer reply in PM context:**
- Clicking any email card in the project email timeline opens `ThreadViewDrawer`
- Reply box is fully active (not disabled) — same as sales-dashboard
- Identity selector shows all connected Gmail accounts (PM picks appropriate sender)
- Reply sends and auto-links to project (`entityType: 'project'`)

**3. Inline reply shortcut in email timeline cards:**
- Each `CommMessageCard` shows a "Reply" icon button (only inbound messages)
- Click → opens `ThreadViewDrawer` with the reply box pre-focused

**New React Query hook needed:** `useProjectClientEmail(projectId)` → fetches project → fetches client by `project.clientId` → returns `client.email`

**Acceptance:**
- PM can compose a new email to a project's client in one click
- PM can reply to a client email from within the project detail page
- All PM-sent emails appear in the project email timeline
- Compose and reply work end-to-end (same path as sales-dashboard)

---

## COMM-FE-019 — Error States & Empty States Polish
**Milestone:** M5 | **Estimate:** 0.5 day | **Apps:** both

**Scope:**
Audit all comm UI components for missing error/empty states:
- Thread list: error state "Failed to load emails — retry button"
- Thread detail: error state if `useThread` fails
- Timeline: empty state message tailored to entity type ("No emails linked to this lead yet")
- Compose: clear validation error messages per field
- All loading states: use skeleton pattern matching the rest of the app

**Acceptance:** No component renders blank/broken on network error or empty data.

---

## COMM-FE-020 — Environment Config & Feature Flag
**Milestone:** M5 | **Estimate:** 0.5 day | **Apps:** both

**Scope:**
- Add `NEXT_PUBLIC_COMM_API_URL` to `.env.local` examples and deployment config
- Add `NEXT_PUBLIC_COMM_ENABLED=true/false` feature flag:
  - `false`: hides all comm UI (inbox nav item, email tabs, compose button, settings page)
  - Allows safe deployment to envs where comm-service is not yet running
- Document env vars in `docs/` or README

**Acceptance:** Setting `NEXT_PUBLIC_COMM_ENABLED=false` completely hides comm UI with no broken queries.

---

## Component Inventory

| Component | Path | Used in |
|---|---|---|
| `EntityEmailTimeline` | `shared/comm/entity-email-timeline.tsx` | lead/client/project detail |
| `ThreadViewDrawer` | `shared/comm/thread-view-drawer.tsx` | inbox + detail sheets |
| `ComposeDrawer` | `shared/comm/compose-drawer.tsx` | sales-dashboard |
| `CommMessageCard` | `shared/comm/comm-message-card.tsx` | timeline + thread list |
| `IdentitySelector` | `shared/comm/identity-selector.tsx` | compose + reply |
| `AttachmentList` | `shared/comm/attachment-list.tsx` | thread view |
| `SyncStatusBadge` | `shared/comm/sync-status-badge.tsx` | settings |

---

## New Env Vars (Frontend)

```env
NEXT_PUBLIC_COMM_API_URL=http://localhost:3004/api/comm
NEXT_PUBLIC_COMM_WS_URL=http://localhost:3004
NEXT_PUBLIC_COMM_ENABLED=true
```

---

## Dependency Summary

| Ticket | Blocked by |
|---|---|
| COMM-FE-002 | 001 |
| COMM-FE-003 | 002 |
| COMM-FE-004 | 003 |
| COMM-FE-005 | 002 |
| COMM-FE-006 | 002 |
| COMM-FE-007 | 006 |
| COMM-FE-008 | 006, 007 |
| COMM-FE-009 | 006 |
| COMM-FE-010 | 002 |
| COMM-FE-011 | 002 |
| COMM-FE-012 | 011 |
| COMM-FE-013 | 011, 005 |
| COMM-FE-014 | 011 |
| COMM-FE-015 | 006, 007 |
| COMM-FE-016 | 006 |
| COMM-FE-017 | 008 |
| COMM-FE-021 | 006, 007, 010 |
