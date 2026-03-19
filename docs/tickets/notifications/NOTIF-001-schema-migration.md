# NOTIF-001 — Database Schema & Prisma Migration

## Overview
Add `GlobalNotification` and `PushToken` models to the shared Prisma schema.
This is the **foundation ticket** — nothing else can start until this migration runs successfully.

## Prerequisites
- Access to `libs/backend/prisma-client/prisma/schema.prisma`
- PostgreSQL dev database running
- `prisma` CLI available

## Scope
**Files to modify:**
- `libs/backend/prisma-client/prisma/schema.prisma` — add models + enums
- Run `npx prisma migrate dev` to generate migration
- Run `npx prisma generate` to regenerate client

**DO NOT touch:**
- Any existing models (`Notification`, `PmNotification`) — leave them as-is in this ticket (migration ticket NOTIF-011 will handle data migration and model removal)
- Any service files
- Any frontend files

---

## Exact Schema to Add

Add the following to `schema.prisma` **after** the existing `Notification` model:

```prisma
// ─── Global Notification System ──────────────────────────────────

enum GlobalNotificationType {
  // Sales domain
  SALE_STATUS_CHANGED
  PAYMENT_RECEIVED
  PAYMENT_FAILED
  INVOICE_OVERDUE
  CHARGEBACK_FILED
  // PM domain
  TASK_ASSIGNED
  TASK_DUE_SOON
  COMMENT_ADDED
  PROJECT_STATUS_CHANGED
  APPROVAL_REQUESTED
  // Cross-domain
  MENTION
  SYSTEM_ALERT
}

enum AppModule {
  SALES
  PM
  HRMS
  COMM
  SYSTEM
}

enum PushPlatform {
  WEB
  ANDROID
  IOS
}

model GlobalNotification {
  id             String                   @id @default(cuid())
  organizationId String
  recipientId    String
  actorId        String?

  type           GlobalNotificationType
  module         AppModule

  title          String
  body           String

  // Linkable fields
  entityType     String?
  entityId       String?
  url            String?

  // @mention
  isMention      Boolean                  @default(false)
  mentionContext String?

  isRead         Boolean                  @default(false)
  readAt         DateTime?

  data           Json?

  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt

  @@index([organizationId, recipientId, isRead, createdAt])
  @@index([recipientId, createdAt])
  @@index([organizationId, type])
}

model PushToken {
  id             String        @id @default(cuid())
  userId         String
  organizationId String
  token          String        @unique
  platform       PushPlatform
  userAgent      String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([userId, organizationId])
}
```

---

## Migration Steps

1. Add the schema above to `schema.prisma`
2. Run:
   ```bash
   cd libs/backend/prisma-client
   npx prisma migrate dev --name add-global-notification-push-token
   ```
3. Run:
   ```bash
   npx prisma generate
   ```
4. Verify migration file was created in `prisma/migrations/`

---

## Acceptance Criteria

- [ ] `GlobalNotification` model exists in schema with ALL fields listed above (none missing)
- [ ] `PushToken` model exists in schema with ALL fields listed above
- [ ] All 3 new enums exist: `GlobalNotificationType`, `AppModule`, `PushPlatform`
- [ ] Migration file generated successfully (no errors)
- [ ] `prisma generate` completes without errors
- [ ] `prisma.globalNotification` and `prisma.pushToken` are accessible in TypeScript (check with a quick type import test)
- [ ] Existing `Notification` and `PmNotification` models are **untouched**

## Failure Criteria (reject if any of these)

- Any existing model modified or removed
- Migration not generated (only schema edited, migrate not run)
- `prisma generate` skipped
- Fields different from spec (renamed, different types, missing indexes)
- Enums have different values than listed

## Testing

```bash
# Verify migration applied:
cd libs/backend/prisma-client
npx prisma migrate status

# Verify TypeScript types generated:
# In any TS file, try: import { GlobalNotification, PushToken } from '@prisma/client'
# Should resolve without errors
```
