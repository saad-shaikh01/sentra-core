# SM-FE-005 — Sale Detail Page: Items, Invoices, Transactions

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-005                                  |
| Title          | Sale Detail Page: Items, Invoices, Transactions |
| Phase          | 2 — Frontend                               |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 6 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The sale detail page needs to surface the financial breakdown of a sale: what was sold (items), what is owed (invoices), and what has been paid (transactions). This information is critical for collections, client disputes, and financial review.

---

## User / Business Outcome

- Sales managers and admins can see exactly what items make up a sale, including catalog-linked items.
- Finance staff can see invoice statuses and quickly identify overdue or unpaid invoices.
- Transaction history provides an audit-visible record of every payment attempt.

---

## Exact Scope

### In Scope

1. Create `SaleItemsSection` component — items/pricing breakdown with discount row and total.
2. Create `SaleInvoicesSection` component — invoice list with status badges and charge action.
3. Create `SaleTransactionsSection` component — payment transaction history.
4. Create `InvoiceStatusBadge` reusable component.
5. Create `TransactionStatusBadge` reusable component.
6. All data comes from the `GET /sales/:id` response (no additional API calls needed).

### Out of Scope

- Creating invoices manually (future).
- Editing existing invoices (future).
- Subscription section (SM-FE-006).
- Activity timeline (SM-FE-006).

---

## Backend Tasks

Verify that `GET /sales/:id` response includes:
- `items[]` with all SaleItem fields including `packageId` and `packageName` (SM-BE-002).
- `invoices[]` with full invoice data including `invoiceNumber`, `amount`, `dueDate`, `status`, `pdfUrl`.
- `transactions[]` with full PaymentTransaction data.

If any of these are missing from the `findOne()` include clause, update it:

```typescript
// apps/backend/core-service/src/modules/sales/sales.service.ts
const sale = await this.prisma.sale.findFirst({
  where: { id, organizationId, deletedAt: null },
  include: {
    items: true,
    invoices: { orderBy: { dueDate: 'asc' } },
    transactions: { orderBy: { createdAt: 'desc' } },
    activities: { orderBy: { createdAt: 'asc' } },
    // Include nested brand and client if not already present:
    // brand: { select: { id: true, name: true } },
    // client: { select: { id: true, name: true, email: true, phone: true } },
  },
});
```

---

## Frontend Tasks

### 1. Create `SaleItemsSection` Component

**File:** `apps/frontend/components/sales/detail/SaleItemsSection.tsx`

Props: `items: ISaleItem[]`, `totalAmount: number`, `discountType?: DiscountType`, `discountValue?: number`, `discountedTotal?: number`

**Items table:**

| Column        | Content                                              |
|---------------|------------------------------------------------------|
| Item Name     | Name; show package name in smaller text if `packageName` differs from name |
| Package       | `packageName` if linked; otherwise "Custom Item"    |
| Qty           | `quantity`                                           |
| Unit Price    | Formatted currency (`unitPrice`)                     |
| Custom Price  | Formatted currency if `customPrice` is set; "—" otherwise |
| Line Total    | `(customPrice ?? unitPrice) * quantity`, formatted   |

**Below the items table — totals section:**

```
Subtotal:                     $5,000.00
Discount (10%):               - $500.00     ← shown only if discountType is set
─────────────────────────────────────────
Total:                        $4,500.00
```

If `discountType` is `FIXED_AMOUNT`:
```
Discount (- $500.00):         - $500.00
```

If no discount:
```
Total:                        $5,000.00
```

### 2. Create `SaleInvoicesSection` Component

**File:** `apps/frontend/components/sales/detail/SaleInvoicesSection.tsx`

Props: `invoices: IInvoice[]`, `saleId: string`, `userRole: UserRole`

**Invoice list (table or card list):**

| Column         | Content                                              |
|----------------|------------------------------------------------------|
| Invoice #      | `invoiceNumber` (e.g., INV-2026-001)                |
| Amount         | Formatted currency                                   |
| Due Date       | Formatted date; "No due date" if null               |
| Status         | `InvoiceStatusBadge`                                 |
| Actions        | "Charge" button (OWNER/ADMIN only); PDF link if `pdfUrl` |

**Overdue highlighting:** Rows with `status: OVERDUE` or (`status: UNPAID` AND `dueDate < today`) have a red left border and the due date is shown in red.

**"Charge Invoice" action (OWNER/ADMIN only):**
- Opens a charge confirmation modal (uses existing charge endpoint from the codebase).
- This modal is a simple amount-confirmation dialog. It calls the existing `POST /sales/:id/charge` (or equivalent) endpoint — not a new endpoint.

### 3. Create `InvoiceStatusBadge` Component

**File:** `apps/frontend/components/sales/InvoiceStatusBadge.tsx`

| Status   | Color  |
|----------|--------|
| UNPAID   | Yellow |
| PAID     | Green  |
| OVERDUE  | Red    |

### 4. Create `SaleTransactionsSection` Component

**File:** `apps/frontend/components/sales/detail/SaleTransactionsSection.tsx`

Props: `transactions: IPaymentTransaction[]`

**Transactions table:**

| Column              | Content                                              |
|---------------------|------------------------------------------------------|
| Date                | `createdAt` formatted                               |
| Type                | Formatted type label (CHARGE, REFUND, CHARGEBACK, etc.) |
| Amount              | Formatted currency                                   |
| Status              | `TransactionStatusBadge`                            |
| Authorize.net Ref   | `transactionId` (truncated) or "—" if null          |
| Linked Invoice      | Invoice number if `invoiceId` is set; "—" otherwise |

**Failed transactions:** Rows with `status: FAILED` have a red background tint and a warning icon.

### 5. Create `TransactionStatusBadge` Component

**File:** `apps/frontend/components/sales/TransactionStatusBadge.tsx`

| Status   | Color  |
|----------|--------|
| SUCCESS  | Green  |
| FAILED   | Red    |
| PENDING  | Yellow |

### 6. Integrate Sections into `SaleDetailPage`

**File:** `SaleDetailPage` (created in SM-FE-004)

Add the three sections below `SaleStatusControls`:

```typescript
// After SaleStatusControls:
<SaleItemsSection
  items={sale.items}
  totalAmount={sale.totalAmount}
  discountType={sale.discountType}
  discountValue={sale.discountValue}
  discountedTotal={sale.discountedTotal}
/>
<SaleInvoicesSection
  invoices={sale.invoices}
  saleId={sale.id}
  userRole={currentUser.role}
/>
<SaleTransactionsSection
  transactions={sale.transactions}
/>
```

---

## Schema / Migration Impact

None. All data fields are already available in the `Sale`, `SaleItem`, `Invoice`, and `PaymentTransaction` models after SM-BE-001 through SM-BE-009.

---

## API / Contracts Affected

No new endpoints. All data comes from `GET /sales/:id`. The response must include `items`, `invoices`, and `transactions` arrays. Verify the backend `findOne()` includes all three.

---

## Acceptance Criteria

1. `SaleItemsSection` renders a row for every item in `sale.items`.
2. Items with `packageName` show the package name in a secondary label.
3. Line total is computed correctly as `(customPrice ?? unitPrice) * quantity`.
4. Subtotal row shows the sum of all line totals.
5. Discount row is shown only when `discountType` is set, with the correct label (percentage or fixed-amount).
6. Total row shows `discountedTotal` when discount is applied, `totalAmount` when no discount.
7. `SaleInvoicesSection` renders a row for every invoice.
8. Overdue invoices have red highlighting and the due date is shown in red.
9. `InvoiceStatusBadge` shows correct color for UNPAID, PAID, and OVERDUE.
10. "Charge Invoice" button is visible only to OWNER and ADMIN.
11. `SaleTransactionsSection` renders a row for every payment transaction.
12. Failed transactions have red background tint.
13. `TransactionStatusBadge` shows correct color for SUCCESS, FAILED, and PENDING.
14. If `sale.items` is empty, `SaleItemsSection` shows an empty state ("No items").
15. If `sale.invoices` is empty, `SaleInvoicesSection` shows an empty state ("No invoices").
16. If `sale.transactions` is empty, `SaleTransactionsSection` shows an empty state ("No transactions").

---

## Edge Cases

1. **`customPrice` set to 0:** Distinguish between "no custom price" (null) and "custom price of $0" (0.00). Show "$0.00" for explicit 0, not "—".
2. **Invoice with no `dueDate`:** Overdue check does not apply. Show "—" in Due Date column.
3. **Transaction with no `transactionId` (manual records):** Show "Manual" in the Authorize.net Ref column.
4. **Many items (50+):** Consider a "Show all items" toggle that collapses after the first 5 items. For Phase 1, show all items.
5. **Invoice `pdfUrl` is null:** Hide the PDF link. Do not render a broken link.
6. **`CHARGEBACK` transaction type:** Ensure the transaction type label shows "Chargeback" (not the raw enum value "CHARGEBACK").

---

## Dependencies

- **SM-FE-004** — `SaleDetailPage` scaffold and `useSaleDetail` hook.
- **SM-BE-002** — `packageId`/`packageName` fields on `SaleItem` in API response.
- **SM-BE-008** — Discount fields in API response.

---

## Testing Requirements

### Unit Tests

- `SaleItemsSection` renders correct line totals.
- `SaleItemsSection` shows discount row when `discountType` is set.
- `SaleItemsSection` hides discount row when `discountType` is null.
- `SaleItemsSection` shows package name for catalog-linked items.
- `InvoiceStatusBadge` renders correct colors.
- `TransactionStatusBadge` renders correct colors.
- `SaleInvoicesSection` highlights overdue rows.
- `SaleTransactionsSection` highlights failed rows.

### Integration Tests

- Load sale detail page with complete mocked data. Verify all three sections render without errors.
- OWNER role: verify "Charge Invoice" button is visible.
- SALES_MANAGER role: verify "Charge Invoice" button is hidden.

### Manual QA Checks

- [ ] Load a sale with multiple items, some catalog-linked. Verify all columns render correctly.
- [ ] Verify line totals and discount calculation match expected values.
- [ ] Load a sale with an overdue invoice. Confirm red highlighting.
- [ ] Load a sale with a failed transaction. Confirm red background.
- [ ] Log in as OWNER. Confirm "Charge Invoice" button is visible.
- [ ] Log in as SALES_MANAGER. Confirm "Charge Invoice" button is hidden.

---

## Verification Steps

- [ ] `SaleItemsSection` component created and integrated.
- [ ] `SaleInvoicesSection` component created and integrated.
- [ ] `SaleTransactionsSection` component created and integrated.
- [ ] `InvoiceStatusBadge` component created.
- [ ] `TransactionStatusBadge` component created.
- [ ] Discount row shown/hidden based on `discountType`.
- [ ] Overdue invoice detection uses `dueDate < today` logic (not just `status === OVERDUE`).
- [ ] "Charge Invoice" button gated to OWNER/ADMIN.
- [ ] Empty states for all three sections.
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No backend changes.** Frontend-only ticket.
- **Risk: Backend `findOne()` not including all relations.** If `items`, `invoices`, or `transactions` are not included in the `findOne()` Prisma query, those arrays will be `undefined` in the API response and the components will crash. Verify the backend includes all relations before implementing this ticket.
