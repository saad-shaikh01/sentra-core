# NOTIF-002 — BullMQ Notification Queue + Processor (core-service)

## Overview
Set up a BullMQ queue named `global-notification` inside **core-service**.
The queue processor handles: DB write → Socket.io emit → FCM push (in that order).
This ensures **zero API latency impact** — callers enqueue a job and return immediately.

## Prerequisites
- NOTIF-001 completed (GlobalNotification + PushToken models exist)
- Redis running (already used by comm-service — use same Redis instance)
- `@nestjs/bullmq` and `bullmq` already installed (check comm-service package.json — if installed there, add to core-service)

## Scope
**Files to create/modify (core-service only):**
```
apps/backend/core-service/src/modules/notifications/
├── notification-queue.constants.ts   ← queue name + job names
├── notification-queue.processor.ts   ← BullMQ processor
└── notification-queue.module.ts      ← BullMQ module registration
```
**Also modify:**
- `apps/backend/core-service/src/app.module.ts` — import NotificationQueueModule

---

## Implementation Details

### Step 1 — Install dependencies (if not in core-service)

Check `apps/backend/core-service/package.json`. If `@nestjs/bullmq` and `bullmq` are missing:
```bash
cd apps/backend/core-service
npm install @nestjs/bullmq bullmq
```
Check `apps/backend/comm-service/package.json` first to see what versions are used — match those versions exactly.

### Step 2 — Constants file

```typescript
// notification-queue.constants.ts
export const NOTIFICATION_QUEUE = 'global-notification';

export const NotificationJobName = {
  DISPATCH: 'dispatch',
} as const;

export interface NotificationJobPayload {
  organizationId: string;
  recipientIds: string[];
  actorId?: string;
  type: string;           // GlobalNotificationType value
  module: string;         // AppModule value
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  url?: string;
  isMention?: boolean;
  mentionContext?: string;
  data?: Record<string, unknown>;
}
```

### Step 3 — Processor

```typescript
// notification-queue.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NOTIFICATION_QUEUE, NotificationJobPayload } from './notification-queue.constants';
import { PrismaService } from '../../prisma/prisma.service';   // adjust import path
import { NotificationsGateway } from './notifications.gateway'; // created in NOTIF-005
import { FcmService } from './fcm.service';                     // created in NOTIF-012

@Processor(NOTIFICATION_QUEUE)
export class NotificationQueueProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly fcm: FcmService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>) {
    const payload = job.data;

    // 1. Write to DB (batch)
    const notifications = payload.recipientIds.map((recipientId) => ({
      organizationId: payload.organizationId,
      recipientId,
      actorId: payload.actorId ?? null,
      type: payload.type as any,
      module: payload.module as any,
      title: payload.title,
      body: payload.body,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      url: payload.url ?? null,
      isMention: payload.isMention ?? false,
      mentionContext: payload.mentionContext ?? null,
      data: payload.data ?? null,
    }));

    const created = await this.prisma.globalNotification.createMany({
      data: notifications,
    });

    // 2. Emit real-time via Socket.io (per recipient)
    for (const recipientId of payload.recipientIds) {
      // Fetch the created notification to emit
      const notification = await this.prisma.globalNotification.findFirst({
        where: {
          organizationId: payload.organizationId,
          recipientId,
          type: payload.type as any,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (notification) {
        this.gateway.emitToUser(recipientId, 'notification:new', notification);
      }
    }

    // 3. FCM push (skip if NOTIF-012 not yet implemented — just wrap in try/catch)
    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId: { in: payload.recipientIds } },
        select: { token: true },
      });
      if (tokens.length > 0) {
        await this.fcm.sendMulticast({
          tokens: tokens.map((t) => t.token),
          title: payload.title,
          body: payload.body,
          data: {
            url: payload.url ?? '',
            entityType: payload.entityType ?? '',
            entityId: payload.entityId ?? '',
          },
        });
      }
    } catch (err) {
      // FCM errors should NOT fail the job — just log
      console.error('[NotificationProcessor] FCM error (non-fatal):', err);
    }

    return { processed: created.count };
  }
}
```

**IMPORTANT for the processor:**
- `NotificationsGateway` is a forward reference dependency — it will be implemented in NOTIF-005. For now, inject it but mark it as optional with `@Optional()` decorator. When NOTIF-005 is done, remove `@Optional()`.
- `FcmService` is from NOTIF-012. Same pattern — use `@Optional()` for now.
- The processor must NOT throw for FCM failures (wrapped in try/catch as shown).

### Step 4 — Module

```typescript
// notification-queue.module.ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';
import { NotificationQueueProcessor } from './notification-queue.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationQueueProcessor],
  exports: [BullModule],  // export so NotificationsModule can inject the Queue
})
export class NotificationQueueModule {}
```

### Step 5 — Register Redis config in core-service AppModule

Look at how comm-service registers BullMQ in its AppModule (find `BullModule.forRoot` there). Copy the exact same Redis config pattern into core-service's AppModule.

```typescript
// In core-service app.module.ts — add to imports:
BullModule.forRoot({
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
  },
}),
NotificationQueueModule,
```

---

## Acceptance Criteria

- [ ] `NOTIFICATION_QUEUE = 'global-notification'` constant defined
- [ ] `NotificationJobPayload` interface has ALL fields listed (none missing/renamed)
- [ ] Processor extends `WorkerHost` and implements `process(job)`
- [ ] Processor step 1: creates DB records via `prisma.globalNotification.createMany()`
- [ ] Processor step 2: emits Socket.io event per recipient (with `@Optional()` guard)
- [ ] Processor step 3: FCM dispatch wrapped in try/catch (non-fatal)
- [ ] BullMQ registered with same Redis config as comm-service
- [ ] `NotificationQueueModule` registered in core-service AppModule
- [ ] Core-service starts without errors after changes

## Failure Criteria (reject if any)

- FCM errors can crash the processor job (missing try/catch)
- DB write is synchronous/blocking in the API layer instead of enqueued
- Hardcoded Redis host/port instead of env vars
- NotificationsGateway injected without `@Optional()` (will cause circular dep crash before NOTIF-005 is done)
- `BullModule.forRoot` not added to AppModule (queue won't connect to Redis)

## Testing

```bash
# Manually add a test job via Bull Board or code:
# In any service: inject Queue, call queue.add('dispatch', payload)
# Check Redis: keys should contain 'bull:global-notification:*'
# Check logs: processor should log 'processed: N'

# Verify core-service still starts:
cd apps/backend/core-service
npx nx serve core-service
# Should see: "Bull queue 'global-notification' connected"
```
