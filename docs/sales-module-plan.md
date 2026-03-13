# Sales Module — Enhancement Plan

**Scope:** `apps/backend/core-service/src/modules/sales/` · `src/modules/invoices/` + `apps/frontend/sales-dashboard/src/app/dashboard/sales/`
**Date:** 2026-03-14
**Status:** Planning — Builds on Lead Module Plan (lead-module-enhancement-plan.md)
**Prerequisite tickets:** LM-011 (portal access), LM-012 (first sale auto-creates client), LM-013 (client status)

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Sale Lifecycle & Status Flow](#2-sale-lifecycle--status-flow)
3. [Sale Form — Completeness Fixes](#3-sale-form--completeness-fixes)
4. [Sale Detail View — Full Rebuild](#4-sale-detail-view--full-rebuild)
5. [Refund & Chargeback Flow](#5-refund--chargeback-flow)
6. [Invoice Module Fixes](#6-invoice-module-fixes)
7. [Sale Notes & Activity Log](#7-sale-notes--activity-log)
8. [Recurring Sales (Subscription) Management](#8-recurring-sales-subscription-management)
9. [Sale Visibility & Scoping Fixes](#9-sale-visibility--scoping-fixes)
10. [Sales Analytics & Reporting](#10-sales-analytics--reporting)
11. [Implementation Order & Estimates](#11-implementation-order--estimates)

---

## 1. Current State Audit

### What Exists

| Area | File | State |
|------|------|-------|
| Sale CRUD | `sales.service.ts` | Complete — create, update, delete, find |
| Payment plans | `CreateSaleDto` | ONE_TIME, INSTALLMENTS, SUBSCRIPTION |
| Auto-invoice generation | `generateInvoices()` | Works but NOT inside `$transaction` with sale creation |
| Authorize.net charge | `sales.service.ts:charge()` | Works — creates CustomerProfile + PaymentProfile |
| Authorize.net subscription | `sales.service.ts:subscribe()` | Works — ARB |
| Invoice CRUD | `invoices.service.ts` | Complete — create, update, delete, PDF, pay |
| Sale items (`SaleItem[]`) | Schema + DTO | **Schema & DTO exist; form does NOT send items** |
| Payment plan in form | `sale-form-modal.tsx` | **Missing — form has no payment plan field** |
| Installment count in form | `sale-form-modal.tsx` | **Missing** |
| Sale soft-delete | `sales.service.ts:remove()` | **Hard block if invoices exist** |
| Refund flow | — | **Not implemented** |
| Chargeback tracking | — | **Not implemented** (covered in LM-013) |
| Sale activity/notes | — | **Does not exist** |
| Invoice number collision | `generateInvoices()` | `INV-${Date.now()}` — **collides at high throughput** |
| Invoice overdue cron | — | **Does not exist** |
| Sale scoping for UPSELL_AGENT | `sales.service.ts:findAll()` | Scopes via lead `assignedToId` — **breaks after LM-004b** (Upsell now on Client, not Lead) |
| Client portal payment | `invoices.service.ts` | Public invoice endpoint exists |

### Key Bugs

1. **`generateInvoices()` is called outside `prisma.$transaction`** — if it fails, the sale exists without invoices.
2. **Invoice number uses `Date.now()`** — two simultaneous requests within the same millisecond produce duplicate invoice numbers, causing P2002.
3. **UPSELL_AGENT visibility scoping reads from `lead.assignedToId`** — after LM-012 (first sale auto-creates client) and LM-004b (upsell assigned on client), this breaks. Upsell agents won't see their clients' sales.
4. **Sale delete hard-blocks on invoices** — no soft-delete, no path for cleanup.
5. **Sale form sends no `items`, no `paymentPlan`, no `installmentCount`** — all three are in the schema and DTO but invisible in the UI.

---

## 2. Sale Lifecycle & Status Flow

### Current Statuses: `PENDING → ACTIVE → COMPLETED → CANCELLED`

### Problems

- No `REFUNDED` status — a refunded sale stays `COMPLETED` or `CANCELLED` with no distinction.
- No `ON_HOLD` — sometimes a sale is paused (e.g., awaiting legal review).
- No transition rules enforced — any status can be set to any other status.

### TICKET: SM-001 — Add REFUNDED + ON_HOLD Statuses + Enforce Transitions

#### Backend Steps

**Step 1 — Update `SaleStatus` enum in `types.ts`**

```typescript
export enum SaleStatus {
  PENDING   = 'PENDING',    // created, payment not yet collected
  ACTIVE    = 'ACTIVE',     // payment in progress / subscription active
  ON_HOLD   = 'ON_HOLD',    // manually paused
  COMPLETED = 'COMPLETED',  // fully paid, work delivered
  REFUNDED  = 'REFUNDED',   // full or partial refund issued
  CANCELLED = 'CANCELLED',  // cancelled before completion
}
```

**Step 2 — Define transition map in `types.ts`**

```typescript
export const SALE_STATUS_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.PENDING]:   [SaleStatus.ACTIVE, SaleStatus.ON_HOLD, SaleStatus.CANCELLED],
  [SaleStatus.ACTIVE]:    [SaleStatus.COMPLETED, SaleStatus.ON_HOLD, SaleStatus.CANCELLED, SaleStatus.REFUNDED],
  [SaleStatus.ON_HOLD]:   [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.COMPLETED]: [SaleStatus.REFUNDED],
  [SaleStatus.REFUNDED]:  [],  // terminal
  [SaleStatus.CANCELLED]: [],  // terminal
};
```

**Step 3 — Update `SalesService.update()` to validate transitions**

```typescript
async update(id, orgId, dto: UpdateSaleDto) {
  const sale = await this.prisma.sale.findUnique({ where: { id } });
  // ...guards...

  if (dto.status && dto.status !== sale.status) {
    const allowed = SALE_STATUS_TRANSITIONS[sale.status as SaleStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition sale from ${sale.status} to ${dto.status}`
      );
    }
  }

  // ...rest of update...
}
```

**Step 4 — Auto-set status based on payments**

In `SalesService` after a successful charge or when all invoices are paid:
```typescript
// When last invoice is marked PAID:
const allPaid = await this.prisma.invoice.count({
  where: { saleId, status: { not: InvoiceStatus.PAID } }
});
if (allPaid === 0) {
  await this.prisma.sale.update({ where: { id: saleId }, data: { status: SaleStatus.COMPLETED } });
}
```

**Step 5 — Migrate Prisma schema**

```prisma
enum SaleStatus {
  PENDING
  ACTIVE
  ON_HOLD
  COMPLETED
  REFUNDED
  CANCELLED
}
```

Migration: `npx prisma migrate dev --name add_sale_status_on_hold_refunded`

#### Frontend Steps

- Add `ON_HOLD` (yellow) and `REFUNDED` (purple) to `<StatusBadge>` component.
- Sale detail sheet: status change buttons respect `SALE_STATUS_TRANSITIONS`.
- Filter bar on sales list: add ON_HOLD and REFUNDED filter options.

**Estimate:** S (2–3 h) + migration
**Dependencies:** —

---

## 3. Sale Form — Completeness Fixes

### TICKET: SM-002 — Add Payment Plan, Installments, Sale Items to Form

#### Issue

`sale-form-modal.tsx` only sends `clientId`, `brandId`, `totalAmount`, `currency`, `description`. The backend `CreateSaleDto` also supports `paymentPlan`, `installmentCount`, and `items[]` — but the form never sends them. Every sale is silently defaulted to ONE_TIME with no line items.

#### Expected Output

The sale form has three new sections:
1. **Payment Plan** — radio group (ONE_TIME / INSTALLMENTS / SUBSCRIPTION).
2. **Installment Count** — numeric input, visible only when INSTALLMENTS selected.
3. **Line Items** — dynamic add/remove rows (name, qty, unit price). `totalAmount` auto-calculated.

#### Backend Steps (minimal — DTO already supports this)

**Step 1 — Confirm `CreateSaleDto` and `SalesService.create()` handle items correctly**

Already does — `items` is optional array, `totalAmount` computed from items if not provided. No backend change needed.

**Step 2 — Fix: wrap `generateInvoices()` inside `$transaction` with sale creation**

```typescript
// BEFORE (buggy — invoices created outside transaction)
const sale = await this.prisma.sale.create({ ... });
await this.generateInvoices(sale.id, ...);

// AFTER (atomic)
const sale = await this.prisma.$transaction(async (tx) => {
  const newSale = await tx.sale.create({ ... });
  await this._generateInvoicesTx(tx, newSale.id, totalAmount, paymentPlan, installmentCount, currency);
  return newSale;
});
```

Rename private method to `_generateInvoicesTx(tx, ...)` accepting the transaction client.

#### Frontend Steps

**Step 1 — Add `paymentPlan` radio group to `sale-form-modal.tsx`**

```tsx
<div className="space-y-2">
  <Label>Payment Plan</Label>
  <div className="flex gap-3">
    {(['ONE_TIME', 'INSTALLMENTS', 'SUBSCRIPTION'] as const).map((plan) => (
      <label key={plan} className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          value={plan}
          {...register('paymentPlan')}
          className="accent-primary"
        />
        <span className="text-sm">{plan.replace('_', ' ')}</span>
      </label>
    ))}
  </div>
</div>
```

**Step 2 — Conditional installment count input**

```tsx
{paymentPlan === 'INSTALLMENTS' && (
  <div className="space-y-1.5">
    <Label>Number of Installments</Label>
    <Input
      type="number"
      min={2}
      max={60}
      placeholder="e.g. 6"
      {...register('installmentCount', { min: 2, max: 60 })}
    />
    {installmentCount && totalAmount && (
      <p className="text-xs text-muted-foreground">
        {installmentCount} payments of ${(totalAmount / installmentCount).toFixed(2)} each
      </p>
    )}
  </div>
)}
```

**Step 3 — Line items section using `useFieldArray`**

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'items' });

// Auto-compute totalAmount
useEffect(() => {
  const total = items.reduce((sum, item) => {
    const price = item.customPrice || item.unitPrice || 0;
    return sum + price * (item.quantity || 1);
  }, 0);
  if (total > 0) setValue('totalAmount', total);
}, [items]);
```

Table of item rows:
```
| Name       | Qty | Unit Price | Custom Price | Total  | [×] |
|------------|-----|-----------|--------------|--------|-----|
| [Input]    | [1] | [$0.00]   | [optional]   | $0.00  | ×   |
[+ Add Item]
```

**Step 4 — `totalAmount` field becomes read-only when items exist**

```tsx
<Input
  type="number"
  placeholder="Auto-calculated from items"
  readOnly={items.length > 0}
  {...register('totalAmount')}
/>
```

**Testing Requirements**

- Create ONE_TIME sale with 3 items → 1 invoice generated, `totalAmount` = sum of items.
- Create INSTALLMENTS sale with 4 installments → 4 invoices generated, amounts sum to total.
- Create SUBSCRIPTION sale → 0 invoices generated.
- If `generateInvoices` fails (mock DB error) → sale is also rolled back (atomic test).

**Estimate:** M (4–5 h)
**Dependencies:** —

---

## 4. Sale Detail View — Full Rebuild

### TICKET: SM-003 — Rebuild Sale Detail Sheet with Full Context

#### Issue

`sale-detail-sheet.tsx` shows basic sale info. It does not clearly present:
- Invoice timeline (which invoices are paid, overdue, upcoming)
- Payment transaction history
- Sale items breakdown
- Client quick-link (click to open client detail)
- Subscription status (is the subscription active, when is next charge)

#### Expected Output

Four tabs in the sale detail sheet:

```
[Overview] [Invoices] [Payments] [Items]
```

**Overview Tab:**
```
┌─────────────────────────────────────────────────┐
│  CLIENT     [Avatar] Acme Inc.           →      │
│  BRAND      Urban Quill                         │
│  STATUS     ● ACTIVE                            │
│  PLAN       INSTALLMENTS (4 of 6 paid)          │
│  TOTAL      $12,000                             │
│  COLLECTED  $8,000  (66%)                       │
│  REMAINING  $4,000                              │
│  CREATED    Jan 15, 2026                        │
│  CONTRACT   [Download] (if contractUrl set)     │
│                                                 │
│  [Change Status ▼]  [Edit]  [Refund]            │
└─────────────────────────────────────────────────┘
```

**Invoices Tab:**
```
┌─────────────────────────────────────────────────┐
│  INV-2026-0001  $2,000  Feb 1   ✓ PAID          │
│  INV-2026-0002  $2,000  Mar 1   ✓ PAID          │
│  INV-2026-0003  $2,000  Apr 1   ⚠ OVERDUE       │
│  INV-2026-0004  $2,000  May 1   ○ UNPAID        │
│                                                 │
│  [+ Add Invoice]  [Send All Unpaid]             │
└─────────────────────────────────────────────────┘
```

**Payments Tab:**
```
┌─────────────────────────────────────────────────┐
│  ✓ $2,000  Jan 15  Authorize.net  txn-abc123    │
│  ✓ $2,000  Feb 15  Authorize.net  txn-def456    │
│  ✗ $2,000  Mar 15  FAILED — Card declined       │
│  ↩ -$500   Mar 16  REFUND — Partial             │
│                                                 │
│  [Charge Invoice]  [Issue Refund]               │
└─────────────────────────────────────────────────┘
```

**Items Tab:**
```
┌─────────────────────────────────────────────────┐
│  SEO Package        1 × $5,000   $5,000         │
│  Social Management  2 × $3,000   $6,000         │
│  Setup Fee          1 × $1,000   $1,000         │
│  ─────────────────────────────────────          │
│  TOTAL                           $12,000        │
└─────────────────────────────────────────────────┘
```

#### Backend Steps

**Step 1 — Enrich `findOne()` response**

Add computed fields to the sale detail response:

```typescript
async findOne(id: string, orgId: string) {
  const sale = await this.prisma.sale.findUnique({
    where: { id },
    include: {
      client:       { select: { id, email, companyName, contactName } },
      brand:        { select: { id, name } },
      items:        true,
      invoices:     { orderBy: { dueDate: 'asc' } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });

  // ...guards...

  const paidAmount = sale.transactions
    .filter((t) => t.status === 'SUCCESS')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const paidInvoiceCount = sale.invoices.filter((i) => i.status === 'PAID').length;

  return {
    ...sale,
    paidAmount,
    remainingAmount: Number(sale.totalAmount) - paidAmount,
    paidInvoiceCount,
    totalInvoiceCount: sale.invoices.length,
  };
}
```

**Step 2 — No additional endpoints needed** — all data comes from the enriched `findOne`.

#### Frontend Steps

**Step 1 — Rebuild `sale-detail-sheet.tsx` with 4 tabs**

Add tab state: `'overview' | 'invoices' | 'payments' | 'items'`.

**Step 2 — Invoice tab: color-coded status rows**

| Status | Color | Icon |
|--------|-------|------|
| PAID | Green | ✓ |
| OVERDUE | Red | ⚠ |
| UNPAID | Grey | ○ |

Each row has: invoice number, amount, due date, status badge, "Pay Now" button (ADMIN only).

**Step 3 — Payments tab: transaction rows**

| Type | Color | Description |
|------|-------|-------------|
| SUCCESS | Green | ✓ Charged |
| FAILED | Red | ✗ Failed — reason |
| REFUNDED | Amber | ↩ Refund |
| CHARGEBACK_* | Dark Red | ⚠ Chargeback |

**Step 4 — Progress bar on Overview tab**

```tsx
<div className="space-y-1">
  <div className="flex justify-between text-xs">
    <span>Collected: ${paidAmount.toLocaleString()}</span>
    <span>{Math.round((paidAmount / totalAmount) * 100)}%</span>
  </div>
  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
    <div
      className="h-full bg-emerald-500 rounded-full transition-all"
      style={{ width: `${(paidAmount / totalAmount) * 100}%` }}
    />
  </div>
  <p className="text-xs text-muted-foreground">
    Remaining: ${remainingAmount.toLocaleString()}
  </p>
</div>
```

**Estimate:** M (4–5 h)
**Dependencies:** SM-002 (items need to be in DB first).

---

## 5. Refund & Chargeback Flow

*(Core logic defined in LM-013. This section covers the Sales module endpoints and UI.)*

### TICKET: SM-004 — Refund Endpoint + UI

#### Backend

**`SalesService.refund(id, orgId, actorId, dto: RefundSaleDto)`**

```typescript
async refund(id, orgId, actorId, dto: RefundSaleDto) {
  const sale = await this.prisma.sale.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!sale || sale.organizationId !== orgId) throw ...;

  // Attempt Authorize.net refund if transactionId provided
  let authNetResponse: any = null;
  if (dto.transactionId && sale.customerProfileId) {
    authNetResponse = await this.authorizeNet.refundTransaction({
      transactionId: dto.transactionId,
      amount: dto.amount,
      customerProfileId: sale.customerProfileId,
      paymentProfileId: sale.paymentProfileId,
    });
    if (!authNetResponse.success) {
      throw new BadRequestException(`Refund failed: ${authNetResponse.message}`);
    }
  }

  // Record transaction
  await this.prisma.paymentTransaction.create({
    data: {
      type:            TransactionType.REFUND,
      amount:          -dto.amount,   // negative = money out
      status:          TransactionStatus.REFUNDED,
      transactionId:   authNetResponse?.transactionId,
      responseMessage: dto.reason,
      saleId:          id,
    },
  });

  // If full refund, update sale status
  const totalRefunded = ...; // sum of all REFUND transactions
  if (totalRefunded >= Number(sale.totalAmount)) {
    await this.prisma.sale.update({ where: { id }, data: { status: SaleStatus.REFUNDED } });
  }

  // Recompute client status
  await this.clientStatusService.recompute(sale.clientId, orgId);

  return { message: 'Refund processed successfully' };
}
```

#### Frontend

"Issue Refund" button in sale detail sheet → modal:
```
┌─────────────────────────────────────────┐
│  Issue Refund                           │
│                                         │
│  Amount         [$_______]              │
│  Authorize.net TxnID  [optional]        │
│  Reason         [textarea]              │
│                                         │
│  ⚠ This will update the client status  │
│     to REFUNDED if full amount.         │
│                                         │
│  [Cancel]  [Confirm Refund]             │
└─────────────────────────────────────────┘
```

**Estimate:** S (2–3 h)
**Dependencies:** LM-013 (ClientStatusService), SM-001 (REFUNDED status).

---

## 6. Invoice Module Fixes

### TICKET: SM-005 — Fix Invoice Number Collision

#### Issue

`generateInvoices()` uses `INV-${Date.now()}-${i}` — timestamp-based, not unique under concurrent load.

#### Expected Output

Sequential per-org invoice numbers: `{BRAND_CODE}-{YYYY}-{0001}` format. Guaranteed unique via atomic DB counter.

#### Backend Steps

**Step 1 — Add `InvoiceSequence` model to schema**

```prisma
model InvoiceSequence {
  id      String @id @default(uuid())
  orgId   String
  brandId String
  year    Int
  lastSeq Int    @default(0)

  @@unique([orgId, brandId, year])
}
```

**Step 2 — Atomic sequence increment function**

```typescript
private async nextInvoiceNumber(tx: any, orgId: string, brandId: string): Promise<string> {
  const year = new Date().getFullYear();

  // Atomic upsert + increment using raw SQL for safety
  const result = await tx.$executeRaw`
    INSERT INTO "InvoiceSequence" ("id", "orgId", "brandId", "year", "lastSeq")
    VALUES (gen_random_uuid(), ${orgId}, ${brandId}, ${year}, 1)
    ON CONFLICT ("orgId", "brandId", "year")
    DO UPDATE SET "lastSeq" = "InvoiceSequence"."lastSeq" + 1
    RETURNING "lastSeq"
  `;

  const seq = await tx.invoiceSequence.findUnique({
    where: { orgId_brandId_year: { orgId, brandId, year } },
  });

  // Get brand code (first 3 letters uppercase)
  const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { name: true } });
  const code  = brand?.name.slice(0, 3).toUpperCase() ?? 'INV';

  return `${code}-${year}-${String(seq.lastSeq).padStart(4, '0')}`;
}
```

**Step 3 — Update `_generateInvoicesTx()` to use new numbering**

```typescript
const invoiceNumber = await this.nextInvoiceNumber(tx, orgId, sale.brandId);
```

**Backfill migration:** Update existing invoices — not strictly necessary since they already have unique numbers (different timestamps), but add a check.

**Estimate:** S (2 h) + migration
**Dependencies:** SM-002 (generateInvoices must be inside transaction first).

---

### TICKET: SM-006 — Invoice Overdue Auto-Flag Cron

#### Issue

Invoices past `dueDate` stay `UNPAID` forever. No job transitions them.

#### Expected Output

Every night at 00:05 UTC: all `UNPAID` invoices where `dueDate < now()` → `OVERDUE`. Client status recomputed.

#### Backend Steps

Add `@Cron('5 0 * * *')` in `InvoicesService` or a dedicated `InvoiceSchedulerService`:

```typescript
@Cron('5 0 * * *')
async flagOverdueInvoices(): Promise<void> {
  const now = new Date();

  const overdueInvoices = await this.prisma.invoice.findMany({
    where: { status: InvoiceStatus.UNPAID, dueDate: { lt: now } },
    select: { id: true, saleId: true },
  });

  if (!overdueInvoices.length) return;

  await this.prisma.invoice.updateMany({
    where: { id: { in: overdueInvoices.map((i) => i.id) } },
    data: { status: InvoiceStatus.OVERDUE },
  });

  // Recompute client status for affected clients
  const sales = await this.prisma.sale.findMany({
    where: { id: { in: overdueInvoices.map((i) => i.saleId) } },
    select: { clientId: true, organizationId: true },
  });

  const uniqueClients = [...new Map(sales.map((s) => [s.clientId, s])).values()];
  for (const { clientId, organizationId } of uniqueClients) {
    await this.clientStatusService.recompute(clientId, organizationId);
  }
}
```

**Frontend:** Overdue invoices highlighted in red in sales detail "Invoices" tab.

**Estimate:** S (1–2 h)
**Dependencies:** LM-013 (ClientStatusService).

---

### TICKET: SM-007 — Add Invoice to Existing Sale

#### Issue

Currently invoices are only auto-generated at sale creation. There is no way to add an ad-hoc invoice to an existing sale (e.g., for an extra service, a late fee).

#### Expected Output

"+ Add Invoice" button in the sale detail "Invoices" tab. Opens a mini form: amount, due date, notes.

#### Backend

`POST /invoices` already exists. Frontend just needs a connected form in the sale detail.

#### Frontend

```tsx
<Button size="sm" variant="outline" onClick={() => setAddInvoiceOpen(true)}>
  + Add Invoice
</Button>
```

Form sends: `{ saleId: sale.id, amount, dueDate, notes }`. On success, invalidate sale detail cache.

**Estimate:** XS (1 h)
**Dependencies:** SM-003 (sale detail sheet with Invoices tab).

---

## 7. Sale Notes & Activity Log

### TICKET: SM-008 — Sale Activity Log

#### Issue

There is no history for a sale. Who changed the status? When was the first payment made? Was there a note left by the account manager? None of this is tracked or visible.

#### Expected Output

A `SaleActivity` log table (same pattern as `LeadActivity` and `ClientActivity`). Every state change, payment, and manual note is logged. Visible in sale detail sheet.

#### Backend Steps

**Step 1 — Add `SaleActivity` model + `SaleActivityType` enum**

```prisma
model SaleActivity {
  id     String           @id @default(uuid())
  type   SaleActivityType
  data   Json

  saleId String
  sale   Sale   @relation(fields: [saleId], references: [id], onDelete: Cascade)

  userId String
  user   User   @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())

  @@index([saleId, createdAt])
}

enum SaleActivityType {
  CREATED
  STATUS_CHANGE
  PAYMENT_RECEIVED
  PAYMENT_FAILED
  REFUND_ISSUED
  CHARGEBACK_FILED
  INVOICE_ADDED
  NOTE
}
```

**Step 2 — Log activities across `SalesService`**

Calls to `this.prisma.saleActivity.create()`:
- In `create()` → `CREATED`
- In `update()` when status changes → `STATUS_CHANGE { from, to }`
- In `charge()` on success → `PAYMENT_RECEIVED { amount, transactionId }`
- In `charge()` on failure → `PAYMENT_FAILED { amount, reason }`
- In `refund()` → `REFUND_ISSUED { amount, reason }`
- In `recordChargeback()` → `CHARGEBACK_FILED { amount, outcome }`

**Step 3 — Add `POST /sales/:id/notes` endpoint**

```typescript
@Post(':id/notes')
addNote(
  @Param('id') id: string,
  @CurrentUser() user: JwtPayload,
  @Body() dto: AddNoteDto,
): Promise<ISaleActivity> {
  return this.salesService.addNote(id, user.orgId, user.sub, dto);
}
```

**Step 4 — Add `GET /sales/:id/activities` endpoint**

```typescript
@Get(':id/activities')
getActivities(
  @Param('id') id: string,
  @CurrentUser('orgId') orgId: string,
): Promise<ISaleActivity[]> {
  return this.salesService.getActivities(id, orgId);
}
```

**Step 5 — Update `ISale` types**

```typescript
export interface ISaleActivity {
  id:        string;
  type:      SaleActivityType;
  data:      Record<string, unknown>;
  saleId:    string;
  userId:    string;
  user?:     { id: string; name: string; avatarUrl?: string };
  createdAt: Date;
}
```

#### Frontend Steps

**Step 1 — Add "Activity" tab to sale detail sheet** (5th tab after Items)

**Step 2 — Render activity timeline**

Human-readable formatting:
```typescript
function formatSaleActivity(a: ISaleActivity): string {
  const actor = a.user?.name ?? 'System';
  switch (a.type) {
    case 'STATUS_CHANGE':
      return `${actor} changed status from ${a.data.from} → ${a.data.to}`;
    case 'PAYMENT_RECEIVED':
      return `${actor} recorded payment of $${a.data.amount}`;
    case 'REFUND_ISSUED':
      return `${actor} issued refund of $${a.data.amount}`;
    case 'NOTE':
      return (a.data as any).content;
    default:
      return a.type;
  }
}
```

**Step 3 — Notes section at bottom of Activity tab**

Same pattern as lead notes — textarea + Submit, with own-note delete.

**Estimate:** M (4 h) + migration
**Dependencies:** —

---

## 8. Recurring Sales (Subscription) Management

### TICKET: SM-009 — Subscription Dashboard & Status

#### Issue

Subscription sales exist in the DB (`subscriptionId` stored) but there is no UI to:
- See which subscriptions are active vs. cancelled.
- See next billing date.
- See billing history (recurring transactions).
- Cancel from the UI (endpoint exists — `/sales/:id/cancel-subscription`).

#### Expected Output

In the sale detail "Payments" tab, subscription sales show:

```
┌─────────────────────────────────────────────────┐
│  SUBSCRIPTION STATUS                            │
│  ● Active — Sub ID: arb-123456                  │
│  Next charge: Apr 1, 2026 · $1,500/month        │
│                                                 │
│  Recurring Transactions:                        │
│  ✓ Mar 1  $1,500  SUCCESS                       │
│  ✓ Feb 1  $1,500  SUCCESS                       │
│  ✗ Jan 1  $1,500  FAILED — Retried              │
│                                                 │
│  [Cancel Subscription]  (ADMIN only)            │
└─────────────────────────────────────────────────┘
```

#### Backend Steps

**Step 1 — Add `GET /sales/:id/subscription-status` endpoint**

Calls Authorize.net ARB API to fetch the subscription details (status, next billing date, amount):

```typescript
@Get(':id/subscription-status')
getSubscriptionStatus(@Param('id') id: string, @CurrentUser('orgId') orgId: string) {
  return this.salesService.getSubscriptionStatus(id, orgId);
}
```

```typescript
async getSubscriptionStatus(id: string, orgId: string) {
  const sale = await this.prisma.sale.findUnique({ where: { id } });
  if (!sale?.subscriptionId) throw new BadRequestException('No subscription on this sale');

  const status = await this.authorizeNet.getSubscription(sale.subscriptionId);
  const transactions = await this.prisma.paymentTransaction.findMany({
    where: { saleId: id, type: TransactionType.RECURRING },
    orderBy: { createdAt: 'desc' },
  });

  return { subscription: status, transactions };
}
```

**Step 2 — Recurring transaction logging**

When Authorize.net ARB fires a recurring charge (via webhook or polling), create a `PaymentTransaction` with `type: RECURRING`. Currently no webhook handler exists — add `POST /webhooks/authorize-net` as a future task.

#### Frontend Steps

- Add subscription status card to Payments tab.
- Show next billing date + amount from API response.
- "Cancel Subscription" button → confirm dialog → calls `POST /sales/:id/cancel-subscription`.

**Estimate:** M (3–4 h)
**Dependencies:** Authorize.net ARB `getSubscription` API method must be added to `AuthorizeNetService`.

---

## 9. Sale Visibility & Scoping Fixes

### TICKET: SM-010 — Fix UPSELL_AGENT Visibility After LM-004b

#### Issue

`SalesService.findAll()` scopes `UPSELL_AGENT` by reading `lead.assignedToId`:

```typescript
// CURRENT (broken after LM-012)
const agentLeads = await this.prisma.lead.findMany({
  where: { assignedToId: userId, deletedAt: null, convertedClientId: { not: null } },
  ...
});
```

After LM-004b, Upsell agents are assigned on the **Client** (`client.upsellAgentId`), not on the Lead. This query will miss clients that were auto-created from a sale (LM-012) and clients reassigned to a different upsell agent.

#### Fix

```typescript
// AFTER LM-004b: scope by client.upsellAgentId
if (role === UserRole.UPSELL_AGENT) {
  const upsellClients = await this.prisma.client.findMany({
    where: { upsellAgentId: userId, organizationId: orgId },
    select: { id: true },
  });
  where.clientId = { in: upsellClients.map((c) => c.id) };
}

// PROJECT_MANAGER: scope by client.projectManagerId
if (role === UserRole.PROJECT_MANAGER) {
  const pmClients = await this.prisma.client.findMany({
    where: { projectManagerId: userId, organizationId: orgId },
    select: { id: true },
  });
  where.clientId = { in: pmClients.map((c) => c.id) };
}
```

Also update `InvoicesService.findAll()` with the same fix.

**Estimate:** XS (1 h)
**Dependencies:** LM-004b (client assignments).

---

### TICKET: SM-011 — Sale Soft-Delete

#### Issue

`SalesService.remove()` throws `400` if any invoices exist. There is no soft-delete. Test/demo sales cannot be cleaned up.

#### Fix

Add `deletedAt DateTime?` to `Sale` schema. `remove()` sets `deletedAt`. All `findAll`/`findOne` filter `deletedAt: null`.

```prisma
model Sale {
  // ...
  deletedAt DateTime?
}
```

```typescript
async remove(id, orgId) {
  // ...guards...
  await this.prisma.sale.update({ where: { id }, data: { deletedAt: new Date() } });
  await this.cache.delByPrefix(`sales:${orgId}:`);
  return { message: 'Sale archived successfully' };
}
```

Hard delete available to OWNER only via `DELETE /sales/:id/hard`.

**Estimate:** S (1–2 h) + migration

---

## 10. Sales Analytics & Reporting

### TICKET: SM-012 — Fix Analytics Revenue Accuracy

*(Referenced from the main improvement plan. Full detail in docs/sales-dashboard-improvement-plan.md → SD-FIX-001)*

**Summary:** `analytics.service.ts` uses `sale.totalAmount` for revenue — contracted value. Replace with `paymentTransaction.aggregate({ _sum: { amount }, where: { status: 'SUCCESS' } })` for collected revenue. Return both.

**Estimate:** S (2 h)

---

### TICKET: SM-013 — Sales CSV Export

*(Referenced from main plan → SD-ADV-001)*

**Summary:** `GET /sales/export?status=&brandId=&dateFrom=&dateTo=` — streams CSV response using Node.js Readable, max 10,000 rows. Frontend: "Export CSV" button on sales list.

**Estimate:** M (3–4 h)

---

### TICKET: SM-014 — Sales Search (Full-Text)

*(Referenced from main plan → SD-ADV-003)*

**Summary:** Add `?search=` to `GET /sales`. Query matches `client.companyName`, `client.email`, `brand.name`, `sale.description`, `invoice.invoiceNumber`.

**Estimate:** M (3 h)

---

## 11. Implementation Order & Estimates

### Recommended Sequence

| # | Ticket | Depends On | Estimate | Notes |
|---|--------|------------|----------|-------|
| 1 | **SM-010** — Fix UPSELL_AGENT scoping | LM-004b | XS | Critical correctness fix — do immediately after LM-004b |
| 2 | **SM-002** — Sale form (payment plan + items) | — | M | Foundational — items need to exist before analytics |
| 3 | **SM-005** — Invoice number fix | SM-002 | S | Fix before any more sales are created |
| 4 | **SM-001** — Sale status ON_HOLD + REFUNDED | — | S | Migration batch with SM-005 |
| 5 | **SM-011** — Sale soft-delete | — | S | Migration batch with SM-001 + SM-005 |
| 6 | **SM-006** — Invoice overdue cron | LM-013 | S | Needs ClientStatusService from LM-013 |
| 7 | **SM-003** — Sale detail sheet rebuild | SM-002 | M | Needs items + invoices in DB |
| 8 | **SM-004** — Refund endpoint + UI | LM-013, SM-001 | S | Needs ClientStatusService + REFUNDED status |
| 9 | **SM-008** — Sale activity log | — | M | Migration |
| 10 | **SM-007** — Add invoice to existing sale | SM-003 | XS | Pure UI on top of existing API |
| 11 | **SM-009** — Subscription management | — | M | Needs AuthorizeNet.getSubscription() |
| 12 | **SM-012** — Analytics revenue fix | — | S | Fast win |
| 13 | **SM-013** — CSV export | — | M | Independent |
| 14 | **SM-014** — Full-text search | — | M | Independent |

### Migration Batches

| Batch | Tickets | Schema Changes |
|-------|---------|----------------|
| **Migration 1** | SM-001 + SM-011 | `SaleStatus` enum additions; `Sale.deletedAt` |
| **Migration 2** | SM-005 | New `InvoiceSequence` table |
| **Migration 3** | SM-008 | New `SaleActivity` table + `SaleActivityType` enum |

### Total Estimate

| Priority | Tickets | Estimate |
|----------|---------|----------|
| P0 — Bugs & correctness | SM-010, SM-005, SM-011 | ~4–5 h |
| P1 — Core features | SM-002, SM-001, SM-006, SM-003, SM-004 | ~14–17 h |
| P1 — Tracking | SM-008, SM-007 | ~5–6 h |
| P2 — Advanced | SM-009, SM-012, SM-013, SM-014 | ~12–14 h |

---

## Sizing Legend

| Size | Time |
|------|------|
| XS | < 1 h |
| S | 1–3 h |
| M | 3–6 h |
| L | 6–10 h |
| XL | 10+ h |
