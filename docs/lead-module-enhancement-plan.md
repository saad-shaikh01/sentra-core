# Lead Module Enhancement Plan

**Scope:** `apps/backend/core-service/src/modules/leads/` · `src/modules/clients/` · `src/modules/sales/` + `apps/frontend/sales-dashboard/`
**Date:** 2026-03-13
**Status:** Planning — Implementation Reference

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Lead Fields — Schema & DTO Changes](#2-lead-fields--schema--dto-changes)
3. [Notes & Audit Log Separation](#3-notes--audit-log-separation)
4. [Assignment Architecture — Lead (FrontSell) vs Client (Upsell + PM)](#4-assignment-architecture--lead-frontsell-vs-client-upsell--pm)
5. [Convert to Client — New OTP Flow](#5-convert-to-client--new-otp-flow)
6. [Portal Access Control & Email Trigger](#6-portal-access-control--email-trigger)
7. [First Sale Auto-Creates Client](#7-first-sale-auto-creates-client)
8. [Bulk Lead Import](#8-bulk-lead-import)
9. [Facebook & External Lead Integration](#9-facebook--external-lead-integration)
10. [Kanban & UI Updates](#10-kanban--ui-updates)
11. [Implementation Order & Estimates](#11-implementation-order--estimates)

---

## 1. Current State Audit

### What Exists (Working)

| Area | File | State |
|------|------|-------|
| Title field | `create-lead.dto.ts:6` | **Required** (`@IsString() @MinLength(2)`) |
| Source field | `create-lead.dto.ts:25` | Free-text string — no enum, no dropdown |
| LeadType field | Prisma schema, DTO, types | **Does not exist** |
| LeadStatus enum | `types.ts:26` | NEW, CONTACTED, PROPOSAL, FOLLOW_UP, CLOSED |
| Notes | `lead-detail-sheet.tsx:276` | Single `<Input>` — no rich text, no delete |
| Audit log | `lead-detail-sheet.tsx:250` | Mixed with notes in one timeline list |
| Actor names in activity | `leads.service.ts:190` | `userId` stored but **name not returned to UI** |
| Assignment | `assign-lead.dto.ts:3` | Single `assignedToId` — one user only |
| Multi-role assignment | — | **Does not exist** |
| Assignment timestamps | `LeadActivity.ASSIGNMENT_CHANGE` | Timestamp saved in activity log but not shown on detail sheet |
| Convert to Client | `convert-lead-modal.tsx` | Requires email + **password + companyName** — all mandatory |
| Convert status | `leads.service.ts:458` | Sets status to `CLOSED` (not a separate WON state) |
| Bulk import | — | **Does not exist** |
| Facebook integration | — | **Does not exist** |

### Exact Issues

1. `title` is `@IsString() @MinLength(2)` — will reject blank or missing title.
2. `source` is a plain `<Input placeholder="e.g. Website, Referral">` — no validation, no consistent values.
3. No `LeadType` field anywhere in schema, DTO, or UI.
4. Notes and system audit entries (status changes, assignments) render in the same list — impossible to distinguish.
5. `LeadActivity` rows in `getActivities()` return `userId` but the UI never fetches the user name from that ID; it shows raw activity type text.
6. `AssignLeadDto` only accepts one user. There is no way to assign a Front Sell agent AND an Upsell agent to the same lead.
7. `ConvertLeadDto` requires `password` and `companyName` — wrong for individual (non-company) clients.
8. After conversion, lead status is set to generic `CLOSED` — same status as a lost lead.

---

## 2. Lead Fields — Schema & DTO Changes

### 2.1 Overview of All Field Changes

| Field | Current | Change | Location |
|-------|---------|--------|---------|
| `title` | Required string | Make **optional** | Schema, DTO, UI |
| `leadType` | Not present | Add new enum field (optional) | Schema, types, DTO, UI |
| `source` | Free text string | Change to **enum** (controlled list) | Schema, types, DTO, UI |
| `status` | Enum (5 values) | Add `CLOSED_WON` and `CLOSED_LOST` | Schema, types, DTO, Kanban |
| `date` | Uses `createdAt` | Add optional `leadDate DateTime?` field | Schema, DTO, UI |

---

### 2.2 TICKET: LM-001 — Make Title Optional + Add LeadType, Source Enum, LeadDate

#### Issue
- `title` is hard required — blocks capture of leads without a meaningful title.
- `source` accepts any string — produces inconsistent values like "ppc", "PPC", "Pay Per Click".
- No `leadType` classification field.
- No explicit `leadDate` field for back-dating a lead.

#### Expected Output
- `title` is optional; backend auto-generates one if omitted: `"Lead – {name ?? email ?? 'Unknown'} – {source}"`.
- `source` is a controlled enum dropdown: `PPC | SMM | COLD_REFERRAL`.
- `leadType` is a new optional enum dropdown: `CHAT | SIGNUP | SOCIAL | REFERRAL | INBOUND`.
- `leadDate` is an optional date field; defaults to `createdAt` if not provided.

#### Backend Steps

**Step 1 — Update `libs/shared/types/src/lib/types.ts`**

Add two new enums after `LeadStatus`:

```typescript
export enum LeadType {
  CHAT     = 'CHAT',
  SIGNUP   = 'SIGNUP',
  SOCIAL   = 'SOCIAL',
  REFERRAL = 'REFERRAL',
  INBOUND  = 'INBOUND',
}

export enum LeadSource {
  PPC           = 'PPC',
  SMM           = 'SMM',
  COLD_REFERRAL = 'COLD_REFERRAL',
}
```

**Step 2 — Update Prisma schema**
File: `libs/backend/prisma-client/prisma/schema.prisma`

In the `Lead` model, change:
```prisma
// BEFORE
title   String
source  String?

// AFTER
title    String?           // now optional
leadType LeadType?         // new field
source   LeadSource?       // now enum type
leadDate DateTime?         // new explicit date field
```

Add the enums to the schema:
```prisma
enum LeadType {
  CHAT
  SIGNUP
  SOCIAL
  REFERRAL
  INBOUND
}

enum LeadSource {
  PPC
  SMM
  COLD_REFERRAL
}
```

Run: `npx prisma migrate dev --name add_lead_type_source_enum_and_lead_date`

**Step 3 — Update `create-lead.dto.ts`**
File: `apps/backend/core-service/src/modules/leads/dto/create-lead.dto.ts`

```typescript
import { IsString, IsOptional, IsUUID, IsEmail, IsUrl, MaxLength, IsEnum, IsDateString } from 'class-validator';
import { LeadType, LeadSource } from '@sentra-core/types';

export class CreateLeadDto {
  @IsOptional()           // ← was required
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(LeadType)
  leadType?: LeadType;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsDateString()
  leadDate?: string;

  // ... rest unchanged
}
```

**Step 4 — Update `update-lead.dto.ts`** — add the same optional `leadType`, `source`, `leadDate` fields.

**Step 5 — Update `capture-lead.dto.ts`** — `title` becomes optional; add `leadType` and `source` as optional enums.

**Step 6 — Update `leads.service.ts`**

In `create()` method, add auto-title logic:
```typescript
const titleValue = dto.title?.trim()
  || [dto.name, dto.email, dto.source].filter(Boolean).join(' – ')
  || 'New Lead';

const lead = await this.prisma.lead.create({
  data: {
    title: titleValue,
    leadType: dto.leadType,
    source: dto.source,
    leadDate: dto.leadDate ? new Date(dto.leadDate) : new Date(),
    // ... rest unchanged
  }
});
```

In `update()`, add `leadType`, `source`, `leadDate` to the update data object.

In `mapToILead()`, add the new fields to the returned `ILead` object.

**Step 7 — Update `ILead` interface**
File: `libs/shared/types/src/lib/types.ts`

```typescript
export interface ILead {
  // ... existing fields ...
  leadType?: LeadType;       // add
  source?: LeadSource;       // change type from string to LeadSource
  leadDate?: Date;           // add
}
```

**Step 8 — Update `query-leads.dto.ts`** — add `leadType?: LeadType` and `source?: LeadSource` as optional enum filters.

**Step 9 — Update `leads.service.ts → findAll()`** — add `leadType` and `source` to the `where` clause (already has `source` as string, change to enum).

#### Frontend Steps

**Step 1 — Update `lead-form-modal.tsx`**

Add to `FormValues` interface:
```typescript
interface FormValues {
  title: string;       // keep, but no longer required in validation
  leadType: string;
  source: string;
  leadDate: string;
  // ... rest unchanged
}
```

Remove `required: 'Required'` from title `register()` call.

Add three new `<Select>` fields below the title input:

```tsx
{/* Lead Type */}
<div className="space-y-1.5">
  <Label>Lead Type</Label>
  <Select value={leadType} onValueChange={(v) => setValue('leadType', v)}>
    <SelectTrigger>
      <SelectValue placeholder="Select type" />
    </SelectTrigger>
    <SelectContent>
      {['CHAT', 'SIGNUP', 'SOCIAL', 'REFERRAL', 'INBOUND'].map((t) => (
        <SelectItem key={t} value={t}>{t}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>

{/* Source */}
<div className="space-y-1.5">
  <Label>Source</Label>
  <Select value={source} onValueChange={(v) => setValue('source', v)}>
    <SelectTrigger>
      <SelectValue placeholder="Select source" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="PPC">PPC</SelectItem>
      <SelectItem value="SMM">SMM</SelectItem>
      <SelectItem value="COLD_REFERRAL">Cold Referral</SelectItem>
    </SelectContent>
  </Select>
</div>

{/* Lead Date */}
<div className="space-y-1.5">
  <Label>Lead Date</Label>
  <Input type="date" {...register('leadDate')} max={today} />
</div>
```

Replace the old free-text Source `<Input>` with the new `<Select>`.

**Step 2 — Update `lead-detail-sheet.tsx`**

Add `leadType` and `leadDate` to the "Status & Source" info cards section:
```tsx
<div className="grid grid-cols-2 gap-3">
  <InfoCard label="Status"    value={<StatusBadge status={lead.status} />} />
  <InfoCard label="Source"    value={<span>{lead.source ?? '—'}</span>} />
  <InfoCard label="Lead Type" value={<span>{lead.leadType ?? '—'}</span>} />
  <InfoCard label="Lead Date" value={<span>{lead.leadDate ? formatDate(lead.leadDate) : formatDate(lead.createdAt)}</span>} />
</div>
```

**Step 3 — Update filter bar on `leads/page.tsx`**

Replace free-text source filter with a `<Select>` dropdown using `LeadSource` values.
Add a `leadType` filter dropdown using `LeadType` values.

**Testing Requirements**
- Create lead with no title — confirm auto-title is generated.
- Create lead with `source: "PPC"` — confirm saved correctly; `source: "random"` should return `400`.
- Lead form shows three new dropdowns; all are optional (form submits without them).
- Leads list can be filtered by `leadType=CHAT` and `source=SMM`.

**Estimate:** M (4–5 h)
**Migration required:** Yes.

---

### 2.3 TICKET: LM-002 — Add CLOSED_WON / CLOSED_LOST to LeadStatus

#### Issue
`CLOSED` is ambiguous — a converted lead and a lost lead both show the same status. Analytics cannot distinguish wins from losses.

#### Expected Output
Two separate terminal states: `CLOSED_WON` (lead became a client) and `CLOSED_LOST` (lead was dropped, with an optional reason).

#### Backend Steps

**Step 1 — Update `LeadStatus` enum in `types.ts`**
```typescript
export enum LeadStatus {
  NEW        = 'NEW',
  CONTACTED  = 'CONTACTED',
  PROPOSAL   = 'PROPOSAL',
  FOLLOW_UP  = 'FOLLOW_UP',
  CLOSED_WON = 'CLOSED_WON',   // replaces CLOSED
  CLOSED_LOST= 'CLOSED_LOST',  // new
}
```

**Step 2 — Update `LEAD_STATUS_TRANSITIONS` in `types.ts`**
```typescript
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]:         [LeadStatus.CONTACTED, LeadStatus.FOLLOW_UP, LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST],
  [LeadStatus.CONTACTED]:   [LeadStatus.PROPOSAL,  LeadStatus.FOLLOW_UP, LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST],
  [LeadStatus.PROPOSAL]:    [LeadStatus.FOLLOW_UP, LeadStatus.CONTACTED, LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST],
  [LeadStatus.FOLLOW_UP]:   [LeadStatus.CONTACTED, LeadStatus.PROPOSAL,  LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST],
  [LeadStatus.CLOSED_WON]:  [],
  [LeadStatus.CLOSED_LOST]: [],
};
```

**Step 3 — Add `lostReason` to `Lead` schema and `ChangeStatusDto`**

Prisma:
```prisma
lostReason String?  // Required when status = CLOSED_LOST
```

DTO:
```typescript
@ValidateIf((o) => o.status === LeadStatus.CLOSED_LOST)
@IsString()
@MaxLength(500)
lostReason?: string;
```

**Step 4 — Update `changeStatus()` in `leads.service.ts`**
- When new status is `CLOSED_LOST`, require `lostReason` (throw `BadRequestException` if missing).
- Save `lostReason` on the lead update.

**Step 5 — Update `convert()` in `leads.service.ts`**
- Change `status: LeadStatus.CLOSED` to `status: LeadStatus.CLOSED_WON`.

**Step 6 — Data migration**
Add a migration script:
```sql
UPDATE "Lead" SET status = 'CLOSED_WON' WHERE status = 'CLOSED' AND "convertedClientId" IS NOT NULL;
UPDATE "Lead" SET status = 'CLOSED_LOST' WHERE status = 'CLOSED' AND "convertedClientId" IS NULL;
```

**Step 7 — Update `lead-detail-sheet.tsx`**
- `canConvert` check: change `lead.status !== LeadStatus.CLOSED` to `lead.status !== LeadStatus.CLOSED_WON && lead.status !== LeadStatus.CLOSED_LOST`.
- The `CLOSED_LOST` transition button should open a small dialog asking for a `lostReason`.

**Step 8 — Update Kanban** — replace `CLOSED` column with `CLOSED_WON` and `CLOSED_LOST` columns (or merge into one "Closed" section with sub-grouping).

**Testing Requirements**
- Change lead to `CLOSED_LOST` without reason — expect `400`.
- Convert lead — confirm status becomes `CLOSED_WON`.
- Analytics conversion rate uses only `CLOSED_WON`.

**Estimate:** M (3–4 h) + migration script

---

## 3. Notes & Audit Log Separation

### Current Problem

`lead-detail-sheet.tsx:250` renders a single "Activity" list that mixes:
- User-written notes (`LeadActivityType.NOTE`)
- System events (STATUS_CHANGE, ASSIGNMENT_CHANGE, CONVERSION, CREATED)

A note and a status change look identical. Users cannot find their notes quickly. There is no way to delete a note. Actor names are not shown — only the raw activity type label.

`leads.service.ts:532` includes `user: true` in `getActivities()` but the `ILeadActivity` interface only exposes `userId` — the user's name is dropped before it reaches the frontend.

### TICKET: LM-003 — Separate Notes and Audit Log + Show Actor Names

#### Expected Output
- Two distinct sections in the lead detail sheet: **Notes** and **Activity Log**.
- Notes section: rich text input (or at minimum multi-line textarea), individual note cards, delete button for own notes (within 24h).
- Activity Log section: read-only timeline of system events, showing actor's full name, avatar, action description, and timestamp.
- Activity Log entries are human-readable: e.g., `"Saif moved this lead from PROPOSAL → FOLLOW_UP"`, `"Alice assigned to Bob"`.

#### Backend Steps

**Step 1 — Extend `ILeadActivity` in `types.ts`**
```typescript
export interface ILeadActivity {
  id: string;
  type: LeadActivityType;
  data: Record<string, unknown>;
  leadId: string;
  userId: string;
  user?: { id: string; name: string; avatarUrl?: string };  // ADD
  createdAt: Date;
}
```

**Step 2 — Update `getActivities()` in `leads.service.ts`**

The `include: { user: true }` already exists. Update the map to pass through the user object:
```typescript
return activities.map((a) => ({
  id: a.id,
  type: a.type as LeadActivityType,
  data: a.data as Record<string, unknown>,
  leadId: a.leadId,
  userId: a.userId,
  user: a.user
    ? { id: a.user.id, name: a.user.name, avatarUrl: a.user.avatarUrl ?? undefined }
    : undefined,
  createdAt: a.createdAt,
}));
```

Do the same in `findOne()` where activities are embedded.

**Step 3 — Add `GET /leads/:id/notes` endpoint** (optional — can reuse activities filtered by type)
Or simply: the existing `GET /leads/:id/activities` endpoint already returns all. The split happens client-side by filtering on `type`.

**Step 4 — Add `DELETE /leads/:id/notes/:activityId`**
- Only the note author can delete their own note.
- Only notes (`type = NOTE`) can be deleted — system events are immutable.
- Add this endpoint to `leads.controller.ts`.
- Service method: verify `activity.userId === requestingUserId`, then `prisma.leadActivity.delete({ where: { id: activityId } })`.

**Step 5 — Add `PATCH /leads/:id/notes/:activityId`** — edit note content (author only, within 24h).

#### Frontend Steps

**Step 1 — Update `useLeadActivities` hook to return typed split**
```typescript
// In use-leads.ts, add a derived helper:
export function useLeadNotes(id: string) {
  const q = useLeadActivities(id);
  return { ...q, data: q.data?.filter((a) => a.type === LeadActivityType.NOTE) };
}

export function useLeadAuditLog(id: string) {
  const q = useLeadActivities(id);
  return { ...q, data: q.data?.filter((a) => a.type !== LeadActivityType.NOTE) };
}
```

**Step 2 — Add tab switcher for Notes | Activity in lead-detail-sheet.tsx**

Current tabs: `details | emails`
New tabs: `details | notes | activity | emails`

**Step 3 — Notes Tab UI (`NotesList` component)**

```
┌─────────────────────────────────────────┐
│  [Add Note textarea]              [Save] │
├─────────────────────────────────────────┤
│  ● [Avatar] Saif — 2 hours ago     [×]  │
│    "Called client, they want more info"  │
├─────────────────────────────────────────┤
│  ● [Avatar] Alice — Yesterday      [×]  │
│    "Sent proposal via email"             │
└─────────────────────────────────────────┘
```

- Each note card has: avatar, author name, relative time, note content.
- Delete [×] button visible only if `note.userId === currentUser.id`.
- On delete: call `DELETE /leads/:id/notes/:activityId` → optimistic removal from list.
- Input: change from `<Input>` (single line) to `<Textarea rows={3}>`.

**Step 4 — Activity Log Tab UI (`AuditTimeline` component)**

Each entry rendered as a human-readable sentence using a `formatActivity(activity)` helper:

```typescript
function formatActivity(a: ILeadActivity): string {
  const { type, data, user } = a;
  const actor = user?.name ?? 'Someone';
  switch (type) {
    case 'STATUS_CHANGE':
      return `${actor} moved lead from ${data.from} → ${data.to}`;
    case 'ASSIGNMENT_CHANGE':
      return `${actor} reassigned lead to ${data.toName ?? data.to}`;
    case 'CONVERSION':
      return `${actor} converted this lead to a client`;
    case 'CREATED':
      return `${actor} created this lead`;
    default:
      return type.toLowerCase().replace(/_/g, ' ');
  }
}
```

Each entry shows: small color-coded dot + sentence + timestamp.

**Step 5 — Add delete/edit hooks in `use-leads.ts`**
```typescript
export function useDeleteLeadNote() { /* DELETE /leads/:leadId/notes/:noteId */ }
export function useEditLeadNote()   { /* PATCH  /leads/:leadId/notes/:noteId */ }
```

**Testing Requirements**
- Add a note — appears in Notes tab only, not in Activity tab.
- Change status — appears in Activity tab only, not in Notes tab.
- Activity tab shows "Saif moved lead from PROPOSAL → FOLLOW_UP" (actor name visible).
- Delete own note — disappears immediately (optimistic update).
- Cannot delete someone else's note — delete button not rendered.

**Estimate:** M (5–6 h)

---

## 4. Assignment Architecture — Lead (FrontSell History) vs Client (Upsell + PM)

### Design Decision

```
LEAD STAGE                         CLIENT STAGE (post-conversion)
──────────────────────────────     ──────────────────────────────
assignedToId = CURRENT agent       upsellAgentId      = CURRENT upsell
                                   projectManagerId   = CURRENT PM
LeadActivity log = full history    ClientActivity log = full history
(Mike → Alex → Alex still active)  (all past upsell/PM changes)
```

**Key principles:**
1. `Lead.assignedToId` always holds the **currently active** FrontSell agent.
2. Every reassignment is logged in `LeadActivity` — full history visible in the activity tab.
3. Client assignments (Upsell + PM) are **fully optional** — at conversion AND at any later point.
4. Client also tracks history via a new `ClientActivity` log (same pattern as leads).
5. Both lead and client show **"Current: Alex (assigned 2 days ago)"** — clear active state.

---

### TICKET: LM-004a — Lead FrontSell Assignment with History Display

#### What Changes

The existing `assignedToId` + `LeadActivity.ASSIGNMENT_CHANGE` already handle the mechanics correctly. Mike was assigned → activity logged. Alex was reassigned → activity logged. `lead.assignedToId = Alex` (current). **No schema change needed.**

Improvements are purely in the backend response and UI display.

#### Backend Steps

**Step 1 — Filter users by role in `GET /users/members`**

Add optional `?role=` query param to the members/users endpoint:
```typescript
// users.service.ts or teams.service.ts:
if (query.role) {
  where.role = query.role;
}
```

This lets the frontend fetch only `FRONTSELL_AGENT` users for the lead assignment dropdown.

**Step 2 — Include assignee details in `findOne()` response**

Already done — `leads.service.ts:170` includes `assignedTo: true`. Ensure the `mapToILead()` passes through:
```typescript
assignedTo: lead.assignedTo
  ? { id: lead.assignedTo.id, name: lead.assignedTo.name, avatarUrl: lead.assignedTo.avatarUrl ?? undefined }
  : undefined,
```

**Step 3 — `AssignLeadDto` stays unchanged** — `{ assignedToId: string }` is correct.

**Step 4 — Activity log already timestamps every assignment** — `LeadActivity.ASSIGNMENT_CHANGE` stores `{ from: prevUserId, to: newUserId }` with `createdAt`. No change needed.

#### Frontend Steps

**Step 1 — Rename label in `lead-detail-sheet.tsx:215`**
```tsx
// BEFORE
<h3 ...>Assign To</h3>
// AFTER
<h3 ...>Front Sell Agent</h3>
```

**Step 2 — Filter members dropdown to `FRONTSELL_AGENT` only**
```typescript
// use-organization.ts — add role param:
export function useMembers(role?: UserRole) {
  return useQuery({
    queryKey: ['members', role],
    queryFn: () => api.getMembers({ role }),
  });
}

// lead-detail-sheet.tsx:
const { data: frontSellAgents } = useMembers(UserRole.FRONTSELL_AGENT);
```

**Step 3 — Show "Current agent + assigned time" card above the dropdown**

Pull `lead.assignedTo` (current) and the latest `ASSIGNMENT_CHANGE` activity for the timestamp:

```tsx
{/* Current assignee card */}
{lead.assignedTo && (
  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/10 mb-2">
    <Avatar name={lead.assignedTo.name} avatarUrl={lead.assignedTo.avatarUrl} size="sm" />
    <div>
      <p className="text-sm font-medium">{lead.assignedTo.name}</p>
      <p className="text-[10px] text-muted-foreground">
        Active · assigned {timeAgo(lastAssignmentActivity?.createdAt ?? lead.createdAt)}
      </p>
    </div>
  </div>
)}

{/* Reassign dropdown — ADMIN/MANAGER only */}
{canAssign && (
  <Select value={lead.assignedToId ?? ''} onValueChange={(v) => assignLead.mutate({ id: lead.id, assignedToId: v })}>
    <SelectTrigger><SelectValue placeholder="Change agent" /></SelectTrigger>
    <SelectContent>
      {frontSellAgents?.map((m) => (
        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
```

**Step 4 — Show assignment history in Activity Log tab**

The `ASSIGNMENT_CHANGE` activities are already in the log. The `formatActivity()` helper (from LM-003) renders:

```
[Avatar] Saif  ·  3 days ago
"Reassigned Front Sell Agent from Mike to Alex"

[Avatar] Alice  ·  1 week ago
"Assigned Front Sell Agent: Mike"
```

To show "from" name (not just userId), update the activity `data` stored in `leads.service.ts → assign()`:

```typescript
// Fetch previous and new assignee names at time of assignment
const prevAssignee = lead.assignedToId
  ? await this.prisma.user.findUnique({ where: { id: lead.assignedToId }, select: { name: true } })
  : null;

const newAssignee = await this.prisma.user.findUnique({
  where: { id: dto.assignedToId },
  select: { name: true },
});

await this.prisma.leadActivity.create({
  data: {
    type: LeadActivityType.ASSIGNMENT_CHANGE,
    data: {
      from: lead.assignedToId ?? null,
      fromName: prevAssignee?.name ?? null,
      to: dto.assignedToId,
      toName: newAssignee?.name ?? null,
    },
    leadId: id,
    userId,
  },
});
```

**Testing Requirements**
- Assign Mike → activity log shows "Assigned Front Sell Agent: Mike".
- Reassign to Alex → log shows "Reassigned Front Sell Agent from Mike to Alex". Current card shows Alex.
- Reassign again to Carol → log shows 3 entries, current card shows Carol.
- Dropdown only shows FRONTSELL_AGENT role users.

**Estimate:** S (2–3 h) — no migration, mostly UI + activity data improvement.

---

### TICKET: LM-004b — Client-Level Assignment (Upsell + PM, Fully Optional, With History)

#### Problem

After a lead converts to a client, there is no way to assign an Upsell agent or Project Manager. The `Client` model has no assignment fields. Assignments should be:
- **Fully optional** — at conversion AND at any later point.
- **Changeable** — current active assignee shown; history tracked.
- **Role-validated** — only `UPSELL_AGENT` users can be set as upsell; only `PROJECT_MANAGER` users as PM.

#### Schema Design

Same pattern as leads:
- Two current-state FK fields on `Client` for fast querying.
- A `ClientActivity` log for full history.

#### Backend Steps

**Step 1 — Add assignment fields + `ClientActivity` to Prisma schema**
File: `libs/backend/prisma-client/prisma/schema.prisma`

```prisma
model Client {
  // ...existing fields...

  upsellAgentId    String?
  upsellAgent      User?   @relation("ClientUpsellAgent",    fields: [upsellAgentId],    references: [id])

  projectManagerId String?
  projectManager   User?   @relation("ClientProjectManager", fields: [projectManagerId], references: [id])

  activities ClientActivity[]

  // ...existing relations...
}

model ClientActivity {
  id     String              @id @default(uuid())
  type   ClientActivityType
  data   Json

  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  userId String
  user   User   @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())

  @@index([clientId, createdAt])
}

enum ClientActivityType {
  UPSELL_ASSIGNED
  PM_ASSIGNED
  NOTE
  CREATED
}
```

Add reverse relations to `User`:
```prisma
model User {
  // ...existing...
  upsellClients    Client[]         @relation("ClientUpsellAgent")
  managedClients   Client[]         @relation("ClientProjectManager")
  clientActivities ClientActivity[]
}
```

Migration: `npx prisma migrate dev --name add_client_assignments_and_activity`

**Step 2 — Add `AssignClientDto`**
File: `apps/backend/core-service/src/modules/clients/dto/assign-client.dto.ts`

```typescript
import { IsOptional, IsUUID } from 'class-validator';

export class AssignClientDto {
  @IsOptional()
  @IsUUID()
  upsellAgentId?: string | null;      // null explicitly unassigns

  @IsOptional()
  @IsUUID()
  projectManagerId?: string | null;   // null explicitly unassigns
}
```

**Step 3 — Add `PATCH /clients/:id/assign` endpoint**
File: `apps/backend/core-service/src/modules/clients/clients.controller.ts`

```typescript
@Patch(':id/assign')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
assign(
  @Param('id') id: string,
  @CurrentUser() user: JwtPayload,
  @Body() dto: AssignClientDto,
): Promise<IClient> {
  return this.clientsService.assign(id, user.orgId, user.sub, dto);
}
```

**Step 4 — Add `assign()` in `clients.service.ts`**

```typescript
async assign(id: string, orgId: string, actorId: string, dto: AssignClientDto): Promise<IClient> {
  const client = await this.prisma.client.findFirst({ where: { id, organizationId: orgId } });
  if (!client) throw new NotFoundException('Client not found');

  // Validate upsell agent role
  if (dto.upsellAgentId) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.upsellAgentId } });
    if (!user || user.organizationId !== orgId)
      throw new BadRequestException('Upsell agent not found in this organization');
    if (user.role !== UserRole.UPSELL_AGENT)
      throw new BadRequestException('User must have UPSELL_AGENT role');
  }

  // Validate PM role
  if (dto.projectManagerId) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.projectManagerId } });
    if (!user || user.organizationId !== orgId)
      throw new BadRequestException('Project manager not found in this organization');
    if (user.role !== UserRole.PROJECT_MANAGER)
      throw new BadRequestException('User must have PROJECT_MANAGER role');
  }

  // Fetch names for activity log
  const [prevUpsell, prevPM, newUpsell, newPM] = await Promise.all([
    client.upsellAgentId    ? this.prisma.user.findUnique({ where: { id: client.upsellAgentId },    select: { name: true } }) : null,
    client.projectManagerId ? this.prisma.user.findUnique({ where: { id: client.projectManagerId }, select: { name: true } }) : null,
    dto.upsellAgentId       ? this.prisma.user.findUnique({ where: { id: dto.upsellAgentId },       select: { name: true } }) : null,
    dto.projectManagerId    ? this.prisma.user.findUnique({ where: { id: dto.projectManagerId },    select: { name: true } }) : null,
  ]);

  const activityLogs: any[] = [];

  if (dto.upsellAgentId !== undefined) {
    activityLogs.push({
      type: ClientActivityType.UPSELL_ASSIGNED,
      data: { from: client.upsellAgentId, fromName: prevUpsell?.name ?? null, to: dto.upsellAgentId, toName: newUpsell?.name ?? null },
      clientId: id,
      userId: actorId,
    });
  }

  if (dto.projectManagerId !== undefined) {
    activityLogs.push({
      type: ClientActivityType.PM_ASSIGNED,
      data: { from: client.projectManagerId, fromName: prevPM?.name ?? null, to: dto.projectManagerId, toName: newPM?.name ?? null },
      clientId: id,
      userId: actorId,
    });
  }

  await this.prisma.$transaction([
    this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.upsellAgentId    !== undefined && { upsellAgentId:    dto.upsellAgentId }),
        ...(dto.projectManagerId !== undefined && { projectManagerId: dto.projectManagerId }),
      },
    }),
    ...activityLogs.map((log) => this.prisma.clientActivity.create({ data: log })),
  ]);

  await this.cache.delByPrefix(`clients:${orgId}:`);
  return this.findOne(id, orgId);
}
```

**Step 5 — Update `findOne()` to include assignees + recent activity**

```typescript
include: {
  sales: true,
  upsellAgent:    { select: { id: true, name: true, avatarUrl: true } },
  projectManager: { select: { id: true, name: true, avatarUrl: true } },
  activities: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
}
```

**Step 6 — Update `IClient` interface in `types.ts`**

```typescript
export interface IClient {
  // ...existing...
  upsellAgentId?:    string;
  projectManagerId?: string;
  upsellAgent?:      { id: string; name: string; avatarUrl?: string };
  projectManager?:   { id: string; name: string; avatarUrl?: string };
}

export enum ClientActivityType {
  UPSELL_ASSIGNED = 'UPSELL_ASSIGNED',
  PM_ASSIGNED     = 'PM_ASSIGNED',
  NOTE            = 'NOTE',
  CREATED         = 'CREATED',
}

export interface IClientActivity {
  id:        string;
  type:      ClientActivityType;
  data:      Record<string, unknown>;
  clientId:  string;
  userId:    string;
  user?:     { id: string; name: string; avatarUrl?: string };
  createdAt: Date;
}
```

**Step 7 — Update `leads.service.ts → convert()`**

Add optional assignment fields to `ConvertLeadDto`:
```typescript
// These are OPTIONAL — no @IsNotEmpty(), no required validation
@IsOptional() @IsUUID()
upsellAgentId?: string;

@IsOptional() @IsUUID()
projectManagerId?: string;
```

In the `$transaction` after client creation:
```typescript
// Only update if fields were explicitly provided
if (dto.upsellAgentId || dto.projectManagerId) {
  await tx.client.update({
    where: { id: client.id },
    data: {
      ...(dto.upsellAgentId    && { upsellAgentId:    dto.upsellAgentId }),
      ...(dto.projectManagerId && { projectManagerId: dto.projectManagerId }),
    },
  });
}
```

**Step 8 — Data visibility scoping in `clients.service.ts → findAll()`**

```typescript
// UPSELL_AGENT: only sees their own clients
if (role === UserRole.UPSELL_AGENT) {
  where.upsellAgentId = userId;
}
// PROJECT_MANAGER: only sees their managed clients
else if (role === UserRole.PROJECT_MANAGER) {
  where.projectManagerId = userId;
}
// SALES_MANAGER: all clients via team (existing logic)
// ADMIN/OWNER: all (existing logic)
```

#### Frontend Steps

**Step 1 — Update `convert-lead-modal.tsx` — add optional team assignment section**

```
┌─────────────────────────────────────────────────────┐
│  Convert to Client                                  │
│                                                     │
│  CLIENT INFO                                        │
│  Email *         [pre-filled]                       │
│  Contact Name    [pre-filled]                       │
│  Company         [optional]                         │
│  Phone           [pre-filled]                       │
│                                                     │
│  ──────────── TEAM ASSIGNMENT (optional) ────────── │
│  Upsell Agent    [ Select upsell agent ▼ ]          │
│  Project Manager [ Select project manager ▼ ]       │
│                                                     │
│  ℹ️ You can also assign these later from the        │
│     client profile.                                 │
│                                                     │
│  [Cancel]                [Convert & Send OTP →]     │
└─────────────────────────────────────────────────────┘
```

Both dropdowns are optional — no `required` validation. Pass `upsellAgentId` and `projectManagerId` to the API only if selected.

**Step 2 — Add assignment panel to client detail sheet**

```
┌────────────────────────────────────────┐
│  TEAM ASSIGNMENTS                      │
├───────────────┬────────────────────────┤
│  Upsell       │  [Ava] Bob Smith       │
│  Agent        │  Active · 3 days ago   │
│               │  [Change ▼]            │
├───────────────┼────────────────────────┤
│  Project      │  — Unassigned —        │
│  Manager      │  [Assign ▼]            │
└───────────────┴────────────────────────┘
```

Same pattern as the lead sheet — current active shown with avatar + "assigned X ago" timestamp, dropdown for ADMIN/MANAGER to change.

**Step 3 — Client Activity tab in detail sheet**

Add an "Activity" tab to the client detail sheet showing the `ClientActivity` log with human-readable messages:

```typescript
function formatClientActivity(a: IClientActivity): string {
  const actor = a.user?.name ?? 'Someone';
  switch (a.type) {
    case 'UPSELL_ASSIGNED':
      return a.data.from
        ? `${actor} changed Upsell Agent from ${a.data.fromName} to ${a.data.toName}`
        : `${actor} assigned Upsell Agent: ${a.data.toName}`;
    case 'PM_ASSIGNED':
      return a.data.from
        ? `${actor} changed Project Manager from ${a.data.fromName} to ${a.data.toName}`
        : `${actor} assigned Project Manager: ${a.data.toName}`;
    case 'CREATED':
      return `${actor} created this client`;
    default:
      return a.type;
  }
}
```

**Step 4 — Add hooks in `use-clients.ts`**

```typescript
export function useAssignClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; upsellAgentId?: string | null; projectManagerId?: string | null }) =>
      api.assignClient(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientsKeys.detail(id) });
      toast.success('Assignments updated');
    },
    onError: (e: Error) => toast.error('Failed to update assignments', e.message),
  });
}
```

**Step 5 — Show assignees in client list table**

Add columns to the clients DataTable:
- "Upsell" — avatar + name (or "—")
- "PM" — avatar + name (or "—")

#### Testing Requirements

**Conversion:**
- Convert lead with no team assignment → client created, both slots empty.
- Convert with Upsell = Alice → client has `upsellAgentId = Alice.id`, activity log shows "Assigned Upsell Agent: Alice".
- Both dropdowns remain optional — form submits without them.

**Client-level reassignment:**
- Assign Upsell to Bob from client detail sheet → log shows "Assigned Upsell Agent: Bob".
- Reassign Upsell to Carol → log shows "Changed Upsell Agent from Bob to Carol". Active card shows Carol.
- Assign PM to Dave → log shows "Assigned Project Manager: Dave".
- Try assigning a FRONTSELL_AGENT as upsell → backend returns `400 Bad Request`.

**Visibility:**
- Upsell agent Alice logs in → only sees clients where `upsellAgentId = Alice.id`.
- PM Dave logs in → only sees clients where `projectManagerId = Dave.id`.
- Unassign PM → slot shows "Unassigned", no scoping applies for that role.

**Estimate:** M (5–6 h)
**Migration required:** Yes — `upsellAgentId`, `projectManagerId` on `Client` + new `ClientActivity` table.

---

## 5. Convert to Client — New OTP Flow

### Current Problem

`convert-lead-modal.tsx` requires the agent to:
1. Enter the lead's **email** (may already be on the lead).
2. Invent a **password** for the client.
3. Enter a **company name** — mandatory and irrelevant for individuals (authors, freelancers).

This is wrong for three reasons:
- Agents should not set passwords for clients.
- Many clients are individuals, not companies.
- The flow skips the sales context entirely — no deal value, no product, no brief.

### Redesigned Flow

```
Agent clicks "Convert to Client"
        │
        ▼
Step 1 — Sales Brief Modal
  Agent fills: Deal Value, Product/Service, Notes (optional)
  Pre-filled: Client name, email from lead record
  No password field. No mandatory company name.
        │
        ▼
Step 2 — API call: POST /leads/:id/convert (new payload)
  Backend:
    1. Creates Client record (email required, companyName = name or email prefix, password = temp random)
    2. Creates Sale record with the brief details
    3. Sends OTP email to client's email address
    4. Sets lead status = CLOSED_WON
        │
        ▼
Step 3 — Client receives email: "Verify your email to access your portal"
  Contains 6-digit OTP, valid 30 minutes.
        │
        ▼
Step 4 — Client enters OTP in Client Portal
  Portal calls: POST /auth/client/verify-otp { email, otp }
  On success: issues JWT, marks email as verified, forces password set on first login
```

### TICKET: LM-005 — Redesign Convert Flow with Sales Modal + OTP

#### Backend Steps

**Step 1 — Add OTP fields to `Client` model**

```prisma
model Client {
  // ... existing fields ...
  emailVerified    Boolean   @default(false)
  emailOtp         String?   // 6-digit code (hashed)
  emailOtpExpiry   DateTime?
  mustSetPassword  Boolean   @default(true)
}
```

**Step 2 — Rewrite `ConvertLeadDto`**

```typescript
export class ConvertLeadDto {
  // Client identity (pre-filled from lead, agent can override)
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;    // now OPTIONAL

  @IsOptional()
  @IsString()
  phone?: string;

  // Sales brief (new)
  @IsOptional()
  @IsDecimal()
  dealValue?: string;       // maps to Sale.totalAmount

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dealNotes?: string;

  @IsOptional()
  @IsEnum(PaymentPlanType)
  paymentPlan?: PaymentPlanType;  // default: ONE_TIME
}
```

> Note: No `password` field. Password is auto-generated and force-reset on first login.

**Step 3 — Rewrite `leads.service.ts → convert()`**

```typescript
async convert(id, orgId, userId, dto: ConvertLeadDto) {
  // ... validation guards ...

  const tempPassword = crypto.randomBytes(16).toString('hex');
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const otpExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  const result = await this.prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        companyName: dto.companyName || dto.contactName || dto.email.split('@')[0],
        contactName: dto.contactName,
        phone: dto.phone,
        brandId: lead.brandId,
        organizationId: orgId,
        emailVerified: false,
        emailOtp: hashedOtp,
        emailOtpExpiry: otpExpiry,
        mustSetPassword: true,
      },
    });

    // Create Sale if deal value provided
    if (dto.dealValue) {
      await tx.sale.create({
        data: {
          totalAmount: new Decimal(dto.dealValue),
          description: dto.dealNotes,
          paymentPlan: dto.paymentPlan ?? 'ONE_TIME',
          status: 'PENDING',
          clientId: client.id,
          brandId: lead.brandId,
          organizationId: orgId,
          currency: 'USD',
        },
      });
    }

    const updated = await tx.lead.update({
      where: { id },
      data: { convertedClientId: client.id, status: LeadStatus.CLOSED_WON },
    });

    await tx.leadActivity.create({
      data: {
        type: LeadActivityType.CONVERSION,
        data: { clientId: client.id, dealValue: dto.dealValue ?? null },
        leadId: id,
        userId,
      },
    });

    return { lead: updated, client };
  });

  // Send OTP email (outside transaction — non-blocking)
  await this.mailer.sendOtpEmail({
    to: dto.email,
    name: dto.contactName ?? dto.email,
    otp,
    brandId: lead.brandId,
  });

  await this.cache.delByPrefix(`leads:${orgId}:`);
  await this.cache.delByPrefix(`clients:${orgId}:`);

  return this.mapToILead(result.lead);
}
```

**Step 4 — Add `POST /auth/client/verify-otp` endpoint**

```typescript
// In auth controller:
@Post('client/verify-otp')
@Public()
async verifyClientOtp(@Body() dto: { email: string; otp: string }) {
  const client = await this.prisma.client.findFirst({
    where: { email: dto.email, emailVerified: false, emailOtpExpiry: { gte: new Date() } }
  });

  if (!client || !client.emailOtp) throw new BadRequestException('Invalid or expired OTP');

  const valid = await bcrypt.compare(dto.otp, client.emailOtp);
  if (!valid) throw new BadRequestException('Invalid OTP');

  await this.prisma.client.update({
    where: { id: client.id },
    data: { emailVerified: true, emailOtp: null, emailOtpExpiry: null },
  });

  return { message: 'Email verified. Please set your password.' };
}
```

**Step 5 — Add `POST /auth/client/set-password`** — for clients setting password after first OTP verification.

#### Frontend Steps

**Step 1 — Rewrite `convert-lead-modal.tsx`**

New layout — two-section form:

```
┌─────────────────────────────────────────┐
│  Convert Lead to Client                 │
│                                         │
│  CLIENT DETAILS                         │
│  Email *     [pre-filled from lead]     │
│  Contact Name [pre-filled from lead]    │
│  Company Name [optional]                │
│  Phone        [pre-filled from lead]    │
│                                         │
│  DEAL BRIEF (optional)                  │
│  Deal Value  [$________]                │
│  Payment Plan [ONE_TIME ▼]              │
│  Notes       [textarea]                 │
│                                         │
│  ℹ️ An OTP will be sent to their email  │
│     to verify their portal access.      │
│                                         │
│  [Cancel]          [Convert & Send OTP] │
└─────────────────────────────────────────┘
```

**Step 2 — Update `useConvertLead` hook** — no password in payload.

**Step 3 — On success**: show a confirmation toast:
`"Lead converted. OTP verification email sent to john@example.com"`

**Step 4 — Post-conversion prompt** (from the comprehensive plan LM-CONV-002):
After successful conversion, open a "Quick Action" prompt:
- "Sale created ✓" (if deal value was provided)
- "Go to Client →" button
- "Done" button

**Testing Requirements**
- Convert lead with only email — client created, OTP email sent, no password required from agent.
- `companyName` left blank — auto-set from `contactName` or email prefix.
- Client receives OTP email, enters code — `emailVerified` becomes true.
- Invalid OTP returns `400`.
- Expired OTP (> 30 min) returns `400`.
- Lead status after conversion is `CLOSED_WON`, not `CLOSED`.

**Estimate:** L (8–10 h)
**Migration required:** Yes (OTP fields on Client).

---

## 6. Portal Access Control & Email Trigger

### Design Decision

> **Separate "client exists" from "client has portal access".**

Right now, converting a lead immediately sends credentials. The user wants manual control:
- A client record can exist (for internal record-keeping) **without** portal access.
- Portal access is explicitly granted by an ADMIN or SALES_MANAGER — only at that point is the email sent.
- The email contains the **brand-specific portal link** (from `brand.domain`) + an OTP for first login.
- Revoking access locks the client out immediately.

```
Client created (no portal access yet)
        │
        ▼
Agent/Admin reviews → clicks "Grant Portal Access"
        │
        ▼
Backend: portalAccess = true, OTP generated & emailed
Email: "Welcome to [Brand Name] — verify your email: [OTP]"
Link:  https://{brand.portalDomain}/verify
        │
        ▼
Client verifies OTP → sets own password → portal access active
```

---

### TICKET: LM-011 — Manual Portal Access Grant/Revoke

#### Backend Steps

**Step 1 — Add portal access fields to `Client` schema**
File: `libs/backend/prisma-client/prisma/schema.prisma`

```prisma
model Client {
  // ...existing fields...

  portalAccess    Boolean   @default(false)  // manually toggled by admin
  portalGrantedAt DateTime?                  // when access was first granted
  portalGrantedBy String?                    // userId who granted it
  emailVerified   Boolean   @default(false)  // set true after OTP verified
  emailOtp        String?                    // hashed 6-digit OTP
  emailOtpExpiry  DateTime?                  // 30 min TTL
  mustSetPassword Boolean   @default(true)   // force password set on first login
}
```

Migration: `npx prisma migrate dev --name add_client_portal_access`

**Step 2 — Add `POST /clients/:id/grant-portal-access` endpoint**
File: `apps/backend/core-service/src/modules/clients/clients.controller.ts`

```typescript
@Post(':id/grant-portal-access')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
grantPortalAccess(
  @Param('id') id: string,
  @CurrentUser() actor: JwtPayload,
): Promise<{ message: string }> {
  return this.clientsService.grantPortalAccess(id, actor.orgId, actor.sub);
}

@Post(':id/revoke-portal-access')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER)
revokePortalAccess(
  @Param('id') id: string,
  @CurrentUser('orgId') orgId: string,
): Promise<{ message: string }> {
  return this.clientsService.revokePortalAccess(id, orgId);
}
```

**Step 3 — Add `grantPortalAccess()` in `clients.service.ts`**

```typescript
async grantPortalAccess(id: string, orgId: string, actorId: string): Promise<{ message: string }> {
  const client = await this.prisma.client.findFirst({
    where: { id, organizationId: orgId },
    include: { brand: true },
  });

  if (!client) throw new NotFoundException('Client not found');
  if (client.portalAccess) throw new BadRequestException('Client already has portal access');

  // Generate 6-digit OTP
  const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const otpExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await this.prisma.client.update({
    where: { id },
    data: {
      portalAccess:    true,
      portalGrantedAt: new Date(),
      portalGrantedBy: actorId,
      emailOtp:        hashedOtp,
      emailOtpExpiry:  otpExpiry,
      mustSetPassword: true,
    },
  });

  // Build brand portal URL
  const portalUrl = client.brand.portalDomain
    ? `https://${client.brand.portalDomain}`
    : `https://${client.brand.domain}/portal`;

  // Send welcome email with OTP
  await this.mailer.sendClientPortalInvite({
    to:         client.email,
    name:       client.contactName ?? client.companyName,
    brandName:  client.brand.name,
    portalUrl,
    otp,
  });

  await this.cache.delByPrefix(`clients:${orgId}:`);

  return { message: 'Portal access granted and invitation email sent' };
}

async revokePortalAccess(id: string, orgId: string): Promise<{ message: string }> {
  const client = await this.prisma.client.findFirst({ where: { id, organizationId: orgId } });
  if (!client) throw new NotFoundException('Client not found');

  await this.prisma.client.update({
    where: { id },
    data: {
      portalAccess:   false,
      emailOtp:       null,
      emailOtpExpiry: null,
    },
  });

  await this.cache.delByPrefix(`clients:${orgId}:`);
  return { message: 'Portal access revoked' };
}
```

**Step 4 — Add `POST /auth/client/verify-otp` endpoint**
File: `apps/backend/core-service/src/modules/auth/auth.controller.ts`

```typescript
@Post('client/verify-otp')
@Public()
async verifyClientOtp(@Body() dto: { email: string; otp: string }) {
  const client = await this.prisma.client.findFirst({
    where: {
      email: dto.email,
      portalAccess: true,
      emailVerified: false,
      emailOtpExpiry: { gte: new Date() },
    },
  });

  if (!client || !client.emailOtp) {
    throw new BadRequestException('Invalid or expired OTP');
  }

  const valid = await bcrypt.compare(dto.otp, client.emailOtp);
  if (!valid) throw new BadRequestException('Invalid OTP');

  await this.prisma.client.update({
    where: { id: client.id },
    data: { emailVerified: true, emailOtp: null, emailOtpExpiry: null },
  });

  return { message: 'Email verified. Please set your password to continue.' };
}
```

**Step 5 — Guard client portal login by `portalAccess` flag**

In the client auth service (wherever client JWT is issued):
```typescript
if (!client.portalAccess) {
  throw new ForbiddenException('Portal access has not been granted for this account');
}
```

**Step 6 — Update `IClient` interface in `types.ts`**

```typescript
export interface IClient {
  // ...existing...
  portalAccess:    boolean;
  portalGrantedAt?: Date;
  emailVerified:   boolean;
  mustSetPassword: boolean;
}
```

#### Frontend Steps

**Step 1 — "Portal Access" toggle in client detail sheet**

```
┌────────────────────────────────────────────────────┐
│  PORTAL ACCESS                                     │
├────────────────────────────────────────────────────┤
│  ○ No Access          ● Access Granted             │
│  (greyed out)         (active — email sent)         │
│                                                    │
│  [Grant Portal Access]  or  [Revoke Access]        │
│                                                    │
│  Email Verified: ✓ Yes  /  ✗ Not yet               │
│  Granted by: Saif · 3 days ago                     │
└────────────────────────────────────────────────────┘
```

- ADMIN/SALES_MANAGER see the Grant/Revoke buttons.
- "Grant Portal Access" button: opens a confirm dialog → "Send portal invitation to john@example.com?" → on confirm, calls `POST /clients/:id/grant-portal-access`.
- After granting: button changes to "Revoke Access", shows "Email sent" + verified status.
- "Resend Invite" button — re-triggers OTP email (calls same grant endpoint with a `resend` flag, or a dedicated `POST /clients/:id/resend-invite`).

**Step 2 — Show portal access status in clients list table**

Add a "Portal" column:
- `✓ Active` (green badge) — `portalAccess = true && emailVerified = true`
- `⏳ Pending` (amber badge) — `portalAccess = true && emailVerified = false`
- `— No Access` (grey) — `portalAccess = false`

**Step 3 — Add hooks in `use-clients.ts`**

```typescript
export function useGrantPortalAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.grantPortalAccess(clientId),
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.detail(clientId) });
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      toast.success('Portal invitation sent');
    },
    onError: (e: Error) => toast.error('Failed to grant access', e.message),
  });
}

export function useRevokePortalAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.revokePortalAccess(clientId),
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.detail(clientId) });
      queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      toast.success('Portal access revoked');
    },
  });
}
```

**Step 4 — Update conversion flow (LM-005)**

In the redesigned `convert-lead-modal.tsx`, **remove** any OTP-sending from the conversion itself. Conversion just creates the client record. Portal access is a separate manual step afterwards.

The conversion success toast changes from:
> "Lead converted. OTP sent to john@example.com"

To:
> "Client created. Grant portal access from the client profile when ready."

#### Testing Requirements

- Convert lead → client created, `portalAccess = false`, no email sent.
- Click "Grant Portal Access" → `portalAccess = true`, OTP email sent to client's email.
- Client list shows "Pending" badge until OTP is verified.
- Client enters OTP → `emailVerified = true`, list shows "Active" badge.
- Try to login to portal before access granted → `403 Forbidden`.
- Revoke access → client cannot login, `portalAccess = false`.
- Resend invite → new OTP generated (old one invalidated), new email sent.

**Estimate:** M (5–6 h)
**Migration required:** Yes — portal access fields on `Client`.

---

## 7. First Sale Auto-Creates Client

### Design Decision

> **The first sale is the moment of conversion. No separate "Convert to Client" step needed.**

Current flow:
```
Lead → [Manual "Convert to Client" button] → Client created → Sale created
```

New flow:
```
Lead → [Create Sale on Lead] → Client auto-created (1st sale) → Sale linked
Lead → [Create 2nd Sale on same Lead] → Existing client reused → Sale added
```

**Rules:**
1. `CreateSaleDto` accepts `leadId` as an alternative to `clientId`.
2. If `leadId` given and lead has **no** `convertedClientId` → auto-create client from lead data, set `lead.convertedClientId`, set `lead.status = CLOSED_WON`, create sale.
3. If `leadId` given and lead **already has** `convertedClientId` → reuse that client, just create the new sale. No new client.
4. `portalAccess` is **not** granted automatically — still manual (Section 6).
5. The existing "Convert to Client" button remains as a standalone action for cases where the agent wants to create the client first without a sale.

---

### TICKET: LM-012 — First Sale on Lead Auto-Creates Client

#### Backend Steps

**Step 1 — Update `CreateSaleDto`**
File: `apps/backend/core-service/src/modules/sales/dto/create-sale.dto.ts`

```typescript
export class CreateSaleDto {
  // Make clientId optional — one of clientId or leadId must be provided
  @IsOptional()
  @IsUUID()
  clientId?: string;

  // New: pass leadId instead of clientId
  @IsOptional()
  @IsUUID()
  leadId?: string;

  // ...rest of existing fields unchanged...
}
```

Add a custom validator in the service to ensure at least one is provided.

**Step 2 — Rewrite `SalesService.create()` to handle `leadId`**
File: `apps/backend/core-service/src/modules/sales/sales.service.ts`

```typescript
async create(orgId: string, dto: CreateSaleDto): Promise<ISale> {
  if (!dto.clientId && !dto.leadId) {
    throw new BadRequestException('Either clientId or leadId is required');
  }

  let resolvedClientId = dto.clientId;

  // ── LEAD PATH ──────────────────────────────────────────────────────────
  if (dto.leadId) {
    const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });

    if (!lead || lead.deletedAt) throw new NotFoundException('Lead not found');
    if (lead.organizationId !== orgId) throw new ForbiddenException();

    if (lead.convertedClientId) {
      // 2nd+ sale: reuse existing client
      resolvedClientId = lead.convertedClientId;
    } else {
      // 1st sale: auto-create client inside a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Build a temp password (portal NOT granted — no email sent here)
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        const newClient = await tx.client.create({
          data: {
            email:          lead.email ?? `lead-${lead.id}@placeholder.local`,
            password:       hashedPassword,
            companyName:    lead.name ?? lead.title ?? 'New Client',
            contactName:    lead.name ?? undefined,
            phone:          lead.phone ?? undefined,
            brandId:        lead.brandId,
            organizationId: orgId,
            portalAccess:   false,   // explicitly no access yet
            mustSetPassword: true,
          },
        });

        await tx.lead.update({
          where: { id: lead.id },
          data: {
            convertedClientId: newClient.id,
            status:            LeadStatus.CLOSED_WON,
          },
        });

        await tx.leadActivity.create({
          data: {
            type:   LeadActivityType.CONVERSION,
            data:   { clientId: newClient.id, trigger: 'first_sale' },
            leadId: lead.id,
            userId: orgId, // system-triggered; use a system userId or pass actorId
          },
        });

        return newClient.id;
      });

      resolvedClientId = result;
      await this.cache.delByPrefix(`leads:${orgId}:`);
      await this.cache.delByPrefix(`clients:${orgId}:`);
    }
  }
  // ── END LEAD PATH ───────────────────────────────────────────────────────

  // Standard client validation
  const client = await this.prisma.client.findUnique({ where: { id: resolvedClientId } });
  if (!client) throw new NotFoundException('Client not found');
  if (client.organizationId !== orgId) throw new BadRequestException('Client belongs to another organization');

  // ...rest of create() unchanged (payment plan, invoice generation, etc.)
}
```

**Step 3 — Pass `userId` (actor) into `SalesService.create()`**

Currently `sales.service.ts:create()` only receives `orgId` and `dto`. Update the controller to also pass `userId` so the auto-generated `LeadActivity` records the actual user who triggered the sale:

```typescript
// sales.controller.ts
@Post()
create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload): Promise<ISale> {
  return this.salesService.create(user.orgId, user.sub, dto);
}
```

**Step 4 — Handle edge case: lead has no email**

If the lead has no email (anonymous lead from a form), generate a placeholder:
```typescript
email: lead.email ?? `noemail-${lead.id}@internal.sentra`,
```

Flag on the client: `emailVerified = false`. Portal access cannot be granted until a real email is added. Add a validation in `grantPortalAccess()`:
```typescript
if (client.email.includes('@internal.sentra')) {
  throw new BadRequestException('Please add a valid email to this client before granting portal access');
}
```

**Step 5 — Update `SalesModule` imports** — inject `bcrypt`, `crypto`, and import `LeadActivity` relation if needed.

#### Frontend Steps

**Step 1 — Update `sale-form-modal.tsx` to accept a `leadId` prop**

The sale form can be opened in two modes:
- **From Sales page**: `clientId` required (existing behavior).
- **From Lead detail sheet**: `leadId` passed, `clientId` hidden.

```typescript
interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: ISale | null;
  prefillClientId?: string;   // existing: open from clients page
  prefillLeadId?: string;     // new: open from lead detail sheet
}
```

When `prefillLeadId` is set:
- Hide the "Client" dropdown.
- Show a read-only banner: `"This sale will be linked to [Lead Name]. A client account will be auto-created if this is their first sale."`
- Pass `leadId` instead of `clientId` in the payload.

**Step 2 — Add "Create Sale" button to `lead-detail-sheet.tsx`**

```tsx
{/* Quick Actions */}
<div className="flex gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => setCreateSaleOpen(true)}
    className="flex-1"
  >
    + New Sale
  </Button>

  {!lead.convertedClientId && canConvert && (
    <Button
      variant="outline"
      size="sm"
      className="border-emerald-500/30 text-emerald-400"
      onClick={() => setConvertOpen(true)}
    >
      Convert to Client
    </Button>
  )}
</div>

{/* If already converted */}
{lead.convertedClientId && (
  <p className="text-xs text-muted-foreground">
    ✓ Client created — <a href={`/dashboard/clients/${lead.convertedClientId}`} className="underline">View Client</a>
  </p>
)}
```

**Step 3 — After 1st sale from lead — update detail sheet**

On `useCreateSale().onSuccess`:
- If the lead was not yet converted (`!lead.convertedClientId`), invalidate both `leadsKeys.detail(leadId)` AND `clientsKeys.lists()`.
- Show success toast: `"Sale created. Client account has been created automatically."`
- Lead detail sheet now shows "✓ Client created · View Client".

**Step 4 — 2nd sale from lead (already converted)**

Same flow — "New Sale" button → sale form with `leadId`. Backend detects `lead.convertedClientId` exists → reuses it. No new client. Toast: `"Sale added to existing client."`

**Step 5 — Update `useCreateSale` hook**

```typescript
export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api.createSale(dto),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      // If created via leadId, also refresh lead + clients
      if (variables.leadId) {
        queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
        queryClient.invalidateQueries({ queryKey: leadsKeys.detail(variables.leadId as string) });
        queryClient.invalidateQueries({ queryKey: clientsKeys.lists() });
      }
      toast.success('Sale created');
    },
    onError: (e: Error) => toast.error('Failed to create sale', e.message),
  });
}
```

#### Complete Flow Diagram

```
SCENARIO A — First sale on lead
────────────────────────────────────────────────────────
Agent opens Lead detail → clicks "+ New Sale"
Sale form opens (pre-filled with Lead context, no client dropdown)
Agent fills: amount, payment plan, description → Submit

  POST /sales { leadId: "lead-123", totalAmount: 5000, ... }
        │
        ├─ Lead found, no convertedClientId
        ├─ $transaction:
        │   ├─ Client created from lead data (portalAccess: false)
        │   ├─ lead.convertedClientId = client.id
        │   ├─ lead.status = CLOSED_WON
        │   └─ LeadActivity: CONVERSION (trigger: first_sale)
        └─ Sale created for new client + invoices generated

Frontend: lead shows "✓ Client created", sale appears in sales list
Portal access: NOT sent yet — admin grants manually later


SCENARIO B — Second sale on same lead
────────────────────────────────────────────────────────
Agent opens same Lead → clicks "+ New Sale" again

  POST /sales { leadId: "lead-123", totalAmount: 3000, ... }
        │
        ├─ Lead found, convertedClientId = "client-456"
        ├─ Reuse client-456 (no new client)
        └─ Sale created for client-456 + invoices generated

Frontend: "Sale added to existing client" toast


SCENARIO C — Grant portal access (manually, any time)
────────────────────────────────────────────────────────
Admin opens Client detail → clicks "Grant Portal Access"
Confirm dialog → "Send invitation to john@example.com?"

  POST /clients/client-456/grant-portal-access
        │
        ├─ portalAccess = true
        ├─ OTP generated & hashed
        └─ Email sent: "Welcome to [Brand] — verify: [OTP]"
              Link: https://brand-portal.com/verify

Client receives email → enters OTP → sets password → logged in
```

#### Testing Requirements

**First sale auto-creates client:**
- Create sale with `leadId` (no `convertedClientId`) → client created, lead shows `CLOSED_WON`, `convertedClientId` set.
- Client has `portalAccess = false`, no email sent.
- Sale correctly linked to new client.

**Second sale reuses client:**
- Create 2nd sale with same `leadId` → no new client, existing client's sales count increases by 1.

**Error cases:**
- `leadId` and `clientId` both missing → `400 Bad Request`.
- `leadId` points to deleted lead → `404`.
- Lead from different org → `403`.
- Lead with no email → placeholder email set, portal cannot be granted until updated.

**Portal access separately tested** (see Section 6 testing requirements).

**Estimate:** M (4–5 h)
**Migration required:** Only if not already done in Section 6 (portal access fields on `Client`). If Section 6 runs first, this ticket has no additional migration.

---

## 8. Client Status Tracking

### TICKET: LM-013 — ClientStatus Lifecycle + Financial Event Tracking

#### Design Decision

A client's lifecycle is:

```
ACTIVE       → currently has at least one active/pending sale
COMPLETED    → all sales completed, all invoices paid, no active work
INACTIVE     → client exists but no sales in last 90 days
REFUNDED     → a full or partial refund was issued on at least one sale
CHARGEBACK   → client disputed a charge with their bank
BLACKLISTED  → manually flagged — no new sales allowed
```

**Two types of status change:**
1. **Auto-computed** — system watches sales + transactions and updates client status automatically.
2. **Manual override** — ADMIN can set `BLACKLISTED` or `INACTIVE` explicitly.

Financial events (refund, chargeback) are tracked at the **`PaymentTransaction` level** — the client status reflects the worst/latest event.

---

#### Backend Steps

**Step 1 — Add `ClientStatus` enum to `types.ts`**

```typescript
export enum ClientStatus {
  ACTIVE      = 'ACTIVE',       // ≥1 active/pending sale
  COMPLETED   = 'COMPLETED',    // all sales completed, all invoices paid
  INACTIVE    = 'INACTIVE',     // no sales activity in 90 days
  REFUNDED    = 'REFUNDED',     // refund processed on any sale
  CHARGEBACK  = 'CHARGEBACK',   // chargeback filed by client
  BLACKLISTED = 'BLACKLISTED',  // manually blocked
}
```

**Step 2 — Add `TransactionType.CHARGEBACK` to enum in `types.ts`**

```typescript
export enum TransactionType {
  ONE_TIME   = 'ONE_TIME',
  RECURRING  = 'RECURRING',
  REFUND     = 'REFUND',
  CHARGEBACK = 'CHARGEBACK',  // new
}

export enum TransactionStatus {
  PENDING          = 'PENDING',
  SUCCESS          = 'SUCCESS',
  FAILED           = 'FAILED',
  REFUNDED         = 'REFUNDED',
  CHARGEBACK_FILED = 'CHARGEBACK_FILED',  // new — disputed by client
  CHARGEBACK_WON   = 'CHARGEBACK_WON',   // new — won in our favor
  CHARGEBACK_LOST  = 'CHARGEBACK_LOST',  // new — lost, money returned to client
}
```

**Step 3 — Add `status` and `statusNote` to `Client` Prisma schema**

```prisma
model Client {
  // ...existing fields...
  status     ClientStatus @default(ACTIVE)
  statusNote String?      // optional manual note (e.g. "Filed chargeback on 2026-01-15")
  statusUpdatedAt DateTime?
  statusUpdatedBy String?  // userId
}
```

Update Prisma enum:
```prisma
enum ClientStatus {
  ACTIVE
  COMPLETED
  INACTIVE
  REFUNDED
  CHARGEBACK
  BLACKLISTED
}
```

Migration: `npx prisma migrate dev --name add_client_status_and_chargeback`

**Step 4 — Add `ClientStatusService` for auto-computation**
File: `apps/backend/core-service/src/modules/clients/client-status.service.ts`

```typescript
@Injectable()
export class ClientStatusService {
  constructor(private prisma: PrismaService) {}

  async recompute(clientId: string, orgId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        sales: {
          include: {
            transactions: true,
            invoices: true,
          },
        },
      },
    });

    if (!client) return;

    // Manual statuses — never auto-overwrite
    if (client.status === ClientStatus.BLACKLISTED) return;

    const allTx = client.sales.flatMap((s) => s.transactions);

    // Check chargeback (highest severity)
    const hasChargeback = allTx.some((t) =>
      [TransactionStatus.CHARGEBACK_FILED, TransactionStatus.CHARGEBACK_LOST].includes(t.status as any)
    );
    if (hasChargeback) {
      await this.setStatus(clientId, ClientStatus.CHARGEBACK);
      return;
    }

    // Check refund
    const hasRefund = allTx.some((t) => t.status === TransactionStatus.REFUNDED);
    if (hasRefund) {
      await this.setStatus(clientId, ClientStatus.REFUNDED);
      return;
    }

    // Check active sales
    const hasActiveSales = client.sales.some((s) =>
      [SaleStatus.PENDING, SaleStatus.ACTIVE].includes(s.status as any)
    );
    if (hasActiveSales) {
      await this.setStatus(clientId, ClientStatus.ACTIVE);
      return;
    }

    // All sales completed + all invoices paid
    const allCompleted = client.sales.every((s) => s.status === SaleStatus.COMPLETED);
    const allInvoicesPaid = client.sales
      .flatMap((s) => s.invoices)
      .every((inv) => inv.status === InvoiceStatus.PAID);

    if (allCompleted && allInvoicesPaid && client.sales.length > 0) {
      await this.setStatus(clientId, ClientStatus.COMPLETED);
      return;
    }

    // Check inactive (no sales in 90 days)
    const lastSale = client.sales.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const daysSinceLast = lastSale
      ? (Date.now() - lastSale.createdAt.getTime()) / 86_400_000
      : Infinity;

    if (daysSinceLast > 90 || client.sales.length === 0) {
      await this.setStatus(clientId, ClientStatus.INACTIVE);
      return;
    }

    await this.setStatus(clientId, ClientStatus.ACTIVE);
  }

  private async setStatus(clientId: string, status: ClientStatus): Promise<void> {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { status, statusUpdatedAt: new Date() },
    });
  }
}
```

**Step 5 — Trigger `recompute()` after every relevant event**

Call `clientStatusService.recompute(clientId, orgId)` after:
- Sale created / status changed / deleted (`sales.service.ts`)
- Invoice status changed to PAID / OVERDUE (`invoices.service.ts`)
- Transaction created with REFUNDED / CHARGEBACK_* status (`sales.service.ts → charge()`)

**Step 6 — Add manual status override endpoint**

```typescript
// clients.controller.ts
@Patch(':id/status')
@Roles(UserRole.OWNER, UserRole.ADMIN)
setStatus(
  @Param('id') id: string,
  @CurrentUser() actor: JwtPayload,
  @Body() dto: SetClientStatusDto,
): Promise<IClient> {
  return this.clientsService.setStatus(id, actor.orgId, actor.sub, dto);
}
```

```typescript
// set-client-status.dto.ts
export class SetClientStatusDto {
  @IsEnum(ClientStatus)
  status: ClientStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

**Step 7 — Add `POST /sales/:id/refund` and `POST /sales/:id/chargeback` endpoints**

```typescript
// Refund endpoint
@Post(':id/refund')
@Roles(UserRole.OWNER, UserRole.ADMIN)
refund(
  @Param('id') id: string,
  @CurrentUser() actor: JwtPayload,
  @Body() dto: RefundSaleDto,
): Promise<any> {
  return this.salesService.refund(id, actor.orgId, actor.sub, dto);
}

// Chargeback endpoint — record a chargeback event
@Post(':id/chargeback')
@Roles(UserRole.OWNER, UserRole.ADMIN)
recordChargeback(
  @Param('id') id: string,
  @CurrentUser() actor: JwtPayload,
  @Body() dto: ChargebackDto,
): Promise<any> {
  return this.salesService.recordChargeback(id, actor.orgId, actor.sub, dto);
}
```

```typescript
// refund-sale.dto.ts
export class RefundSaleDto {
  @IsNumber() @Min(0.01)
  amount: number;           // partial or full refund

  @IsOptional() @IsString()
  transactionId?: string;   // Authorize.net transaction to refund

  @IsOptional() @IsString()
  @MaxLength(500)
  reason?: string;
}

// chargeback.dto.ts
export class ChargebackDto {
  @IsNumber() @Min(0.01)
  amount: number;

  @IsEnum(['CHARGEBACK_FILED', 'CHARGEBACK_WON', 'CHARGEBACK_LOST'])
  outcome: string;

  @IsOptional() @IsString()
  @MaxLength(500)
  note?: string;
}
```

**Step 8 — `salesService.recordChargeback()`**

```typescript
async recordChargeback(id, orgId, actorId, dto: ChargebackDto) {
  const sale = await this.prisma.sale.findUnique({ where: { id }, include: { client: true } });
  if (!sale || sale.organizationId !== orgId) throw ...;

  // Record transaction event
  await this.prisma.paymentTransaction.create({
    data: {
      type:            TransactionType.CHARGEBACK,
      amount:          dto.amount,
      status:          dto.outcome,  // CHARGEBACK_FILED | WON | LOST
      responseMessage: dto.note,
      saleId:          id,
    },
  });

  // Update sale status
  await this.prisma.sale.update({
    where: { id },
    data: { status: SaleStatus.CANCELLED },
  });

  // Auto-recompute client status — will become CHARGEBACK
  await this.clientStatusService.recompute(sale.clientId, orgId);

  // Log in ClientActivity
  await this.prisma.clientActivity.create({
    data: {
      type:     ClientActivityType.CHARGEBACK_FILED,
      data:     { amount: dto.amount, outcome: dto.outcome, note: dto.note, saleId: id },
      clientId: sale.clientId,
      userId:   actorId,
    },
  });
}
```

> Add `CHARGEBACK_FILED`, `REFUND_ISSUED` to `ClientActivityType` enum.

#### Frontend Steps

**Step 1 — `ClientStatus` badge in clients list and detail**

| Status | Badge Color | Icon |
|--------|------------|------|
| ACTIVE | Green | ● |
| COMPLETED | Blue | ✓ |
| INACTIVE | Grey | ○ |
| REFUNDED | Amber | ↩ |
| CHARGEBACK | Red | ⚠ |
| BLACKLISTED | Dark Red | ✕ |

**Step 2 — Client detail sheet "Financial Status" card**

```
┌─────────────────────────────────────────────────────┐
│  CLIENT STATUS                                      │
│  ● ACTIVE                                           │
│                                                     │
│  Total Sales:    4      Total Revenue:   $18,400    │
│  Paid Invoices:  6/7    Refunds:         $0         │
│  Chargebacks:    0      Last Activity:   2 days ago │
│                                                     │
│  [Change Status ▼]  (ADMIN only)                    │
└─────────────────────────────────────────────────────┘
```

**Step 3 — Chargeback / Refund action buttons in sale detail sheet**

Under each sale:
```
[Refund]  [Record Chargeback]  (ADMIN only)
```

- "Refund" → opens dialog: amount, reason, Authorize.net transaction ID.
- "Record Chargeback" → opens dialog: amount, outcome (Filed/Won/Lost), note.

**Step 4 — Filter clients list by status**

Add `status` filter dropdown to clients list: All / Active / Completed / Inactive / Refunded / Chargeback / Blacklisted.

#### Testing Requirements

- Create sale for client → client status = ACTIVE.
- Complete sale + pay all invoices → status auto-recomputes to COMPLETED.
- Record chargeback → status = CHARGEBACK (red badge).
- ADMIN sets status to BLACKLISTED manually → stays BLACKLISTED even if new sale added.
- Client with no sales, last sale > 90 days → status = INACTIVE.
- Refund transaction → status = REFUNDED.

**Estimate:** M (5–6 h)
**Migration required:** Yes — `ClientStatus` enum + 3 fields on `Client`.

---

## 9. Bulk Lead Import

### TICKET: LM-006 — CSV/Excel Bulk Import

*(Full detail in `docs/sales-dashboard-comprehensive-improvement-plan.md → Section 3.1 → LEAD-IMPORT-001`)*

#### Summary of Implementation

**Backend — `POST /leads/import`**

| Detail | Spec |
|--------|------|
| Auth | ADMIN, SALES_MANAGER only |
| Content-Type | `multipart/form-data` |
| File types | `.csv`, `.xlsx` (max 5 MB) |
| Extra body params | `brandId` (required), `source?: LeadSource`, `leadType?: LeadType` |
| Row limit | 1,000 rows per import |
| Libraries | `csv-parse` for CSV, `xlsx` for Excel |
| Duplicate handling | Skip rows where `email` matches existing lead (non-deleted) in same org |
| Batch insert | `prisma.lead.createMany({ skipDuplicates: true })` |
| Assignment | Run assignment rules async via BullMQ after batch insert |
| Response | `{ total, created, duplicates, errors, errorDetails: [{row, reason}] }` |

**Expected CSV Column Names (case-insensitive match):**

| CSV Header | Maps To |
|------------|---------|
| `name` / `contact_name` | `Lead.name` |
| `email` | `Lead.email` |
| `phone` | `Lead.phone` |
| `website` | `Lead.website` |
| `title` | `Lead.title` (optional — auto-generated if blank) |
| `lead_type` | `Lead.leadType` (validated against `LeadType` enum) |
| `source` | `Lead.source` (validated against `LeadSource` enum; falls back to body param) |
| `lead_date` | `Lead.leadDate` (ISO or DD/MM/YYYY) |
| any other column | stored in `Lead.data` JSON |

**Frontend — Import Modal**

1. "Import Leads" button → opens `LeadImportModal`.
2. Drag-and-drop file zone + brand selector + default source/leadType selectors.
3. On upload: show progress spinner.
4. On complete: show summary table with error rows expandable.
5. "Download Template" button to get a pre-formatted CSV.

**Testing Requirements**
- Upload 100-row CSV — 100 leads created.
- Include a row with invalid `leadType` value — appears in `errorDetails`.
- Duplicate email on row 5 — `duplicates: 1`, no duplicate record in DB.
- File > 5 MB — returns `413 Payload Too Large`.
- Non-CSV/XLSX file — returns `400 Bad Request`.

**Estimate:** L (7–8 h)

---

## 9. Facebook & External Lead Integration

### TICKET: LM-007 — Facebook Lead Ads Webhook

*(Full detail in `docs/sales-dashboard-comprehensive-improvement-plan.md → Section 3.2 → LEAD-IMPORT-002`)*

#### Summary

**Automated Flow:**
```
Facebook Lead Ad Form Submitted by User
        │
        ▼
Facebook sends webhook POST to:
  /webhooks/facebook-leads?webhookId={integrationId}
        │
        ▼
Backend:
  1. Validates HMAC-SHA256 signature (X-Hub-Signature-256 header)
  2. Looks up FacebookIntegration by pageId + formId
  3. Fetches full lead data from Graph API
  4. Maps to CreateLeadDto: { name, email, phone, source: 'FACEBOOK_ADS', brandId, leadType: 'INBOUND' }
  5. Calls LeadsService.captureInternal(dto)
  6. Triggers assignment rules async
        │
        ▼
Lead appears in dashboard within 60 seconds
```

**New Models Required:**
```prisma
model FacebookIntegration {
  id          String  @id @default(uuid())
  orgId       String
  brandId     String
  pageId      String
  formId      String
  accessToken String  // AES-256-GCM encrypted
  isActive    Boolean @default(true)
  label       String?
  createdAt   DateTime @default(now())

  @@unique([pageId, formId])
}
```

**New Endpoints:**
- `POST /integrations/facebook` — register integration (ADMIN only)
- `GET  /integrations/facebook` — list integrations
- `PATCH /integrations/facebook/:id` — enable/disable
- `DELETE /integrations/facebook/:id` — remove
- `POST /webhooks/facebook-leads` — public webhook receiver

**Frontend Settings Page:** `/settings/integrations/facebook`

**Estimate:** L (8–10 h)

---

### TICKET: LM-008 — Generic Inbound Webhook

*(Full detail in comprehensive plan → Section 3.3 → LEAD-IMPORT-003)*

**Summary:** Each org gets a unique signed webhook URL. Any external tool (Zapier, Typeform, Make.com) `POST`s a lead payload to it. Backend validates HMAC, maps fields, creates lead.

**Estimate:** M (4–5 h)

---

## 10. Kanban & UI Updates

### TICKET: LM-009 — Kanban Updates for New Statuses + Fields

#### Changes Required in `leads-kanban.tsx`

1. **COLUMNS array** — replace `CLOSED` with `CLOSED_WON` and `CLOSED_LOST`:
```typescript
const COLUMNS = [
  { status: LeadStatus.NEW,         label: 'New' },
  { status: LeadStatus.CONTACTED,   label: 'Contacted' },
  { status: LeadStatus.PROPOSAL,    label: 'Proposal' },
  { status: LeadStatus.FOLLOW_UP,   label: 'Follow Up' },
  { status: LeadStatus.CLOSED_WON,  label: 'Won' },
  { status: LeadStatus.CLOSED_LOST, label: 'Lost' },
];
```

2. **Drag to CLOSED_LOST** — show a small inline reason dialog (same pattern as `FOLLOW_UP` date dialog).

3. **COLUMN_COLORS** — add colors for new statuses:
```typescript
[LeadStatus.CLOSED_WON]:  'border-t-emerald-500/60',
[LeadStatus.CLOSED_LOST]: 'border-t-red-500/60',
```

#### Changes Required in `leads-kanban-card.tsx`

1. Show `leadType` badge (e.g., `CHAT`, `INBOUND`) as a small colored chip below the title.
2. Show `source` badge (e.g., `PPC`, `SMM`) if set.
3. Show both assignment avatars (Front Sell + Upsell) stacked if both roles are assigned.
4. Show `leadDate` in relative format ("3 days ago") replacing the current `createdAt`.

**Estimate:** M (3–4 h)
**Dependencies:** LM-001 (new fields), LM-002 (new statuses), LM-004 (multi-assignment).

---

### TICKET: LM-010 — Filter Bar Updates for New Fields

Update the filter bar on `leads/page.tsx`:

| Filter | Current | Change |
|--------|---------|--------|
| Status | Existing dropdown | Add `CLOSED_WON` and `CLOSED_LOST` options |
| Source | Free-text input | Replace with enum dropdown (PPC, SMM, COLD_REFERRAL) |
| Lead Type | Not present | Add new dropdown (CHAT, SIGNUP, SOCIAL, REFERRAL, INBOUND) |
| Date Range | Existing | Add "Lead Date" as an alternative to "Created Date" |
| Assignee | Not present | Add dropdown filtered to team members |

**Estimate:** S (2 h)
**Dependencies:** LM-001, LM-002.

---

## 11. Implementation Order & Estimates

### Recommended Sequence (minimize migration conflicts)

| # | Ticket | Depends On | Estimate | Notes |
|---|--------|------------|----------|-------|
| 1 | **LM-002** — CLOSED_WON/LOST statuses | — | M | First — all status logic branches from this |
| 2 | **LM-001** — New fields (LeadType, Source enum, LeadDate, optional title) | LM-002 | M | Combine migrations 1+2 into one `npx prisma migrate` |
| 3 | **LM-004a** — Lead FrontSell assignment UI (no migration) | — | S | Pure UI + role filter on members endpoint |
| 4 | **LM-003** — Notes & Audit Log separation | LM-002 | M | UI split + actor name passthrough in API |
| 5 | **LM-011** — Portal access control & OTP email | — | M | Migration: portal fields on Client |
| 6 | **LM-004b** — Client Upsell + PM assignment with history | LM-011 | M | Migration: FK cols + ClientActivity table (combine with LM-011) |
| 7 | **LM-012** — First sale auto-creates client | LM-002, LM-011, LM-004b | M | No extra migration if LM-011+LM-004b already ran |
| 8 | **LM-005** — Convert to Client redesign (remove password, OTP moved to LM-011) | LM-011, LM-012 | M | Simplified now — just client creation, no OTP in modal |
| 9 | **LM-009** — Kanban updates | LM-001, LM-002 | M | Pure frontend |
| 10 | **LM-010** — Filter bar updates | LM-001, LM-002 | S | Pure frontend |
| 11 | **LM-006** — Bulk CSV import | LM-001 | L | Can start in parallel after LM-001 |
| 12 | **LM-007** — Facebook webhook | LM-001 | L | Parallel with LM-006 |
| 13 | **LM-008** — Generic webhook | LM-007 | M | After LM-007 (shared webhook infra) |

### Recommended Migration Batches

| Batch | Tickets | Schema Changes |
|-------|---------|----------------|
| **Migration 1** | LM-001 + LM-002 | Lead: `leadType`, `source` enum, `leadDate`, `lostReason`; new enums `LeadType`, `LeadSource`, update `LeadStatus` |
| **Migration 2** | LM-011 + LM-004b | Client: `portalAccess`, `portalGrantedAt`, `portalGrantedBy`, `emailVerified`, `emailOtp`, `emailOtpExpiry`, `mustSetPassword`, `upsellAgentId`, `projectManagerId`; new `ClientActivity` table |
| **Migration 3** | LM-005 | Client: `emailVerified`, `emailOtp`, `emailOtpExpiry`, `mustSetPassword` (if not in batch 2) |

### Total Estimate

| Priority | Tickets | Total |
|----------|---------|-------|
| P0 (Sprint 1) | LM-002, LM-001, LM-004a, LM-003 | ~12–15 h |
| P1 (Sprint 2) | LM-011, LM-004b, LM-012, LM-005 | ~20–24 h |
| P1 (Sprint 2 Frontend) | LM-009, LM-010 | ~5–6 h |
| P2 (Sprint 3) | LM-006, LM-007, LM-008 | ~19–23 h |

---

## Sizing Legend

| Size | Time |
|------|------|
| XS | < 1 h |
| S | 1–3 h |
| M | 3–6 h |
| L | 6–10 h |
| XL | 10+ h |
