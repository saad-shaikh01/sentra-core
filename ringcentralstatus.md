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


implement but not in this branch create new branch and implement phase by phase



Worked for 14m 34s
Branch: feature/ringcentral-phase-1-auth

Phase 1 is implemented on that branch. On the backend I added a dedicated RingCentral connection model and module in ringcentral-connection.schema.ts, ringcentral.service.ts, and ringcentral.controller.ts, then wired it into app.module.ts and comm-schemas.module.ts. This phase includes RingCentral OAuth initiate/callback, brand lookup, connection listing, default selection, disconnect, encrypted token storage, and extension/phone-number metadata capture.

On the frontend I added the first usable settings surface in page.tsx, plus API/hooks/types/sidebar wiring in api.ts, use-comm.ts, comm.types.ts, and sidebar.tsx. The UI is intentionally limited to Phase 1: connect RingCentral, view connected extensions, assign optional brand routing, set a default connection, reconnect, and disconnect.

Verification:

npx tsc -p apps/backend/comm-service/tsconfig.app.json --noEmit passed.
npx eslint on the new RingCentral backend/frontend files passed.
Full sales-dashboard typecheck still fails on pre-existing unrelated errors in alerts-panel.tsx, thread-view-drawer.tsx, and tracking-state.tsx.
nx build was not usable in this sandbox because Nx plugin processes failed with local spawn EPERM.
Before this works end-to-end against RingCentral, you need env vars for RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_REDIRECT_URI, optional RINGCENTRAL_SERVER_URL and RINGCENTRAL_SCOPES, plus a valid SALES_DASHBOARD_URL or FRONTEND_URL for callback redirects.

Next clean phase is Phase 2: token refresh foundation, subscription scaffolding, and click-to-call/session-status plumbing on the same branch.


11 files changed
+1412
-38
Undo

Review
apps/backend/comm-service/src/app/app.module.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.controller.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.module.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.service.ts
apps/backend/comm-service/src/schemas/comm-schemas.module.ts
apps/backend/comm-service/src/schemas/ringcentral-connection.schema.ts
apps/frontend/sales-dashboard/src/app/dashboard/settings/ringcentral/page.tsx
apps/frontend/sales-dashboard/src/components/sidebar.tsx
apps/frontend/sales-dashboard/src/hooks/use-comm.ts
apps/frontend/sales-dashboard/src/lib/api.ts
apps/frontend/sales-dashboard/src/types/comm.types.ts
start phase 2



Worked for 31m 29s
Phase 2 is implemented on feature/ringcentral-phase-2-calling.

Backend work is in ringcentral.service.ts, ringcentral.controller.ts, and ringcentral-call-session.schema.ts. This phase adds token refresh handling, RingOut start/cancel/status flows, active-call reads, and persisted call-session tracking. Frontend wiring is in api.ts, comm.types.ts, and use-comm.ts.

UI work is in ringcentral-call-button.tsx and ringcentral-call-dock.tsx, mounted in layout.tsx. Click-to-call is now exposed in lead-detail-sheet.tsx, client-detail-sheet.tsx, and sale-client-section.tsx. The dock is polling-based for now; webhook/subscription-driven realtime still belongs to Phase 3.

Verification:

npx tsc -p apps/backend/comm-service/tsconfig.app.json --noEmit passed.
Targeted npx eslint on the new RingCentral backend/frontend files passed.
npx tsc -p apps/frontend/sales-dashboard/tsconfig.json --noEmit still fails on pre-existing unrelated issues in alerts-panel.tsx, thread-view-drawer.tsx, and tracking-state.tsx.
Next phase should be webhook ingestion, subscription lifecycle, CRM entity linking by phone, and socket-based realtime updates.


14 files changed
+1757
-62
Undo

Review
apps/backend/comm-service/src/modules/ringcentral/dto/create-ringcentral-call.dto.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.controller.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.service.ts
apps/backend/comm-service/src/schemas/comm-schemas.module.ts
apps/backend/comm-service/src/schemas/ringcentral-call-session.schema.ts
apps/frontend/sales-dashboard/src/app/dashboard/clients/_components/client-detail-sheet.tsx
apps/frontend/sales-dashboard/src/app/dashboard/layout.tsx
apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
apps/frontend/sales-dashboard/src/app/dashboard/sales/[id]/_components/sale-client-section.tsx
apps/frontend/sales-dashboard/src/components/shared/ringcentral/ringcentral-call-button.tsx
apps/frontend/sales-dashboard/src/components/shared/ringcentral/ringcentral-call-dock.tsx
apps/frontend/sales-dashboard/src/hooks/use-comm.ts
apps/frontend/sales-dashboard/src/lib/api.ts
apps/frontend/sales-dashboard/src/types/comm.types.ts
start next phase



Worked for 21m 29s
Phase 3 is started on feature/ringcentral-phase-3-webhooks.

Backend work is in ringcentral.service.ts, ringcentral.controller.ts, ringcentral-events.processor.ts, ringcentral-subscriptions.processor.ts, ringcentral-connection.schema.ts, and ringcentral-webhook-event.schema.ts. This phase adds webhook subscription provisioning per RingCentral connection, a public webhook endpoint with validation-token echo, raw webhook event persistence, BullMQ-backed async processing, renewal handling, and socket fanout for call:incoming, call:updated, and call:ended.

Frontend wiring is in page.tsx, use-comm.ts, api.ts, comm.types.ts, and use-comm-socket.ts. Existing connections now get a Sync Live Events action in RingCentral settings plus live-event status metadata, and the socket layer now invalidates RingCentral call queries when webhook-driven call events arrive.

Important env requirement: webhooks will only work if RINGCENTRAL_WEBHOOK_URL or COMM_SERVICE_PUBLIC_URL or COMM_SERVICE_URL resolves to a public URL RingCentral can reach. If that is missing, subscription sync will fail even though backend compile passes.

Verification:

npx tsc -p apps/backend/comm-service/tsconfig.app.json --noEmit passed.
npx tsc -p apps/frontend/sales-dashboard/tsconfig.json --noEmit still fails only on pre-existing unrelated files: alerts-panel.tsx, thread-view-drawer.tsx, and tracking-state.tsx.
Targeted ESLint on touched Phase 3 files produced no errors; the warning-heavy frontend utility files remain warning-heavy.
This phase still does not do SMS sync, CRM phone-based contact linking, or durable call-log projection into lead/client timelines. Those are the next logical slice.

Sources used: RingCentral creating webhooks, receiving webhooks, and telephony session notifications.


14 files changed
+889
-16
Undo

Review
apps/backend/comm-service/src/modules/ringcentral/ringcentral-events.processor.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral-subscriptions.processor.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.constants.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.controller.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.module.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.service.ts
apps/backend/comm-service/src/schemas/comm-schemas.module.ts
apps/backend/comm-service/src/schemas/ringcentral-connection.schema.ts
apps/backend/comm-service/src/schemas/ringcentral-webhook-event.schema.ts
apps/frontend/sales-dashboard/src/app/dashboard/settings/ringcentral/page.tsx
apps/frontend/sales-dashboard/src/hooks/use-comm-socket.ts
apps/frontend/sales-dashboard/src/hooks/use-comm.ts
apps/frontend/sales-dashboard/src/lib/api.ts
apps/frontend/sales-dashboard/src/types/comm.types.ts
whats next


Next is Phase 4: CRM linkage and durable telephony history.

Right now you have auth, calling, webhook subscription sync, raw webhook ingestion, and socket fanout. What’s still missing is the part that makes telephony useful inside the CRM itself: matching calls to leads/clients by phone, storing normalized call history beyond transient webhook events, and showing that data in entity timelines instead of only the live call dock.

The practical next slice is:

Add internal contact lookup by phone in core-service, parallel to the existing email lookup flow.
Normalize phone numbers consistently and link RingCentral events/calls to lead or client.
Project completed calls and missed calls into durable CRM-facing records, not just raw webhook archives.
Add per-contact call history UI on lead/client detail pages.
Add call notes/disposition scaffolding tied to tracked call sessions.
Start SMS thread storage if you want messaging next; otherwise leave SMS for Phase 5.
If you want, I can start Phase 4 now on a new branch and implement the phone-based entity linking first, because that is the dependency that unlocks timelines, missed-call automation, and usable call history.


start phase 4



Worked for 15m 50s
Phase 4 is implemented on feature/ringcentral-phase-4-linking.

The backend now links telephony to CRM records by phone number. I added internal phone lookup in internal-contacts.controller.ts and internal-contacts.service.ts, then exposed that to comm-service via internal-contacts.client.ts. RingCentral webhook processing now upserts durable call-session history, attaches entityType and entityId when a phone match resolves, and returns filtered call history from ringcentral.service.ts, ringcentral.service.ts, ringcentral.service.ts, and ringcentral.controller.ts. The call-session schema was expanded for telephony IDs, direction, missed-call flags, matched phone, and webhook-source history in ringcentral-call-session.schema.ts.

On the frontend, lead and client sheets now have a dedicated Calls tab backed by a reusable history component in entity-call-timeline.tsx. It is mounted in lead-detail-sheet.tsx and lead-detail-sheet.tsx, plus client-detail-sheet.tsx and client-detail-sheet.tsx. I also widened the shared call types and query keys in comm.types.ts and use-comm.ts so entity-scoped call history invalidates correctly.

Verification:

npx tsc -p apps/backend/core-service/tsconfig.app.json --noEmit passed.
npx tsc -p apps/backend/comm-service/tsconfig.app.json --noEmit passed.
npx tsc -p apps/frontend/sales-dashboard/tsconfig.json --noEmit still fails only on pre-existing unrelated files: alerts-panel.tsx, thread-view-drawer.tsx, and tracking-state.tsx.
Targeted ESLint on Phase 4 files passed with no errors. Remaining warnings are in existing warning-heavy frontend files like lead-detail-sheet.tsx, use-comm.ts, and use-comm-socket.ts.
Next phase should be SMS threads plus call dispositions/notes, because the record-linking foundation is now in place.


15 files changed
+793
-147
Undo

Review
apps/backend/comm-service/src/common/http/internal-contacts.client.ts
apps/backend/comm-service/src/modules/entity-links/entity-links.service.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.controller.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.module.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.service.ts
apps/backend/comm-service/src/schemas/ringcentral-call-session.schema.ts
apps/backend/core-service/src/modules/internal-contacts/dto/lookup-contacts.dto.ts
apps/backend/core-service/src/modules/internal-contacts/internal-contacts.controller.ts
apps/backend/core-service/src/modules/internal-contacts/internal-contacts.service.ts
apps/frontend/sales-dashboard/src/app/dashboard/clients/_components/client-detail-sheet.tsx
apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
apps/frontend/sales-dashboard/src/components/shared/ringcentral/entity-call-timeline.tsx
apps/frontend/sales-dashboard/src/hooks/use-comm-socket.ts
apps/frontend/sales-dashboard/src/hooks/use-comm.ts
apps/frontend/sales-dashboard/src/types/comm.types.ts
start next phase



Worked for 26m 55s
Phase 5 is started on feature/ringcentral-phase-5-sms-notes.

This phase adds durable RingCentral SMS plus in-CRM call annotations. On the backend, comm-service now has SMS thread/message storage in ringcentral-sms-thread.schema.ts and ringcentral-sms-message.schema.ts, plus new RingCentral endpoints in ringcentral.controller.ts and service logic in ringcentral.service.ts. That includes PATCH /calls/:id/annotation, SMS thread/message list APIs, SMS send, mark-thread-read, webhook SMS ingestion, and local persistence/serialization. Call sessions now also store disposition and notes in ringcentral-call-session.schema.ts.

On the frontend, I added a reusable SMS conversation surface in entity-sms-conversation.tsx, extended call cards with dispositions/notes in entity-call-timeline.tsx, and wired the new queries/mutations/socket invalidation in use-comm.ts and use-comm-socket.ts. Lead and client detail sheets now have SMS tabs in lead-detail-sheet.tsx and client-detail-sheet.tsx.

Verification:

npx tsc -p apps/backend/comm-service/tsconfig.app.json --noEmit passed.
Targeted eslint on the Phase 5 backend/frontend files passed with warnings only in existing warning-heavy files.
npx tsc -p apps/frontend/sales-dashboard/tsconfig.json --noEmit still fails only on the same pre-existing unrelated files: alerts-panel.tsx, thread-view-drawer.tsx, and tracking-state.tsx.
Next logical phase is message-store reconciliation and broader comm workspace support: backfill missed SMS history from RingCentral, MMS/attachment handling, and a global phone/SMS inbox outside the lead/client sheets.


18 files changed
+1893
-12
Undo

Review
apps/backend/comm-service/src/modules/ringcentral/dto/send-ringcentral-sms.dto.ts
apps/backend/comm-service/src/modules/ringcentral/dto/update-ringcentral-call-annotation.dto.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.constants.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.controller.ts
apps/backend/comm-service/src/modules/ringcentral/ringcentral.service.ts
apps/backend/comm-service/src/schemas/comm-schemas.module.ts
apps/backend/comm-service/src/schemas/ringcentral-call-session.schema.ts
apps/backend/comm-service/src/schemas/ringcentral-sms-message.schema.ts
apps/backend/comm-service/src/schemas/ringcentral-sms-thread.schema.ts
apps/frontend/sales-dashboard/src/app/dashboard/clients/_components/client-detail-sheet.tsx
apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx
apps/frontend/sales-dashboard/src/app/dashboard/settings/ringcentral/page.tsx
apps/frontend/sales-dashboard/src/components/shared/ringcentral/entity-call-timeline.tsx
apps/frontend/sales-dashboard/src/components/shared/ringcentral/entity-sms-conversation.tsx
apps/frontend/sales-dashboard/src/hooks/use-comm-socket.ts
apps/frontend/sales-dashboard/src/hooks/use-comm.ts
apps/frontend/sales-dashboard/src/lib/api.ts
apps/frontend/sales-dashboard/src/types/comm.types.ts
