# NOTIF-013 — @Mention Backend Integration

## Overview
Wire the `@mention` system into places where users write rich text content.
When content is saved, parse mentions and enqueue `MENTION` notifications.

Also create the `GET /api/users/search` endpoint used by the Tiptap MentionInput component.

## Prerequisites
- NOTIF-003 completed (NotificationHelper with `notifyMentions()`)
- NOTIF-010 completed (RichTextEditor with mention support)
- NOTIF-004 completed (notification REST API)

## Scope

### Backend Changes:
1. `GET /api/users/search?q=&orgId=` endpoint (new) — for mention dropdown
2. Wire `notifyMentions()` wherever rich text content is saved

### Where to Wire Mentions:
Read the codebase and find all places where text content is saved. Wire mentions for:

| Location | Service/Controller | Field |
|----------|-------------------|-------|
| Sale notes/description | core-service `SalesService` | any text field |
| Lead notes | core-service `LeadsService` | notes/description |
| Task description | pm-service `TasksService` | description |
| Task comments/threads | pm-service `ThreadsService` | message body |
| Project description | pm-service `ProjectsService` | description |

**IMPORTANT:** Only wire in places where rich text (Tiptap JSON) is actually being stored. Check the existing DTOs and models to confirm which fields will be updated to store Tiptap JSON.

---

## Implementation

### 1. User Search Endpoint (core-service)

Look at where user/employee data is stored. Check `core-service` for existing user query endpoints. Add a search endpoint:

```typescript
// In appropriate controller (OrganizationController or IamController):
@Get('users/search')
@UseGuards(JwtAuthGuard)
async searchUsers(
  @CurrentUser() user: RequestUser,
  @Query('q') query: string,
) {
  if (!query || query.trim().length < 1) return [];

  return this.prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true },
    take: 10,
  });
}
```

**Check the User model field names** before writing — confirm `name`, `email`, `organizationId` are correct field names in Prisma. Adjust if different.

Response shape must be:
```json
[{ "id": "clx...", "name": "John Doe" }, ...]
```
(Tiptap MentionList expects `id` and `name` fields)

---

### 2. Wire notifyMentions() — Pattern

For each text field that supports @mentions, add this call **after** the content is saved:

```typescript
// After saving the entity:
const saved = await this.prisma.someModel.update(...);

// Then (non-blocking — notifyMentions enqueues, returns fast):
await this.notificationHelper.notifyMentions({
  content: dto.description,        // Tiptap JSON object or string
  context: `in ${EntityName} "${saved.title}"`,
  url: `/dashboard/module/${saved.id}`,
  entityType: 'task',              // or 'sale', 'lead', 'project'
  entityId: saved.id,
  actorId: currentUser.userId,
  actorName: currentUser.name ?? 'Someone',
  organizationId: currentUser.organizationId,
  module: 'PM',                    // or 'SALES', 'HRMS'
});

return saved;   // API response not delayed — notifyMentions is fast (just enqueues)
```

**IMPORTANT rules:**
- Call `notifyMentions` AFTER the save — never before
- Do NOT await the result in a way that blocks the response. Since `notifyMentions` just enqueues, awaiting it is fine (BullMQ `queue.add()` is fast)
- Pass the FULL Tiptap JSON object (not just the text) so `parseMentions` correctly handles nested mention nodes
- The actor (the user who wrote the mention) should NOT receive a mention notification about their own mention

---

### 3. Prevent Self-Mention

In `NotificationHelper.notifyMentions()`, filter out the actor from recipients:

```typescript
// In NOTIF-003's notifyMentions():
const mentions = parseMentions(input.content);
const recipients = mentions
  .map((m) => m.userId)
  .filter((id) => id !== input.actorId);   // ← exclude self-mentions

if (recipients.length === 0) return;
```

**This change goes in NOTIF-003's file** — update `NotificationHelper.notifyMentions()` to add this filter. If NOTIF-003 is already implemented, update it now.

---

### 4. Mark Fields as Tiptap JSON in DTOs

Wherever mentions are wired, the corresponding DTO field that receives the content should be typed as `object` (for Tiptap JSON):

```typescript
// In CreateTaskDto, UpdateTaskDto, etc.:
@IsOptional()
description?: object;    // Tiptap JSON — NOT string

// Same for comment body, sale notes, etc.
```

Check existing DTOs. If they use `@IsString()` for description, change to `@IsOptional()` only (remove `@IsString()`) since Tiptap JSON is an object.

---

## User Search API — Acceptance Criteria

- [ ] `GET /api/users/search?q=john` returns users matching "john" in name OR email
- [ ] Search is case-insensitive
- [ ] Only returns users in same `organizationId` as requesting user
- [ ] Returns max 10 results
- [ ] Response has `id` and `name` fields (Tiptap MentionList depends on this)
- [ ] Requires JWT auth

## @Mention Wiring — Acceptance Criteria

- [ ] `notifyMentions()` called after save in at least: task description, task comments
- [ ] Actor (writer) does NOT receive mention notification about their own content
- [ ] Multiple mentions in one text → each mentioned user gets ONE notification (deduplication from NOTIF-003)
- [ ] If same user mentioned twice in same text → only ONE notification (deduplication)
- [ ] `notifyMentions()` called with Tiptap JSON object (not plain text string) where applicable
- [ ] Mention notification has correct `url` pointing to the entity
- [ ] Notification title: "{actorName} mentioned you"
- [ ] Notification body: "{actorName} mentioned you in {context}"

## Failure Criteria (reject if any)

- Self-mention sends notification (actor mentions themselves → no notification)
- User search returns users from other organizations
- `notifyMentions()` called BEFORE save (entity may not exist at notification URL)
- DTO field typed as `@IsString()` when storing Tiptap JSON (will fail validation)
- Mention notifications not linkable (missing `url` or `entityId`)

## Testing

```typescript
// Test self-mention filter:
// User A writes a task with @[userA_id:User A] and @[userB_id:User B]
// User A should NOT receive a MENTION notification
// User B should receive a MENTION notification

// Test deduplication:
// Text: "@[user-123:John] and @[user-123:John] again"
// Result: only ONE notification for user-123 (not two)

// Test user search:
// GET /api/users/search?q=john
// Should return users with "john" in name or email
// Should NOT return users from other orgs

// Test notification content:
// Notification.url should navigate to the correct entity page
// Notification.title = "Alice mentioned you"
// Notification.body = "Alice mentioned you in Task 'Fix login bug'"
```
