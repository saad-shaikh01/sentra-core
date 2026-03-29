This repo is an Nx monorepo with a clear split between CRM state and communications state. The important anchors are [core-service app module](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/backend/core-service/src/app/app.module.ts#L48), [comm-service app module](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/backend/comm-service/src/app/app.module.ts#L48), [Prisma schema](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/libs/backend/prisma-client/prisma/schema.prisma#L7), [comm gateway](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/backend/comm-service/src/modules/gateway/comm.gateway.ts#L58), [internal contacts service](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/backend/core-service/src/modules/internal-contacts/internal-contacts.service.ts#L9), and the sales UI entry points in [dashboard layout](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/frontend/sales-dashboard/src/app/dashboard/layout.tsx#L24), [lead detail sheet](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx#L101), [client detail sheet](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/frontend/sales-dashboard/src/app/dashboard/clients/_components/client-detail-sheet.tsx#L269), and [Gmail settings page](c:/Users/Saad shaikh/Desktop/landing pages/sentra-core/apps/frontend/sales-dashboard/src/app/dashboard/settings/gmail/page.tsx#L25).

Codebase Architecture Analysis
Detected data layer: PostgreSQL via Prisma for CRM/business entities, MongoDB via Mongoose for communications data, and Redis with BullMQ already present for queues.
core-service owns auth, RBAC, users/orgs/leads/clients/sales, internal contact lookup, notifications, analytics, and internal webhooks. JWT auth is centralized there, then reused by the frontend client.
comm-service already owns external communication identities, encrypted provider tokens, sync jobs, Mongo communication archives, and Socket.IO realtime delivery on /comm. That is the natural home for RingCentral.
Telephony should not be forced into the existing Gmail schemas. Current comm schemas are email-specific (gmailThreadId, gmailMessageId), so RingCentral needs parallel telephony/SMS schemas, while reusing the same queueing, encryption, gateway, and entity-linking patterns.
Existing auth/event patterns are useful: core issues JWTs, comm-service bridges org/user context from that JWT, BullMQ already handles sync/retry patterns, and the frontend already has mounted realtime watchers.
RingCentral Integration Strategy
Primary auth should be RingCentral Authorization Code flow per CRM user/extension, handled server-side in comm-service, because this CRM already stores third-party credentials server-side and needs background sync. Use JWT auth only for a shared admin/service integration if the client wants account-wide reporting from one predetermined RingCentral user.
Store RingCentral tokens with the existing encryption approach already used in comm-service. RingCentral access tokens are short-lived and refresh tokens need active renewal, so this fits the current identity/token-refresh model well.
Use RingCentral webhooks for backend ingestion, not direct RingCentral WebSockets to the browser. This repo already has an always-on backend and Socket.IO to the frontend; RingCentral webhooks feed the backend, then the backend fans out over the existing socket layer.
Realtime call state should come from telephony session notifications. Authoritative finalized data should come from post-call reconciliation against Call Log and recordings. SMS should use instant message events plus message-store reconciliation.
Contact sync should be CRM-first. Match inbound calls/SMS into CRM by normalized E.164 numbers. Optionally write selected contacts to RingCentral personal contacts, but do not make RingCentral company directory the source of truth because RingCentral does not expose write APIs for company directory entries.
Call/SMS raw data belongs in Mongo in comm-service. Summaries and user-visible CRM timeline entries should be projected into core activity records so leads/clients/sales pages stay first-class.
Recommended backend structure:

apps/backend/comm-service/src/modules/ringcentral/
  ringcentral.module.ts
  controllers/
    ringcentral-auth.controller.ts
    ringcentral-telephony.controller.ts
    ringcentral-messaging.controller.ts
    ringcentral-webhooks.controller.ts
  clients/
    ringcentral-api.client.ts
    ringcentral-voice.client.ts
    ringcentral-messaging.client.ts
    ringcentral-subscriptions.client.ts
    ringcentral-address-book.client.ts
  services/
    ringcentral-auth.service.ts
    ringcentral-connections.service.ts
    ringcentral-subscriptions.service.ts
    ringcentral-call-sync.service.ts
    ringcentral-sms.service.ts
    ringcentral-event-router.service.ts
    ringcentral-projection.service.ts
  processors/
    ringcentral-events.processor.ts
    ringcentral-reconcile.processor.ts
    ringcentral-recordings.processor.ts
    ringcentral-subscriptions.processor.ts
  schemas/
    rc-connection.schema.ts
    rc-subscription.schema.ts
    rc-webhook-event.schema.ts
    rc-call-session.schema.ts
    rc-call-log.schema.ts
    rc-sms-thread.schema.ts
    rc-sms-message.schema.ts
    rc-recording.schema.ts
Backend Implementation Plan (NestJS)
Create a new RingCentralModule in comm-service. Keep it parallel to identities, sync, threads, and messages, not mixed into them.
Add a by-phones internal lookup endpoint in core-service next to the existing email lookup flow. Use libphonenumber-js or Google libphonenumber, normalize every stored lead/client phone to E.164, and cache lookup results aggressively.
Add RingCentral webhook endpoints in comm-service only. They must answer validation requests immediately, persist raw payloads, and enqueue async processing. Do not do CRM matching or recording downloads in the request thread.
Add BullMQ queues such as ringcentral-events, ringcentral-reconcile, ringcentral-recordings, and ringcentral-subscriptions. Mirror the existing sync module’s retry/backoff pattern.
Use idempotency on uuid/subscriptionId/telephonySessionId/message IDs. Telephony sessions emit many status transitions, so aggregate by session and keep the latest sequence.
Reconciliation jobs should periodically backfill Call Log and message history to heal missed webhook deliveries, fetch recording metadata, and archive recording binaries into the existing object-storage path instead of Mongo blobs.
For post-call CRM visibility, project short activity entries into existing LeadActivity, ClientActivity, and optionally SaleActivity instead of creating a second CRM timeline system.
Frontend Integration Plan (Next.js)
Add a new settings page at app/dashboard/settings/ringcentral/page.tsx, modeled directly on the Gmail settings page. This should manage connect/disconnect, extension mapping, default outbound number, and sync health.
Put incoming-call popups and active-call state in the dashboard shell, near the current top-nav/watcher stack. The cleanest path is extending the existing comm watcher/socket pattern, not creating a separate frontend realtime stack.
Add click-to-call buttons where phone numbers already exist: lead detail, client detail, sale client section, and later table rows/cards. The first release can use a quick-dial modal.
Do not force telephony into the current /dashboard/inbox immediately. That page is email-centric. Add Calls and SMS tabs to lead/client sheets first, and create a new /dashboard/communications or /dashboard/phone workspace for global telephony.
Add a recording player and call notes/disposition UI inside call detail drawers or per-contact timelines. Recording playback should use signed backend URLs, not direct long-lived vendor URLs in the browser.
Performance Considerations
RingCentral will not materially hurt app performance if you stay webhook-first. It will hurt performance if you poll Call Log, Message Store, and subscriptions constantly.
API latency matters mainly for click-to-call, send-SMS, and recording fetches. Everything else should be async and cache-backed.
Webhook load can be noisy because telephony sessions generate multiple state changes per call. Coalesce these into one in-memory/job-level session timeline before writing projections.
BullMQ + Redis is already the right queue stack for this repo. RabbitMQ appears provisioned but not meaningfully used in the codebase; I would not introduce it for this integration.
Add caches for user-extension mapping, phone-number capability metadata, normalized phone lookups, subscription metadata, and RingCentral account/extension info.
If comm-service will scale horizontally, add the Socket.IO Redis adapter so realtime telephony events fan out correctly across instances.
Real-Time Features
Best fit: RingCentral webhooks into comm-service, then existing Socket.IO from comm-service to the Next.js dashboard. This matches both RingCentral’s “always-on service” webhook model and your current app architecture.
Emit new socket events on the existing /comm namespace, for example call:incoming, call:updated, call:ended, sms:new, sms:status, recording:ready, and telephony:error.
Use extension-level telephony subscriptions for per-user popups and status. Add account-level subscriptions later only if the client needs centralized wallboards or cross-extension analytics.
SSE is unnecessary here because the frontend already uses Socket.IO. Direct browser subscriptions to RingCentral WebSockets would bypass your current auth, entity-linking, and queue pipeline.
User Experience
Outbound calling workflow: user clicks a phone icon on a lead/client, picks the caller ID/line if needed, starts a call, sees live status, and lands back on the CRM record automatically. MVP can use RingOut; advanced mode can use RingCentral Embeddable/WebRTC for a true in-browser softphone.
Incoming calling workflow: popup appears in the dashboard with matched lead/client, quick actions open the record, and when the call ends the user gets a disposition/notes prompt. The call is logged automatically even if the user closes the popup.
SMS workflow: each contact gets an SMS thread in their record, unread badges update in real time, and outbound messages are sent from valid assigned RingCentral numbers only.
Call logging automation: every call/SMS is auto-linked by normalized phone number, written to the contact timeline, and optionally mirrored to notifications for missed calls, voicemails, or failed SMS.
Call notes should live as CRM activity content first, with a back-reference to the RingCentral session/message in comm-service.
Limitations
A custom CRM should not try to replace RingCentral admin/provisioning, IVR/call queue design, emergency calling, device management, number assignment, or advanced compliance settings.
Full in-CRM call controls are not guaranteed in an MVP. If you stay with RingOut plus webhook logging, the CRM can show call state but the actual answer/hangup/transfer still happens in RingCentral or on the user’s device.
RingCentral company directory is read-only from the API. You can search it, but you cannot build bidirectional company-directory sync from CRM to RingCentral.
Standard RingCentral business SMS has compliance and throughput constraints; it is not a good fit for automated campaigns or high-volume outbound notifications unless the account is specifically provisioned for that use case.
Recording availability can lag call completion, and some advanced call-control features depend on RingCentral permissions/licensing such as CallControl, ReadCallRecording, and advanced-user entitlements.
Plan B Alternatives
Twilio: best if you want a fully custom telephony product inside the CRM. Pros are maximum API flexibility and strong multichannel support. Cons are the largest rebuild, more telecom/compliance ownership, and you would be moving the client away from their existing RingCentral operation.
Aircall: best if the client mainly wants CRM popups, call logging, and a lighter CTI-style integration. Pros are simpler webhook-driven CRM integration patterns. Cons are less flexibility, less control than Twilio/RingCentral, and weaker fit if the client already standardized on RingCentral.
Telnyx: best if cost and low-level API control matter. Pros are API-first voice/messaging and solid webhook/signature patterns. Cons are more infrastructure and carrier responsibility on your side, plus less out-of-the-box end-user telephony UX than RingCentral.
Implementation Roadmap
| Phase | Scope | Effort | Complexity |
|---|---|---:|---|
| 1 | RingCentral app setup, auth flow, encrypted connection storage, settings page, extension/number mapping | 3-5 days | Medium |
| 2 | Click-to-call MVP via RingOut, telephony session subscriptions, socket events, global call popup | 5-8 days | Medium-High |
| 3 | Webhook ingestion, event queueing, phone-based entity linking, automatic call logging, missed-call notifications | 7-10 days | High |
| 4 | SMS threads, per-contact SMS UI, send/reply flows, recording metadata, call notes/dispositions | 7-10 days | High |
| 5 | Reconciliation jobs, analytics projections, failure recovery, rate-limit hardening, admin observability | 5-7 days | Medium-High |
| 6 | Optional in-browser softphone via RingCentral Embeddable/WebRTC and deeper call controls | 10-15 days | High |
Practical recommendation: build this in comm-service, project only summaries into core-service, and treat RingOut as the low-risk MVP path. If the client later demands full browser calling, layer RingCentral Embeddable/WebRTC on top instead of redesigning the backend.

Official docs used: RingCentral Auth overview, Auth code, JWT, Notifications, Webhooks, Receiving webhooks, Telephony sessions, Call log, Recordings, SMS, SMS sending, Address Book, Rate limits, WebRTC, RingOut.
Alternatives docs used: Twilio Voice webhooks, Messaging; Aircall OAuth, Webhooks; Telnyx Voice webhooks.

npx ts-node --project libs/backend/prisma-client/tsconfig.seed.json libs/backend/prisma-client/prisma/seeds/rbac.seed.ts
