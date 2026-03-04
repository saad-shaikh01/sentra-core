# comm-service — Backend Ticket Pack

**Service:** `apps/backend/comm-service`
**Port:** 3004 (`PORT_COMM`)
**Stack:** NestJS, MongoDB (Mongoose), BullMQ, Redis, Socket.io, googleapis
**Milestone mapping:** M1=COMM-BE-001–007 | M2=008–014 | M3=015–019 | M4=020–023 | M5=024–025

---

## COMM-BE-CORE-001 — core-service: Internal Contact Lookup Endpoint
**Milestone:** M1 (prerequisite for COMM-BE-007) | **Estimate:** 0.5 day | **Service:** core-service

**Scope:**
Add internal-only endpoint to `apps/backend/core-service/src/modules/`:

**`internal/internal.controller.ts`:**
```
POST /api/internal/comm/contact-lookup
```
- Protected by `SERVICE_SECRET` header guard (not JWT — this is machine-to-machine only)
- Never exposed via API gateway to public internet

**Request body:**
```typescript
{ emails: string[], organizationId: string }
```

**Logic:**
1. Client lookup: `prisma.client.findMany({ where: { organizationId, email: { in: emails } } })` → `[{ entityType: 'client', entityId: id, email }]`
2. Lead lookup (JSONB): `prisma.$queryRaw<Array<{ id: string, email: string }>> sql\`SELECT id, data->>'email' as email FROM "Lead" WHERE "organizationId" = ${organizationId} AND data->>'email' = ANY(${emails})\`` → `[{ entityType: 'lead', entityId: id, email }]`
3. Return merged array, deduped by `(entityType, entityId)`

**Guard:** `InternalServiceGuard` — checks `X-Service-Secret: {SERVICE_SECRET}` header. Returns 403 if missing or incorrect.

**Note on Lead lookup:** Only leads with `data.email` set will be returned. This is a known limitation (Lead has no dedicated email column). Document for ops team.

**Acceptance:**
- Calling with known client email returns `[{ entityType: 'client', entityId, email }]`
- Calling with lead that has `data.email` set returns that lead
- Request without `X-Service-Secret` returns 403
- Endpoint is NOT registered in Swagger/OpenAPI

---

## COMM-BE-001 — Bootstrap & Infrastructure
**Milestone:** M1 | **Estimate:** 1 day

**Scope:**
- Update `apps/backend/comm-service/src/main.ts`:
  - Set `globalPrefix = 'api/comm'`
  - Port from `PORT_COMM` env var (default 3004)
  - Enable `ValidationPipe({ whitelist: true, transform: true })`
  - CORS aligned with other services
  - Graceful shutdown hooks
- Install packages:
  ```
  mongoose @nestjs/mongoose
  @nestjs/bull bullmq bull
  @nestjs/websockets @nestjs/platform-socket.io socket.io
  googleapis google-auth-library
  isomorphic-dompurify
  ioredis
  pino pino-pretty nestjs-pino
  ```
- Create `CommCacheModule` (`common/cache/`) — Redis client, `get/set/del/invalidateOrg(orgId, pattern)` methods
- Create `OrgContextGuard` + `@GetOrgContext()` decorator (exact same pattern as pm-service)
- Create `comm-api-response.ts`: `{ data: T }`, `{ data: T[], meta: PaginationMeta }`, `{ error: { code, message, requestId } }`
- Create `comm.enums.ts` with all enums from architecture doc
- Create `common/interceptors/request-id.interceptor.ts` — sets `x-request-id` on every response
- Configure `nestjs-pino` for structured JSON logs

**Acceptance:** Service boots on port 3004, returns `{ message: 'comm-service OK' }` on `GET /api/comm/health`.

---

## COMM-BE-002 — Mongoose Schemas
**Milestone:** M1 | **Estimate:** 0.5 day

**Scope:**
Create all 5 Mongoose schemas in `mongoose/schemas/`:

1. `comm-identity.schema.ts` — `CommIdentity` (full schema per architecture §3.1)
2. `comm-thread.schema.ts` — `CommThread` (§3.2)
3. `comm-message.schema.ts` — `CommMessage` (§3.3)
4. `comm-sync-job.schema.ts` — `CommSyncJob` (§3.4)
5. `comm-audit-log.schema.ts` — `CommAuditLog` (§3.5)

For each schema:
- Define all indexes (compound + unique) as schema-level index definitions
- `timestamps: true` on all schemas
- Export Mongoose Model type + Mongoose Document type
- Export a barrel `mongoose/schemas/index.ts`

Create `CommMongooseModule` in `mongoose/mongoose.module.ts` that registers all schemas.

**Acceptance:** `MongooseModule.forRoot(MONGO_URI_COMM)` imported in AppModule; all collections visible in MongoDB on first boot.

---

## COMM-BE-003 — Token Encryption Utility
**Milestone:** M1 | **Estimate:** 0.5 day

**Scope:**
Create `common/crypto/token-crypto.service.ts`:

```typescript
@Injectable()
export class TokenCryptoService {
  // AES-256-GCM encryption
  encrypt(plaintext: string, orgId: string): string  // returns 'iv:authTag:ciphertext' hex
  decrypt(ciphertext: string, orgId: string): string
}
```

- Key derivation: PBKDF2 with `COMM_TOKEN_ENCRYPTION_KEY` + `orgId` as salt, 100k iterations, SHA-256, 32-byte output
- Use Node.js `crypto` module (no external deps)
- Unit tests: encrypt→decrypt roundtrip; different orgIds produce different ciphertexts

**Acceptance:** Unit tests pass; encrypted token is not plaintext-inspectable.

---

## COMM-BE-004 — IdentitiesModule (OAuth2 connect/disconnect)
**Milestone:** M1 | **Estimate:** 1.5 days

**Scope:**
Create `modules/identities/` with:

**`identities.service.ts`:**
- `initiateOAuth(orgId, brandId)` → store PKCE verifier in Redis (TTL 600s), return Google authorization URL with scopes: `gmail.modify gmail.send gmail.compose openid email`
- `handleOAuthCallback(orgId, code, state)` → exchange code, encrypt tokens, create `CommIdentity` (email only), then immediately call `gmail.users.settings.sendAs.list` to populate `sendAsAliases[]`, then enqueue `full_sync` job
- `refreshSendAsAliases(identityId)` → re-fetches `sendAs.list`, updates `sendAsAliases[]` array. Called on each full_sync job and on-demand. Preserves manually-set `linkedBrandId` values during refresh.
- Auto brand-map on alias refresh: for each alias email, extract domain (e.g. `alice@brand.com` → `brand.com`), query core-service brands by `domain`, set `linkedBrandId` if unambiguous match found
- `refreshTokenIfNeeded(identity)` → if `expiresAt - now < 300s`, call `oauth2.refreshAccessToken()`, re-encrypt, update doc
- `disconnectIdentity(orgId, identityId)` → revoke Google token, set `syncState.status = 'paused'`, audit log
- `listIdentities(orgId)` → return all with tokens stripped; include `sendAsAliases[]` (no token fields)
- `getIdentityWithDecryptedTokens(identityId, orgId)` → internal only, never exposed in controller
- `resolveSendAlias(identityId, aliasEmail?)` → returns verified alias email; throws if alias not found or not verified

**`identities.controller.ts`:**
```
GET  /api/comm/identities                 → list
GET  /api/comm/identities/oauth/authorize  → { redirectUrl }
GET  /api/comm/identities/oauth/callback   → redirect to frontend with success/error
DELETE /api/comm/identities/:id            → disconnect
PATCH  /api/comm/identities/:id/default    → set as default for brand
```

**DTOs:** `InitiateOAuthDto` (brandId), `OAuthCallbackDto` (code, state)

**Acceptance:**
- Can connect a real Gmail account in dev environment
- Tokens are stored encrypted (not readable as plaintext in MongoDB)
- `listIdentities` returns `sendAsAliases[]` without token fields
- `sendAsAliases` is populated immediately on OAuth callback (before redirect back to frontend)
- Alias with `isVerified: false` cannot be used as a from-address (send endpoint returns 422)

---

## COMM-BE-005 — SyncModule: Full Sync Worker
**Milestone:** M1 | **Estimate:** 2 days

**Scope:**
Create `modules/sync/` with BullMQ:

**Queues:**
- `comm:sync` — main sync queue (concurrency 3)
- `comm:dlq` — dead letter queue (concurrency 1, no automatic retries)

**`sync.processor.ts`** — `@Processor('comm:sync')`:

Job type `full_sync`:
1. Load identity, decrypt tokens, refresh if needed
2. Compute cutoff: `const afterEpoch = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000)`
3. Call `gmail.users.messages.list` with **`q: \`after:${afterEpoch}\``**, paginated (pageToken). **Never use `q: ''` (full mailbox) — large mailboxes exceed quota and processing time bounds.**
4. For each message page: call `gmail.users.messages.get(format=full)` in batches of 10
4. Upsert into `comm_messages` on `gmailMessageId` (unique index guard)
5. Upsert `comm_threads` per `gmailThreadId`
6. Run auto-link detection (see COMM-BE-007)
7. Update `identity.syncState.historyId` after all pages processed
8. Update `CommSyncJob` doc with `status: completed`
9. Emit `sync:progress` WS event periodically (every 50 messages)

**Job type `incremental`:**
1. Load identity, call `gmail.users.history.list(startHistoryId=identity.syncState.historyId)`
2. Process `messagesAdded`, `messagesDeleted`, `labelsAdded`, `labelsRemoved`
3. Upsert new messages, soft-delete removed, update labels
4. Update `historyId`

**Retry handling:**
- `attempts: 3, backoff: { type: 'exponential', delay: 2000 }`
- `onFailed` callback: if attempt === maxAttempts → add to `comm:dlq`, write `CommSyncJob` with `status: 'dlq'`, emit audit log

**`sync.service.ts`:** Provides `enqueuFullSync(identityId)`, `enqueueIncremental(identityId)` used by other modules.

**BullMQ repeatable job registration:** On app start, for each active identity, register repeatable incremental sync every 120 seconds.

**Acceptance:**
- `full_sync` job processes 100 test emails into MongoDB
- `incremental` job picks up new emails since last `historyId`
- Failed job after 3 attempts lands in DLQ queue and `comm_sync_jobs` record

---

## COMM-BE-006 — MessagesModule & ThreadsModule (READ)
**Milestone:** M1 | **Estimate:** 1 day

**Scope:**

**`messages.service.ts`:**
- `listMessages(orgId, query: ListMessagesDto)` → paginated `comm_messages`
- `getMessage(orgId, messageId)` → single message with full body
- `listByThread(orgId, threadId)` → all messages in thread, sorted `sentAt ASC`

**`threads.service.ts`:**
- `listThreads(orgId, query: ListThreadsDto)` → paginated `comm_threads`
- `getThread(orgId, threadId)` → thread + messages (combined)
- `archiveThread(orgId, threadId)` → set `isArchived = true`, call Gmail label API
- `markRead(orgId, threadId)` → set `isRead = true`, call Gmail label API

**DTOs:**
```typescript
ListMessagesDto {
  page?: number; limit?: number;
  threadId?: string;
  entityType?: string; entityId?: string;
  from?: string; subject?: string;
  startDate?: string; endDate?: string;
}

ListThreadsDto {
  page?: number; limit?: number;
  identityId?: string;
  isArchived?: boolean; isRead?: boolean;
  search?: string;
}
```

**Controllers:**
```
GET  /api/comm/threads                    → list
GET  /api/comm/threads/:id                → detail with messages
POST /api/comm/threads/:id/archive        → archive
POST /api/comm/threads/:id/read           → mark read
GET  /api/comm/messages                   → list (filter by thread/entity)
GET  /api/comm/messages/:id               → single
```

**Acceptance:**
- Paginated thread list returns correct `meta.total`
- Thread detail includes all messages sorted by date
- Archive sets Gmail `INBOX` label removed + `ARCHIVED` flag in MongoDB

---

## COMM-BE-007 — EntityLinksModule + Auto-Link Detection
**Milestone:** M1 | **Estimate:** 1 day

**Scope:**

**`entity-links.service.ts`:**
- `linkThread(orgId, threadId, entityType, entityId, linkedBy)`:
  - Upsert link on thread doc (entityLinks array)
  - Cascade: upsert same link on all `comm_messages` in thread
  - Emit WS `link:created`
  - Audit log
- `unlinkThread(orgId, threadId, entityType, entityId, unlinkedBy)`:
  - Pull from thread + all messages entityLinks
  - Emit WS `link:removed`
  - Audit log
- `getTimeline(orgId, entityType, entityId, query)`:
  - Query `comm_messages` by entityLinks filter
  - Return paginated `CommMessageSummary[]` sorted `sentAt DESC`

**Auto-link service:**
`auto-link.service.ts` — called by sync processor after each message upsert:

> **Contract (locked):** `QueryClientsDto` has no `contactEmails` filter. `Lead` has no dedicated email column. The correct approach uses the new internal endpoint `COMM-BE-CORE-001`.

1. Collect all email addresses from message (`from.email`, `to[].email`, `cc[].email`), dedup
2. POST to core-service internal: `http://localhost:3001/api/internal/comm/contact-lookup` with `{ emails, organizationId }` and `X-Service-Secret` header
3. Handle HTTP errors: on 503 or timeout → skip auto-link for this message (log warning, do not fail sync job)
4. For each returned entity match: call `entityLinksService.linkThread(...)` with `linkedBy: 'system'`

**Known limitation:** Leads without `data.email` set will not be auto-linked. Manual link always available.

**Controller:**
```
POST   /api/comm/threads/:id/links         → manual link
DELETE /api/comm/threads/:id/links/:entityType/:entityId  → unlink
GET    /api/comm/timeline                  → ?entityType=&entityId=&page=&limit=
```

**Acceptance:**
- Inbound email from known lead contact is auto-linked on sync
- Manual link cascades to all messages in thread
- Timeline endpoint returns chronological emails for a lead

---

## COMM-BE-008 — Send / Reply / Forward
**Milestone:** M2 | **Estimate:** 1.5 days

**Scope:**

**`messages.service.ts` additions:**
- `sendMessage(orgId, userId, dto: SendMessageDto)`:
  1. Validate `Idempotency-Key` header via Redis (24h TTL)
  2. Load identity (decrypt tokens, refresh if needed)
  3. Build MIME message using `mailcomposer` or manual RFC 2822 encoding
  4. Call `gmail.users.messages.send({ raw: base64urlEncodedMime })`
  5. Upsert outbound `CommMessage` with returned `gmailMessageId`
  6. Upsert `CommThread`
  7. Run auto-link on outbound recipients
  8. Audit log: `MESSAGE_SENT`
  9. Emit WS `message:sent`
  10. Cache response in Redis for idempotency key
  11. Return `{ data: CommMessage }`

- `replyToMessage(orgId, userId, messageId, dto: ReplyDto)`:
  - Same flow; set `In-Reply-To` + `References` headers; use same `gmailThreadId`
  - Audit log: `MESSAGE_REPLIED`

- `forwardMessage(orgId, userId, messageId, dto: ForwardDto)`:
  - Load original message, prepend quoted body
  - Audit log: `MESSAGE_FORWARDED`

**DTOs:**
```typescript
SendMessageDto {
  identityId: string;        // which OAuth2 identity (owner mailbox)
  fromAlias?: string;        // alias email to send from (must be in identity.sendAsAliases && isVerified)
                             // if omitted: uses identity.sendAsAliases[isDefault=true].email
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachmentIds?: string[];  // pre-uploaded S3 keys
}

ReplyDto {
  identityId: string;
  bodyHtml: string;
  bodyText?: string;
  cc?: string[];
}

ForwardDto {
  identityId: string;
  to: string[];
  bodyHtml?: string;
}
```

**Controller:**
```
POST /api/comm/messages/send
POST /api/comm/messages/:id/reply
POST /api/comm/messages/:id/forward
```

**Idempotency interceptor:** `IdempotencyInterceptor` checks `Idempotency-Key` header on `POST /send`. Returns `409` if key used within TTL with same payload hash mismatch.

**Acceptance:**
- Sent email appears in Gmail sent box
- Duplicate request with same `Idempotency-Key` returns original response, email sent once
- Reply appears as reply in Gmail thread view
- All sends audit logged

---

## COMM-BE-009 — AuditModule
**Milestone:** M2 | **Estimate:** 0.5 day

**Scope:**
Create `modules/audit/audit.service.ts`:

```typescript
@Injectable()
export class AuditService {
  async log(params: {
    organizationId: string;
    actorUserId: string;
    action: CommAuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>

  async queryLogs(orgId: string, query: AuditQueryDto): Promise<PaginatedResponse<CommAuditLog>>
}
```

- All writes are `insertOne` (append-only, never update)
- `@Global()` module so any service can inject it without re-importing
- Controller:
  ```
  GET /api/comm/audit?entityType=&entityId=&actorUserId=&action=&page=&limit=
  ```
  (Admin/org-owner only — add `RolesGuard` with `ADMIN | OWNER` roles)

**Acceptance:** Every send, link, disconnect emits an audit log entry; query endpoint returns them paginated.

---

## COMM-BE-010 — IncrementalSync Hardening + DLQ Admin
**Milestone:** M2 | **Estimate:** 1 day

**Scope:**
- Add `sync.controller.ts`:
  ```
  POST /api/comm/sync/:identityId/trigger     → manually trigger incremental sync
  GET  /api/comm/sync/jobs?identityId=&status=  → list CommSyncJob records
  POST /api/comm/admin/dlq/:jobId/retry        → re-queue failed job
  GET  /api/comm/admin/dlq                     → list DLQ entries
  ```
- Enhance sync processor: on `history.list` returning `INVALID_ARGUMENT` (historyId too old) → fall back to full sync
- Add `sync:status` to `GET /api/comm/health` response: list each identity with last sync time + status

**Acceptance:**
- Manual sync trigger works
- Expired historyId automatically falls back to full sync
- Admin can inspect and retry DLQ jobs

---

## COMM-BE-011 — AttachmentsModule
**Milestone:** M2 | **Estimate:** 1 day

**Scope:**
Create `modules/attachments/`:

- `attachments.service.ts`:
  - `getAttachmentUrl(orgId, messageId, attachmentIndex)`:
    - If `s3Key` is set: return presigned S3 URL (15 min TTL)
    - If no `s3Key`: stream from Gmail API `users.messages.attachments.get`, upload to S3 key `comm/{orgId}/{gmailMessageId}/{filename}`, update message doc, return presigned URL
  - `uploadAttachment(orgId, file)` → upload file to S3 for outbound compose (pre-upload flow)

- `attachments.controller.ts`:
  ```
  GET  /api/comm/messages/:messageId/attachments/:index  → { url: presignedS3Url }
  POST /api/comm/attachments/upload                      → { s3Key, filename, size }
  ```

**Note:** Never proxy the raw Gmail attachment bytes through NestJS response body — always S3 → presigned URL pattern.

**Acceptance:**
- First fetch uploads to S3 and returns presigned URL
- Subsequent fetches return S3 URL without re-fetching from Gmail

---

## COMM-BE-012 — Incremental Sync with Gmail Labels
**Milestone:** M2 | **Estimate:** 0.5 day

**Scope:**
Enhance sync processor to handle all `history.list` event types:
- `messagesAdded`: fetch full message, upsert
- `messagesDeleted`: set `isDeleted: true` on message
- `labelsAdded`: update `labelIds` on message + thread
- `labelsRemoved`: update `labelIds`, set `isRead = true` if `UNREAD` removed

Update `comm_threads.isRead` and `comm_threads.labelIds` to stay in sync.

**Acceptance:** Marking a thread read in Gmail reflects in MongoDB within next incremental sync cycle.

---

## COMM-BE-013 — Health + Config Module
**Milestone:** M2 | **Estimate:** 0.5 day

**Scope:**
- `@nestjs/config` with `.env` validation via `Joi`
- `GET /api/comm/health`:
  ```json
  {
    "status": "ok",
    "mongodb": "connected",
    "redis": "connected",
    "identities": [
      { "id": "...", "email": "...", "syncStatus": "active", "lastSyncAt": "..." }
    ]
  }
  ```
- Validate all required env vars at startup; fail fast if missing (`COMM_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MONGO_URI_COMM`)

**Acceptance:** `GET /api/comm/health` returns 200 with identity sync status; service refuses to start without required env vars.

---

## COMM-BE-014 — CommGateway (Socket.io)
**Milestone:** M3 | **Estimate:** 1 day

**Scope:**
Create `modules/gateway/comm.gateway.ts`:

```typescript
@WebSocketGateway({ namespace: '/comm', cors: { origin: '*' } })
export class CommGateway {
  // Auth: JWT from handshake auth header
  // On connect: extract orgId from JWT, join room `org:{orgId}`
  // On disconnect: leave room

  // Client events handled:
  handleSubscribeEntity(client, { entityType, entityId })
    → join room `entity:{entityType}:{entityId}`
  handleUnsubscribeEntity(client, { entityType, entityId })
    → leave room

  // Server emits (called by other services):
  emitToOrg(orgId, event, payload)
  emitToEntity(entityType, entityId, event, payload)
}
```

- Update all services that should emit WS events to inject `CommGateway` and call `emitToOrg()`
- WS auth: verify JWT (same secret as core-service), extract `userId` + `organizationId`
- On invalid JWT: disconnect with `{ error: 'unauthorized' }`

**Acceptance:**
- Client connects with valid JWT, receives events when new email arrives for their org
- Subscribing to entity room receives `message:new` only for linked entity

---

## COMM-BE-015 — Google Pub/Sub Push Webhook
**Milestone:** M3 | **Estimate:** 1 day

**Scope:**
- `modules/sync/pubsub.controller.ts`:
  ```
  POST /api/comm/sync/webhook   → Google Pub/Sub push endpoint
  ```
  - **Auth verification (corrected):** Google Pub/Sub push does NOT use `X-Goog-Signature` HMAC. It sends a Google-signed JWT in the `Authorization: Bearer <token>` header.
    ```typescript
    // Use google-auth-library:
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: bearerToken,
      audience: process.env.COMM_PUBSUB_AUDIENCE, // e.g. 'https://your-domain.com/api/comm/sync/webhook'
    });
    const payload = ticket.getPayload();
    // Verify payload.email matches expected Pub/Sub service account (optional but recommended)
    ```
  - On invalid JWT: return HTTP 401 (do not process)
  - Decode base64 Pub/Sub message data: `JSON.parse(Buffer.from(message.data, 'base64').toString())` → `{ emailAddress, historyId }`
  - Find identity by `email = emailAddress` within org scope
  - Enqueue `incremental` sync job with the new `historyId`
  - Return HTTP 204 (always return 2xx to prevent Pub/Sub retry on valid but unrecognized messages)

- `modules/identities/identities.service.ts` additions:
  - `registerGmailWatch(identity)` → call `gmail.users.watch({ topicName, labelIds: ['INBOX'] })`
  - `renewGmailWatch(identity)` → same call (idempotent)
  - BullMQ repeatable job: renew watch for all active identities every 6 days

**Acceptance:**
- New email in connected Gmail triggers webhook call within 30s (Google latency)
- Webhook enqueues incremental sync job
- Watch renewal runs automatically

---

## COMM-BE-016 — Token Refresh Watchdog
**Milestone:** M3 | **Estimate:** 0.5 day

**Scope:**
- BullMQ repeatable job: `token_watchdog` every 30 minutes
- For each active `CommIdentity`:
  - Attempt `refreshTokenIfNeeded(identity)`
  - On Google error `invalid_grant` or `token_revoked`: set `syncState.status = 'error'`, emit WS `identity:error`, audit log `IDENTITY_TOKEN_REFRESHED` with error flag
- Also refresh proactively on every outbound send and every sync job start

**Acceptance:** Expired tokens refreshed silently; revoked tokens surface to user via WS event + UI alert.

---

## COMM-BE-017 — Multi-Brand Identity Routing
**Milestone:** M4 | **Estimate:** 0.5 day

**Scope:**
- `identities.service.ts` additions:
  - `getDefaultIdentityForBrand(orgId, brandId)` → returns identity where `isDefault = true && brandId = brandId`
  - `resolveIdentityForReply(orgId, originalMessageId)` → returns identity that received original message
- Add `brandId` filter to `listIdentities(orgId, brandId?)`
- `PATCH /api/comm/identities/:id/default` — sets `isDefault = true` for identity, clears other identities in same brand+org

**Acceptance:** Composing a reply automatically selects the correct sender identity; brand filter in list works.

---

## COMM-BE-018 — Thread Search
**Milestone:** M4 | **Estimate:** 0.5 day

**Scope:**
- Add `search` param to `ListThreadsDto` and `ListMessagesDto`
- MongoDB text index on `comm_threads`: `{ subject: 'text', snippet: 'text', participants: 'text' }`
- MongoDB text index on `comm_messages`: `{ subject: 'text', bodyText: 'text', 'from.email': 'text' }`
- `GET /api/comm/threads?search=quarterly+report` uses `$text: { $search: query }` with score sorting

**Acceptance:** Search returns relevant threads; non-matching threads excluded.

---

## COMM-BE-019 — Label Filter API
**Milestone:** M4 | **Estimate:** 0.5 day

**Scope:**
- `GET /api/comm/threads?label=INBOX` filters by `labelIds` array
- `GET /api/comm/identities/:id/labels` — calls Gmail `users.labels.list`, returns org-visible labels
- Supports standard Gmail labels: `INBOX`, `SENT`, `STARRED`, `IMPORTANT`, `SPAM`, `TRASH`

**Acceptance:** Filtering by `INBOX` returns only inbox threads; `SENT` returns only sent.

---

## COMM-BE-020 — Prometheus Metrics
**Milestone:** M5 | **Estimate:** 0.5 day

**Scope:**
- Install `@willsoto/nestjs-prometheus`
- Expose `GET /api/comm/metrics` (Prometheus text format)
- Metrics to track:
  - `comm_sync_duration_seconds` (histogram, per identity)
  - `comm_sync_messages_total` (counter, per identity + status)
  - `comm_send_total` (counter, success/failure)
  - `comm_dlq_depth` (gauge, current DLQ size)
  - `comm_websocket_connections` (gauge)
  - `comm_token_refresh_total` (counter, success/failure)

**Acceptance:** `GET /api/comm/metrics` returns Prometheus-scrapeable output with all defined metrics populated.

---

## COMM-BE-021 — Structured Logging
**Milestone:** M5 | **Estimate:** 0.5 day

**Scope:**
- `nestjs-pino` already installed in COMM-BE-001
- Ensure all log entries include: `requestId`, `organizationId`, `service: 'comm'`, `level`, `message`, `durationMs` on HTTP requests
- Add `logger.error()` with full stack traces on sync job failures
- No sensitive data in logs (strip tokens, email body content — log metadata only)

**Acceptance:** All request logs in JSON format with `organizationId`; no OAuth tokens in logs.

---

## COMM-BE-022 — Error Response Standardization
**Milestone:** M5 | **Estimate:** 0.5 day

**Scope:**
- Global exception filter: `CommExceptionFilter`
- All errors return:
  ```json
  { "error": { "code": "COMM_IDENTITY_NOT_FOUND", "message": "...", "requestId": "..." } }
  ```
- Define error code enum: `CommErrorCode`
- Map NestJS built-in exceptions + custom `CommException` to error codes
- No stack traces in production (`NODE_ENV=production`)

**Acceptance:** Every error response follows standard shape; HTTP 500 never exposes internal details.

---

## Dependency Summary

| Ticket | Blocked by |
|---|---|
| COMM-BE-004 | 001, 002, 003 |
| COMM-BE-005 | 002, 004 |
| COMM-BE-006 | 002, 005 |
| COMM-BE-007 | 006, COMM-BE-CORE-001 |
| COMM-BE-008 | 004, 006 |
| COMM-BE-009 | 001 |
| COMM-BE-010 | 005 |
| COMM-BE-011 | 006 |
| COMM-BE-012 | 005 |
| COMM-BE-014 | 006, 007, 008 |
| COMM-BE-015 | 005, 004 |
| COMM-BE-016 | 004 |
| COMM-BE-017 | 004 |
| COMM-BE-020 | 001 |

## New Env Vars

```env
PORT_COMM=3004
MONGO_URI_COMM=mongodb://localhost:27017/sentra_comm
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3004/api/comm/identities/oauth/callback
GOOGLE_PUBSUB_TOPIC=projects/{project-id}/topics/sentra-gmail-push
COMM_TOKEN_ENCRYPTION_KEY=   # 32-byte hex secret
COMM_IDEMPOTENCY_TTL_SECONDS=86400
SERVICE_SECRET=              # shared secret for inter-service calls (used in X-Service-Secret header)
COMM_PUBSUB_AUDIENCE=https://your-domain.com/api/comm/sync/webhook  # JWT audience for Pub/Sub verification
REDIS_URL=redis://localhost:6379
```
