# Comm Service Runbook

Status: Operational runbook  
Service: `apps/backend/comm-service`  
Primary health endpoint: `GET /api/comm/health`

## 1. Token Rotation

### Goal

Rotate `COMM_ENCRYPTION_MASTER_KEY` without making existing Gmail tokens undecryptable.

### Important Constraint

The current `TokenEncryptionService` derives the active AES key directly from the single env var `COMM_ENCRYPTION_MASTER_KEY`. A direct env change is destructive for existing encrypted tokens because old ciphertext cannot be decrypted with the new key.

### Safe Procedure

1. Schedule a maintenance window.
2. Do not rotate the env var in place on the current release.
3. Prepare a temporary compatibility release with:
   - primary encrypt key = new key
   - decrypt fallback = old key, then new key
4. Deploy the compatibility release with both keys available as env vars.
5. Re-encrypt stored tokens:
   - read each active `comm_identities` document
   - decrypt `encryptedAccessToken` and `encryptedRefreshToken` with the fallback logic
   - re-encrypt with the new primary key
   - write the new ciphertext back to MongoDB
6. Validate on a small sample first:
   - pick 2 to 5 active identities
   - run a token decrypt + Gmail API call check
   - confirm sync still works and token refresh persists successfully
7. After all identities are re-encrypted, remove the old fallback key from the deployment.
8. Restart all `comm-service` instances.

### Rollback

1. Re-deploy the compatibility release with the old key still available.
2. If needed, switch the primary encrypt key back to the old key.
3. Re-test Gmail auth on at least one active identity before reopening traffic.

### Do Not Do

- Do not change `COMM_ENCRYPTION_MASTER_KEY` directly on the current single-key implementation.
- Do not rotate during an active incident involving token refresh failures.

## 2. Gmail Quota Exhaustion Recovery

### Indicators

- sync jobs fail with `GMAIL_RATE_LIMITED`
- logs show Gmail `429`
- `comm_sync_errors_total{type="rate_limit"}` increases

### Pause Procedure

Current constraint: BullMQ workers run inside `comm-service`. There is no runtime pause toggle in the codebase.

1. Stop or scale down `comm-service` workers.
2. If the service is single-purpose, scale the deployment to `0`.
3. If the API must remain available, use a maintenance deployment strategy that prevents worker execution before resuming traffic.

### Recovery Steps

1. Confirm the `Retry-After` window from logs or Gmail responses.
2. Wait for the quota window to reset.
3. Restore `comm-service` workers.
4. Trigger recovery sync:
   - allow scheduled incremental sync to resume, or
   - manually call `POST /api/comm/sync/:identityId/trigger` for affected identities
5. Watch:
   - `GET /api/comm/health`
   - `comm_sync_errors_total`
   - `comm_queue_depth`
   - socket `sync:progress` / `sync:complete` events

### Post-Recovery Checks

1. Confirm queue depth is draining.
2. Confirm `syncState.lastSyncAt` advances on affected identities.
3. Confirm unread counts and new inbound mail are updating again.

## 3. Identity Reconnect Procedure

### When To Use

Use this when an identity shows `syncState.status = 'error'` or the UI shows an identity error banner.

### User/Admin Procedure

1. Open Gmail settings in the dashboard.
2. Locate the affected identity.
3. Click `Reconnect`.
4. Complete the Google OAuth flow.
5. Wait for the backend redirect back to the dashboard with `?success=1&identityId=...`.
6. Confirm the identity returns to active state and sync starts again.

### Admin Checks

1. Confirm the identity still belongs to the expected user.
2. Confirm the reconnect did not violate mailbox ownership rules.
3. Confirm `syncState.lastError` is cleared or no longer blocking sync.

### If Reconnect Fails

1. Check backend logs for:
   - OAuth callback errors
   - token decrypt/encrypt errors
   - Gmail token refresh failures
2. Verify required Gmail env vars:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REDIRECT_URI`
3. Verify `COMM_ENCRYPTION_MASTER_KEY` is unchanged from the key that encrypted existing tokens.
4. Retry the OAuth flow.
5. If still failing, disconnect and reconnect only if the mailbox ownership rules allow it.

## 4. Redis Flush Recovery

### What To Expect After `FLUSHALL` / `FLUSHDB`

- BullMQ queue metadata is lost
- delayed / retry job state is lost
- cached OAuth nonces are lost
- health-cache keys are lost
- unread and sync-progress cache state may repopulate slowly

### Immediate Recovery

1. Restart all `comm-service` instances.
2. Confirm Redis connectivity via `GET /api/comm/health`.
3. Confirm BullMQ workers are running again.

### Re-Initialization Steps

1. Re-run any user-facing OAuth attempts that were in progress before the flush.
2. Re-trigger sync for identities that were mid-sync:
   - use `POST /api/comm/sync/:identityId/trigger`
   - for newly connected identities, re-run initial sync if needed
3. Monitor queue rebuild:
   - `comm_queue_depth`
   - `comm_dlq_depth`
4. Confirm websocket updates resume:
   - `sync:progress`
   - `sync:complete`
   - `message:new`

### Recovery Validation

1. `GET /api/comm/health` returns MongoDB and Redis as connected.
2. A manual incremental sync can be queued successfully.
3. A connected identity can receive new inbound mail and update unread state.

## 5. Deployment Checklist

### Required Env Vars

- `COMM_ENCRYPTION_MASTER_KEY`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`
- `WASABI_ENDPOINT`
- `WASABI_REGION`
- `WASABI_ACCESS_KEY_ID`
- `WASABI_SECRET_ACCESS_KEY`
- `WASABI_BUCKET`
- `BUNNY_CDN_BASE_URL`

### Recommended Env Vars

- `MONGO_URI`
- `REDIS_URL`
- `GOOGLE_PUBSUB_TOPIC`
- `COMM_PUBSUB_AUDIENCE`
- `SALES_DASHBOARD_URL`
- `CORE_SERVICE_URL`
- `INTERNAL_SERVICE_SECRET`

### MongoDB Index Verification

Confirm these indexes exist before or immediately after deploy:

1. `comm_identities`
   - `{ organizationId: 1, email: 1 }` unique
   - `{ organizationId: 1, userId: 1 }`
2. `comm_threads`
   - `{ organizationId: 1, gmailThreadId: 1 }` unique
   - `{ organizationId: 1, lastMessageAt: -1 }`
   - `{ organizationId: 1, isArchived: 1, lastMessageAt: -1 }`
   - `{ organizationId: 1, identityId: 1, lastMessageAt: -1 }`
   - `{ organizationId: 1, hasUnread: 1, lastMessageAt: -1 }`
   - `{ organizationId: 1, hasSent: 1, lastMessageAt: -1 }`
3. `comm_messages`
   - `{ organizationId: 1, gmailMessageId: 1 }` unique
   - `{ organizationId: 1, gmailThreadId: 1, sentAt: 1 }`
4. `comm_sync_jobs`
   - `{ organizationId: 1, status: 1, createdAt: -1 }`
   - `{ identityId: 1, jobType: 1, status: 1 }`

### Health Checks

1. Call `GET /api/comm/health`
2. Confirm response includes:
   - `status: "ok"`
   - `mongodb: "connected"`
   - `redis: "connected"`
3. Confirm no unexpected spike in:
   - `comm_sync_errors_total`
   - `comm_dlq_depth`
   - `comm_queue_depth`

### Deploy / Validate Sequence

1. Apply env vars.
2. Deploy `comm-service`.
3. Confirm startup does not fail env validation.
4. Run the health check.
5. Verify MongoDB indexes.
6. Trigger one manual sync on a non-critical identity.
7. Confirm:
   - job enqueued
   - progress events emitted
   - completion event emitted
   - no new token refresh or rate-limit errors
