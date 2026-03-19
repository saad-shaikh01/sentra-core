# NOTIF-003 — NotificationHelper Shared Library

## Overview
Create a `NotificationHelper` class in `libs/backend/prisma-client/src/` that ANY backend service
can import to enqueue notifications. This is the **single dispatch point** — no service should
write to `GlobalNotification` directly; they must go through this helper.

The helper enqueues a BullMQ job — it does NOT write to DB directly. API response is never delayed.

## Prerequisites
- NOTIF-001 completed (GlobalNotification model exists)
- NOTIF-002 completed (BullMQ queue + processor exist in core-service)

## Scope
**Files to create:**
```
libs/backend/prisma-client/src/
├── notification-helper.ts     ← main helper class
└── mention-parser.ts          ← @mention text parser
```
**Files to modify:**
```
libs/backend/prisma-client/src/index.ts   ← export both
```

**DO NOT:**
- Modify any Prisma schema files (done in NOTIF-001)
- Add to any app-level service (this is a shared lib)
- Inject Socket.io or FCM here — that's the processor's job

---

## Implementation Details

### mention-parser.ts

```typescript
// libs/backend/prisma-client/src/mention-parser.ts

export interface MentionToken {
  userId: string;
  displayName: string;
}

/**
 * Parses @mention tokens from Tiptap rich-text JSON or plain text.
 *
 * Tiptap stores mentions as JSON nodes. This function handles both:
 * 1. Plain text format:  @[userId:Display Name]
 * 2. Tiptap JSON format: { type: 'mention', attrs: { id: userId, label: displayName } }
 *
 * Pass the raw Tiptap JSON string (from editor.getJSON()) OR plain text.
 */
export function parseMentions(content: string | object): MentionToken[] {
  if (typeof content === 'object') {
    return parseTiptapJson(content as TiptapDoc);
  }

  // Plain text format: @[userId:Display Name]
  const plainRegex = /@\[([^:]+):([^\]]+)\]/g;
  const mentions: MentionToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = plainRegex.exec(content)) !== null) {
    mentions.push({ userId: match[1], displayName: match[2] });
  }
  return deduplicate(mentions);
}

interface TiptapDoc {
  type: string;
  content?: TiptapNode[];
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

function parseTiptapJson(doc: TiptapDoc): MentionToken[] {
  const mentions: MentionToken[] = [];
  traverse(doc, mentions);
  return deduplicate(mentions);
}

function traverse(node: TiptapNode, acc: MentionToken[]): void {
  if (node.type === 'mention' && node.attrs) {
    acc.push({
      userId: String(node.attrs['id']),
      displayName: String(node.attrs['label'] ?? ''),
    });
  }
  if (node.content) {
    for (const child of node.content) {
      traverse(child, acc);
    }
  }
}

function deduplicate(mentions: MentionToken[]): MentionToken[] {
  const seen = new Set<string>();
  return mentions.filter(({ userId }) => {
    if (seen.has(userId)) return false;
    seen.add(userId);
    return true;
  });
}
```

### notification-helper.ts

```typescript
// libs/backend/prisma-client/src/notification-helper.ts
import { Queue } from 'bullmq';
import { parseMentions } from './mention-parser';

// These must match EXACTLY what NOTIF-002 defines in core-service
export const NOTIFICATION_QUEUE = 'global-notification';
export const NOTIFICATION_JOB_DISPATCH = 'dispatch';

export interface NotifyInput {
  organizationId: string;
  recipientIds: string[];
  actorId?: string;
  type: string;           // use GlobalNotificationType enum values as strings
  module: string;         // use AppModule enum values as strings
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  url?: string;
  isMention?: boolean;
  mentionContext?: string;
  data?: Record<string, unknown>;
}

export interface NotifyMentionsInput {
  content: string | object;   // Tiptap JSON or plain text
  context: string;            // human-readable context e.g. "in Sale #123"
  url: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  organizationId: string;
  module: string;             // AppModule value
}

export class NotificationHelper {
  constructor(private readonly queue: Queue) {}

  /**
   * Enqueue a notification to be delivered asynchronously.
   * Returns immediately — does NOT block the API response.
   */
  async notify(input: NotifyInput): Promise<void> {
    if (!input.recipientIds || input.recipientIds.length === 0) return;

    await this.queue.add(NOTIFICATION_JOB_DISPATCH, input, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });
  }

  /**
   * Parse @mentions from rich text content and enqueue MENTION notifications
   * for each mentioned user. Call this when saving any text content that
   * supports @mentions (task description, comments, sale notes, etc.).
   *
   * Safe to call always — does nothing if no mentions found.
   */
  async notifyMentions(input: NotifyMentionsInput): Promise<void> {
    const mentions = parseMentions(input.content);
    if (mentions.length === 0) return;

    await this.notify({
      organizationId: input.organizationId,
      recipientIds: mentions.map((m) => m.userId),
      actorId: input.actorId,
      type: 'MENTION',
      module: input.module,
      title: `${input.actorName} mentioned you`,
      body: `${input.actorName} mentioned you ${input.context}`,
      entityType: input.entityType,
      entityId: input.entityId,
      url: input.url,
      isMention: true,
      mentionContext: input.context,
    });
  }
}
```

### Update exports

```typescript
// libs/backend/prisma-client/src/index.ts — ADD these exports:
export * from './notification-helper';
export * from './mention-parser';
```

---

## How Other Services Use This

Services that have BullMQ + Redis access (core-service, pm-service, hrms-service) inject the Queue and instantiate the helper:

```typescript
// Example usage in any NestJS service:
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationHelper, NOTIFICATION_QUEUE } from '@sentra-core/prisma-client'; // adjust import

@Injectable()
export class SomeService {
  private readonly notificationHelper: NotificationHelper;

  constructor(@InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue) {
    this.notificationHelper = new NotificationHelper(queue);
  }

  async doSomething() {
    await this.notificationHelper.notify({
      organizationId: orgId,
      recipientIds: [userId],
      type: 'SALE_STATUS_CHANGED',
      module: 'SALES',
      title: 'Sale status updated',
      body: 'Sale #123 moved to Closed Won',
      entityType: 'sale',
      entityId: saleId,
      url: `/dashboard/sales/${saleId}`,
    });
    // Returns immediately — notification delivered async
  }
}
```

---

## Acceptance Criteria

- [ ] `parseMentions()` exported from `mention-parser.ts`
- [ ] `parseMentions()` handles Tiptap JSON format (nested `type: 'mention'` nodes)
- [ ] `parseMentions()` handles plain text `@[userId:name]` format
- [ ] `parseMentions()` deduplicates — same user mentioned twice = one notification
- [ ] `NotificationHelper` exported from `notification-helper.ts`
- [ ] `notify()` method enqueues job to BullMQ — does NOT write to DB directly
- [ ] `notifyMentions()` calls `parseMentions()` first, returns early if empty
- [ ] BullMQ job has retry config: `attempts: 3, backoff: exponential`
- [ ] Both exported from `libs/backend/prisma-client/src/index.ts`

## Failure Criteria (reject if any)

- `notify()` writes directly to `prisma.globalNotification` instead of BullMQ
- No retry config on enqueued jobs
- `parseMentions()` does not handle Tiptap JSON format
- `recipientIds` empty array causes job to be enqueued (should return early)
- Queue name string hardcoded differently than `'global-notification'` in NOTIF-002

## Testing

```typescript
// Unit test for parseMentions:
const tiptapJson = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'mention', attrs: { id: 'user-123', label: 'John' } },
        { type: 'text', text: ' and ' },
        { type: 'mention', attrs: { id: 'user-456', label: 'Jane' } },
        // Duplicate mention — should be deduplicated
        { type: 'mention', attrs: { id: 'user-123', label: 'John' } },
      ],
    },
  ],
};

const result = parseMentions(tiptapJson);
// Expected: [{ userId: 'user-123', displayName: 'John' }, { userId: 'user-456', displayName: 'Jane' }]
// NOT 3 results — deduplication must work
assert(result.length === 2);

// Plain text:
const plain = 'Hey @[user-123:John] check this @[user-456:Jane]';
const result2 = parseMentions(plain);
assert(result2.length === 2);
```
