# comm-service — Architecture Document

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Approved for implementation
**Scope lock:** Gmail-first (90-95% workflow), MongoDB archive, entity-centric linking, multi-brand sender, realtime WS, reliability baseline. Client approval external flow: HOLD.

---

## 1. Position in the Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (3000)                     │
│              routes /api/comm/* → comm-service              │
└──────────────┬──────────────────────────────────────────────┘
               │
   ┌───────────▼──────────────────────────────────────────┐
   │              comm-service  (port 3004)               │
   │  NestJS  │  MongoDB (Mongoose)  │  Bull queues        │
   │  Socket.io gateway  │  Redis pub/sub                  │
   └──────┬───────────────────────────────────────────────┘
          │  reads org/brand/user data
   ┌──────▼───────────┐   ┌────────────────┐
   │  core-service    │   │  pm-service    │
   │  (3001, Postgres)│   │  (3003, Pg)    │
   └──────────────────┘   └────────────────┘

External:
   Google Gmail API ←→ GmailOAuthModule / SyncWorker
   Google Pub/Sub   →  push webhook (future)
   Wasabi S3        ←  attachment proxy
```

**Tenant isolation:** same pattern as pm-service — `x-organization-id` + `x-user-id` headers; all MongoDB queries scoped by `organizationId`.

---

## 2. Technology Choices

| Concern | Choice | Reason |
|---|---|---|
| Primary store | MongoDB 7 (Mongoose) | Flexible email schema, immutable archive, rich text/attachment metadata, fast entity-link queries |
| Background jobs | BullMQ (Redis) | Reliable retries, DLQ, rate-limit per-identity, concurrency control |
| Realtime | Socket.io (NestJS Gateway) | Already established in pm-service |
| Cache | Redis (same instance as pm-service) | Org-scoped TTL invalidation |
| Gmail SDK | `googleapis` v145 | Official, supports OAuth2 + History API |
| Attachment storage | Wasabi S3 (existing) | Consistent with file service |

---

## 3. MongoDB Collections

### 3.1 `comm_identities`
One document per authenticated Gmail account (OAuth2 owner). May have multiple send-as aliases.

> **Alias model (locked):** An identity represents one OAuth2-authenticated mailbox. Gmail natively supports send-as aliases — additional addresses the same mailbox is authorized to send from. These are fetched via `gmail.users.settings.sendAs.list` after each OAuth connect and stored in `sendAsAliases`. The "From" dropdown in compose lists aliases, not raw identities.

```typescript
{
  _id: ObjectId,
  organizationId: string,       // tenant key
  brandId: string,              // primary brand FK → core-service brands
  email: string,                // the authenticated Gmail address (OAuth2 owner)
  displayName: string,
  oauthTokens: {
    accessToken: string,        // AES-256-GCM encrypted at rest
    refreshToken: string,       // AES-256-GCM encrypted at rest
    expiresAt: Date,
    scope: string,
  },
  gmailUserId: string,          // 'me' or numeric ID from Google
  sendAsAliases: [{             // fetched from gmail.users.settings.sendAs.list on connect + periodic refresh
    email: string,              // the alias address (e.g. "alice@brand.com")
    displayName: string,        // "Alice - Brand A"
    isPrimary: boolean,         // true for the owner address itself
    isVerified: boolean,        // must be true to send; unverified aliases are stored but disabled
    isDefault: boolean,         // default from-address for this identity
    linkedBrandId: string | null, // FK → core-service Brand (for brand-aware default selection)
  }],
  syncState: {
    historyId: string | null,   // incremental sync cursor
    lastSyncAt: Date | null,
    status: 'active' | 'error' | 'paused',
    lastError: string | null,
  },
  createdAt: Date,
  updatedAt: Date,
}
// Indexes: { organizationId, brandId }, { organizationId, email } unique, { 'sendAsAliases.email' }
```

### 3.2 `comm_threads`
One document per Gmail thread. Source of truth grouping.

```typescript
{
  _id: ObjectId,
  organizationId: string,
  identityId: ObjectId,         // which sender identity received/sent this
  gmailThreadId: string,        // unique per identity
  subject: string,
  snippet: string,              // latest message preview
  participants: string[],       // all email addresses in thread
  labelIds: string[],           // Gmail labels
  messageCount: number,
  hasAttachments: boolean,
  latestMessageAt: Date,
  entityLinks: [                // denormalised for fast queries
    { entityType: 'lead'|'client'|'project', entityId: string }
  ],
  isArchived: boolean,
  isRead: boolean,
  createdAt: Date,
  updatedAt: Date,
}
// Indexes: { organizationId, gmailThreadId, identityId } unique
//          { organizationId, 'entityLinks.entityType', 'entityLinks.entityId' }
//          { organizationId, latestMessageAt }
```

### 3.3 `comm_messages`
Immutable once synced. Never deleted; soft-deleted flag only.

```typescript
{
  _id: ObjectId,
  organizationId: string,
  threadId: ObjectId,           // → comm_threads
  identityId: ObjectId,
  gmailMessageId: string,       // dedup/idempotency key
  gmailThreadId: string,
  direction: 'inbound' | 'outbound',
  from: { name: string, email: string },
  to:   [{ name: string, email: string }],
  cc:   [{ name: string, email: string }],
  bcc:  [{ name: string, email: string }],
  subject: string,
  bodyHtml: string,             // sanitized HTML (DOMPurify server-side)
  bodyText: string,             // plain text fallback
  snippet: string,
  attachments: [{
    filename: string,
    mimeType: string,
    size: number,
    s3Key: string | null,       // null until proxied
    gmailAttachmentId: string,
    isInline: boolean,
  }],
  labelIds: string[],
  inReplyToMessageId: string | null,
  references: string[],
  sentAt: Date,
  receivedAt: Date | null,
  isDeleted: boolean,           // soft delete only
  entityLinks: [
    { entityType: 'lead'|'client'|'project', entityId: string, linkedAt: Date, linkedBy: string }
  ],
  createdAt: Date,
}
// Indexes: { organizationId, gmailMessageId, identityId } unique
//          { organizationId, threadId, sentAt }
//          { organizationId, 'entityLinks.entityType', 'entityLinks.entityId', sentAt }
```

### 3.4 `comm_sync_jobs`
Tracks per-identity sync job state for observability.

```typescript
{
  _id: ObjectId,
  organizationId: string,
  identityId: ObjectId,
  jobType: 'full_sync' | 'incremental' | 'send' | 'retry',
  status: 'pending' | 'running' | 'completed' | 'failed' | 'dlq',
  startedAt: Date | null,
  completedAt: Date | null,
  messagesProcessed: number,
  errorMessage: string | null,
  attempt: number,
  payload: Record<string, any>,
  createdAt: Date,
}
// Index: { identityId, status, createdAt }
```

### 3.5 `comm_audit_logs`
Append-only. Covers every send, link, delete, OAuth operation.

```typescript
{
  _id: ObjectId,
  organizationId: string,
  actorUserId: string,
  action: CommAuditAction,      // enum — see below
  entityType: 'message' | 'thread' | 'identity' | 'link',
  entityId: string,
  metadata: Record<string, any>,
  ipAddress: string,
  userAgent: string,
  createdAt: Date,
}
// Index: { organizationId, actorUserId, createdAt }
//        { organizationId, entityType, entityId, createdAt }
```

**`CommAuditAction` enum:**
`IDENTITY_CONNECTED | IDENTITY_DISCONNECTED | IDENTITY_TOKEN_REFRESHED | MESSAGE_SENT | MESSAGE_REPLIED | MESSAGE_FORWARDED | MESSAGE_ARCHIVED | MESSAGE_DELETED | THREAD_LINKED | THREAD_UNLINKED | SYNC_STARTED | SYNC_COMPLETED | SYNC_FAILED | DLQ_ENTRY_CREATED`

---

## 4. Module Architecture

```
apps/backend/comm-service/src/
├── app/app.module.ts
├── common/
│   ├── cache/             CommCacheModule (Redis, org-scoped keys)
│   ├── decorators/        @GetOrgContext()  (same pattern as pm-service)
│   ├── enums/             comm.enums.ts
│   ├── guards/            OrgContextGuard
│   ├── helpers/           pagination.helper.ts
│   ├── interceptors/      idempotency.interceptor.ts
│   └── response/          comm-api-response.ts
├── modules/
│   ├── identities/        OAuth2 connect/disconnect, token management
│   ├── sync/              BullMQ workers: full-sync, incremental, DLQ
│   ├── messages/          Read, send, reply, forward, archive REST
│   ├── threads/           Thread list, thread detail, label ops
│   ├── entity-links/      Link/unlink messages↔leads/clients/projects
│   ├── attachments/       Proxy download, S3 upload
│   ├── gateway/           Socket.io namespace /comm
│   └── audit/             AuditService (append-only writes)
└── mongoose/
    └── schemas/           All 5 Mongoose schemas
```

---

## 5. Gmail Integration Design

### 5.1 OAuth2 Flow

```
User clicks "Connect Gmail"
  → GET /api/comm/identities/oauth/authorize?brandId=xxx
  → Backend generates PKCE code_verifier, stores in Redis (TTL 10m)
  → Redirect to Google consent screen
  → Callback: GET /api/comm/identities/oauth/callback?code=xxx&state=xxx
  → Exchange code for tokens
  → Encrypt tokens, store in comm_identities (primary email only)
  → Call gmail.users.settings.sendAs.list → populate sendAsAliases[]
  → Enqueue full_sync job
  → Emit WS event: identity:connected { identityId, email, aliasCount }
```

**Required OAuth2 scopes:**
- `https://www.googleapis.com/auth/gmail.modify` (read + label + archive, not delete; also permits `settings.sendAs.list`)
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`

> `gmail.modify` already grants access to `gmail.users.settings.sendAs.list` — no extra scope needed for alias enumeration.

### 5.2 Sync Strategy

**Phase M1 — Polling (simple, reliable):**
- BullMQ repeatable job per identity, 2-minute interval
- Call `users.history.list` with stored `historyId`
- On first sync (no historyId): **`users.messages.list` with `q: 'after:{unixEpochSeconds}'`** where epoch = `now - 90 days`. This is a hard cap. Full mailbox import is explicitly out of scope for V1 due to quota and performance risk on large mailboxes.
- Each message: `users.messages.get` with `format=full`, upsert to `comm_messages`
- Update `historyId` after successful batch

**Phase M3 — Push (Google Pub/Sub, low-latency):**
- `users.watch` registers Pub/Sub topic per identity
- Pub/Sub push webhook → `/api/comm/sync/webhook`
- **Auth verification:** Google sends a signed JWT in `Authorization: Bearer <token>` header. Verify using `google-auth-library`'s `OAuth2Client.verifyIdToken()` with `audience = GOOGLE_REDIRECT_URI_BASE`. Do NOT use HMAC — Google Pub/Sub push does not use HMAC signatures.
- On valid JWT: decode `data.message.data` (base64) → `{ emailAddress, historyId }`, enqueue incremental job
- Renew watch every 6 days (max expiry is ~7 days per Google docs; renew before expiry)
- Polling remains as fallback regardless

### 5.3 Send / Reply Flow

```
POST /api/comm/messages/send (or /reply)
  → Validate body (to, subject, body, identityId, fromAlias?)
  → Load identity (by identityId), decrypt tokens
  → Refresh token if expiry < 5 min
  → Resolve from address:
       if fromAlias provided → verify it exists in identity.sendAsAliases AND isVerified=true
       else → use identity.sendAsAliases[isDefault=true].email (fallback: identity.email)
  → Build RFC 2822 MIME message with From: "{displayName} <{resolvedAlias}>"
  → Call gmail.users.messages.send (Gmail sends from the alias transparently)
  → On success: store message in comm_messages (direction: outbound, from.email = resolvedAlias)
  → Upsert thread in comm_threads
  → Emit WS: message:sent
  → Audit log: MESSAGE_SENT
  → Return { data: CommMessage }
```

**Idempotency:** `POST /send` requires `Idempotency-Key: <uuid>` header. Key checked in Redis (TTL 24h); duplicate returns cached response without re-sending.

### 5.4 Rate Limiting

Gmail API quota: 250 quota units/user/second (1 query = 5–100 units depending on operation).

Strategy:
- BullMQ rate limiter: max 50 sync ops/second per identity
- Send operations: no artificial limit (user-initiated, low volume)
- On `429` from Gmail API: exponential backoff (1s, 2s, 4s, max 60s), max 5 retries → DLQ

---

## 6. Realtime Gateway

**Namespace:** `/comm`
**Auth:** JWT token in socket handshake auth header
**Room:** `org:{organizationId}` — all members of an org share a room

### Events emitted to client:
```
identity:connected   { identityId, email }
identity:error       { identityId, errorMessage }
sync:progress        { identityId, processed, total }
message:new          { message: CommMessageSummary }
message:sent         { message: CommMessageSummary }
thread:updated       { thread: CommThreadSummary }
link:created         { entityType, entityId, threadId }
link:removed         { entityType, entityId, threadId }
```

### Events received from client:
```
subscribe:entity     { entityType, entityId }   → join entity sub-room
unsubscribe:entity   { entityType, entityId }
```

---

## 7. Entity-Centric Linking

### Auto-link (inbound)

> **Contract fix (locked):** The original plan assumed `GET /api/clients?contactEmails[]=...` and `GET /api/leads?contactEmails[]=...`. Neither filter exists in the current core-service DTOs (`QueryClientsDto` has only `search`; `QueryLeadsDto` has `status/source/assignedToId/brandId/dateFrom/dateTo/search`). Additionally, `Lead` has no dedicated email field — email may be in `data: Json?` (untyped). The auto-link strategy is redesigned below.

**Step 1 — Client lookup (feasible):**
- `Client` has a direct `email String` column with `@@unique([email, organizationId])`
- comm-service calls the new internal endpoint (see COMM-BE-CORE-001):
  `POST /api/internal/comm/contact-lookup` with `{ emails: string[], organizationId: string }`
- core-service performs: `prisma.client.findMany({ where: { organizationId, email: { in: emails } } })`
- Returns `[{ entityType: 'client', entityId, email }]`

**Step 2 — Lead lookup (conditional):**
- `Lead` has no email column. Email lives in `data: Json?` (unstructured).
- Auto-link for leads requires a schema convention: `data.email` is treated as the contact email if present.
- core-service `contact-lookup` endpoint includes lead lookup using Postgres JSONB: `SELECT id FROM "Lead" WHERE organization_id = $1 AND data->>'email' = ANY($2::text[])`
- **If no `data.email` convention is followed for a lead, it will not auto-link.** Manual link remains always available.
- This is an M1 known limitation; document in onboarding.

**Full auto-link flow:**
1. Extract all email addresses in `from` + `to` + `cc`
2. POST to core-service internal endpoint `/api/internal/comm/contact-lookup`
3. For each matched entity → `entityLinksService.linkThread(...)` with `linkedBy: 'system'`
4. Emit `link:created` WS event

### Manual link
`POST /api/comm/threads/:threadId/links`
Body: `{ entityType: 'lead'|'client'|'project', entityId: string }`
Idempotent (upsert). Cascades to all messages in thread.

### Timeline Query
`GET /api/comm/timeline?entityType=lead&entityId=xxx&page=1&limit=20`
Returns paginated `CommMessageSummary[]` for the entity, sorted by `sentAt DESC`.
This is the data source for the timeline tab in lead/client/project detail sheets.

---

## 8. Multi-Brand Sender Identity

**Model (locked):**
- One org can have N authenticated Gmail accounts → N `comm_identity` documents
- Each identity can have M `sendAsAliases` (fetched from Gmail settings, stored in the identity doc)
- The **"From" dropdown in compose lists aliases, not raw identities**

**Default resolution (precedence order):**
1. Reply: use the alias that received the original thread (`from.email` on inbound `comm_message`)
2. Compose from entity context (lead/client with known brandId): use alias where `linkedBrandId = brandId && isDefault = true`
3. Compose from no context: use alias where `isPrimary = true && isDefault = true` across all identities

**Brand mapping for aliases:**
- On OAuth connect: `sendAsAliases` are fetched. Each alias `email` is pattern-matched against `Brand.domain` from core-service (e.g. `@brand.com` → `Brand.domain = 'brand.com'`)
- Admin can also manually set `linkedBrandId` per alias in settings UI (COMM-FE-005)

**Identity display in UI:** `{alias.displayName} <{alias.email}>` grouped by `linkedBrandId`

---

## 9. Reliability Baseline

### Idempotency
- Sync: upsert on `gmailMessageId` (unique index)
- Send: `Idempotency-Key` header + Redis cache
- Links: upsert on `(threadId, entityType, entityId)`

### Retry policy (BullMQ)
```
attempts: 3
backoff: { type: 'exponential', delay: 2000 }
removeOnComplete: { count: 1000 }
removeOnFail: false   // keep in failed set for DLQ inspection
```

### Dead Letter Queue
- After 3 attempts → job moves to `comm_dlq` queue (separate named queue)
- Write `comm_sync_jobs` record with `status: 'dlq'`
- Audit log: `DLQ_ENTRY_CREATED`
- Ops can manually re-queue via `POST /api/comm/admin/dlq/:jobId/retry`

### Structured Audit Logs
Every mutating operation writes to `comm_audit_logs` via `AuditService.log()`.
Includes: actor, action, entity, metadata (e.g., recipient for sends), IP, user-agent.

---

## 10. Security

- **Token encryption:** AES-256-GCM with per-org derived key (PBKDF2 from master secret + orgId salt). Tokens never returned in API responses.
- **Token refresh:** transparent, triggered when `expiresAt - now < 5 minutes`
- **Scope minimality:** only `gmail.modify` + `gmail.send` + `gmail.compose` — no `gmail.readonly` (covers full workflow without admin scope)
- **HTML sanitization:** `isomorphic-dompurify` applied to `bodyHtml` on ingest
- **CSP for email rendering:** iframe sandbox + restrictive CSP when rendering email body in frontend
- **Attachment proxy:** attachments served via signed S3 URLs (15 min TTL), never direct Gmail API from frontend

---

## 11. Phased Rollout

### M1 — Foundation (Weeks 1-3)
**Goal:** Working Gmail connect + sync + read in sales-dashboard.

| Area | Scope |
|---|---|
| Backend | comm-service bootstrap, Mongoose schemas, OAuth2 flow, full sync worker, messages/threads READ endpoints, entity-link auto-detection |
| Frontend | Identity connect UI (Settings), inbox list in lead-detail-sheet (read-only), comm api client |

**Exit criteria:** User can connect Gmail, sync runs, inbound emails appear in lead/client timeline.

---

### M2 — Send/Reply + Entity Links (Weeks 4-5)
**Goal:** 90% Gmail workflow operational.

| Area | Scope |
|---|---|
| Backend | Send/reply/forward endpoints (idempotency), manual entity link API, incremental history sync, DLQ, audit logs |
| Frontend | Compose drawer in sales-dashboard, reply inline in thread view, manual link widget, pm-dashboard project timeline tab |

**Exit criteria:** Users can send/reply from within the app; messages are linked to leads/clients/projects; DLQ monitoring active.

---

### M3 — Realtime + Reliability (Weeks 6-7)
**Goal:** Realtime updates, push sync, production-grade reliability.

| Area | Scope |
|---|---|
| Backend | Socket.io /comm gateway, Google Pub/Sub push webhook, token refresh watchdog job, retry hardening, admin DLQ endpoints |
| Frontend | useCommSocket hook, optimistic thread updates, unread badge, WS reconnect logic, notification dot in nav |

**Exit criteria:** New emails appear without page refresh; push webhook processing latency < 5s P95.

---

### M4 — Multi-brand + Polish (Weeks 8-9)
**Goal:** Full multi-brand experience + UX completeness.

| Area | Scope |
|---|---|
| Backend | Multi-identity select on send, default-identity logic, brand context awareness, attachment proxy S3 upload |
| Frontend | Identity selector in compose, attachment viewer, thread search, label filter, archive/unarchive action, settings page with all identities |

**Exit criteria:** Agency can send from brand-specific addresses; all connected Gmail identities manageable from settings.

---

### M5 — Hardening + Observability (Week 10)
**Goal:** Production-ready monitoring.

| Area | Scope |
|---|---|
| Backend | Prometheus metrics (sync latency, send success rate, DLQ depth), structured logging (pino), health endpoints |
| Frontend | Error states, empty states, loading skeletons, connection status indicators |

**Exit criteria:** Alerting configured; zero silent failures.

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gmail OAuth token expiry/revocation mid-session | Medium | High | Token refresh watchdog; `identity.status = error` + WS event on failure; UI prompt to re-authenticate |
| Gmail API quota exhaustion (250 units/user/s) | Low | High | BullMQ rate limiter per identity; exponential backoff on 429; DLQ for non-critical sync jobs |
| Google Pub/Sub push webhook unreachable (dev/staging) | High | Low | Polling fallback always active; push is additive optimization |
| Large mailbox initial sync (100k+ emails) | Medium | Medium | Initial sync: import last 90 days only; paginated, async BullMQ job with progress events; UI shows sync progress |
| OAuth consent screen not verified by Google (shows warning) | High | Medium | Use internal/test users for V1; submit for verification in M4; document workaround in onboarding |
| Lead auto-link misfire (no email field on Lead model) | High | Low | Lead.data.email convention documented; leads without it get manual-link only; this is a known V1 limitation, not a bug |
| sendAs alias not verified in Gmail (user connected Gmail but alias not set up there) | Medium | Medium | `isVerified` flag checked before allowing send; UI warns if no verified alias exists; admin guided to configure alias in Gmail settings first |
| Pub/Sub JWT verification key rotation (Google rotates certs) | Low | Medium | Use `google-auth-library` which fetches certs dynamically with caching — do not hardcode certs |
| MongoDB query performance at scale | Low | Medium | Compound indexes on all hot query paths; `entityLinks` denormalized on both thread + message; reviewed before M2 |
| Token encryption key rotation | Low | High | Key derivation uses orgId salt; rotation procedure documented; re-encrypt job available as admin utility |
| HTML email rendering XSS | Medium | High | `isomorphic-dompurify` on ingest + iframe sandbox in frontend; no direct HTML injection |

---

## 13. Dependencies

| Dependency | Direction | Risk if unavailable |
|---|---|---|
| core-service `POST /api/internal/comm/contact-lookup` (COMM-BE-CORE-001) | comm depends | Auto-link disabled if missing; manual link still works |
| core-service `Lead.data.email` convention | implicit | Lead auto-link silently skips leads without `data.email` |
| core-service `/brands` | comm reads | Identity creation blocked |
| Redis (BullMQ + cache) | comm depends | Sync jobs paused; service falls back to direct sync on request |
| MongoDB 7 instance | comm depends | Service unavailable |
| Google OAuth2 credentials (Client ID/Secret) | external | Identity connection blocked; requires Google Cloud Console setup |
| Wasabi S3 (attachment proxy) | comm uses existing | Attachments unavailable (display filename only) |
| `PORT_COMM` env var | comm-service | Defaults to 3004 |

**New env vars required:**
```
PORT_COMM=3004
MONGO_URI_COMM=mongodb://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3004/api/comm/identities/oauth/callback
COMM_TOKEN_ENCRYPTION_KEY=<32-byte hex>
COMM_IDEMPOTENCY_TTL_SECONDS=86400
```

---

## 14. Acceptance Criteria (per milestone)

### M1 Acceptance
- [ ] `POST /api/comm/identities/oauth/authorize` returns redirect URL
- [ ] OAuth callback stores encrypted tokens, triggers full_sync job
- [ ] Full sync imports last 90 days of emails into `comm_messages`
- [ ] `GET /api/comm/threads` returns paginated threads for org
- [ ] `GET /api/comm/timeline?entityType=lead&entityId=x` returns linked messages
- [ ] Auto-link assigns inbound email to lead/client when email matches known contact
- [ ] All responses include `x-request-id` header

### M2 Acceptance
- [ ] `POST /api/comm/messages/send` with valid `Idempotency-Key` sends email and stores outbound message
- [ ] Duplicate `Idempotency-Key` returns same response without re-sending
- [ ] `POST /api/comm/messages/:id/reply` threads correctly in Gmail
- [ ] `POST /api/comm/threads/:id/links` links thread to entity; cascades to all messages
- [ ] Failed sends after 3 retries appear in `comm_sync_jobs` with status `dlq`
- [ ] Every send writes to `comm_audit_logs`

### M3 Acceptance
- [ ] Socket.io `/comm` namespace authenticates via JWT
- [ ] New inbound email triggers `message:new` WS event within 2s (push) or 2min (poll)
- [ ] `GET /api/comm/health` returns 200 with sync status per identity
- [ ] Token refresh operates transparently without user action

### M4 Acceptance
- [ ] Compose drawer allows identity selection from connected Gmail accounts
- [ ] Attachment download returns presigned S3 URL (or streams via proxy)
- [ ] All connected identities visible and manageable in settings page
- [ ] `isDefault` identity used correctly when brand context is available

### M5 Acceptance
- [ ] `/api/comm/metrics` endpoint returns Prometheus-compatible metrics
- [ ] DLQ depth > 10 triggers alert (configurable threshold)
- [ ] All error paths return structured `{ error: { code, message, requestId } }` response
