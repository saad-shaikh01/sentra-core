# SM-FE-006 — Sale Detail Page: Subscription & Activity Timeline

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-006                                  |
| Title          | Sale Detail Page: Subscription & Activity Timeline |
| Phase          | 2 — Frontend                               |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 6 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

Subscriptions require dedicated visibility on the sale detail page since they have ongoing lifecycle events. The activity timeline provides a complete, chronological audit trail of every action taken on a sale — essential for dispute resolution, performance review, and staff accountability.

---

## User / Business Outcome

- Staff can see subscription status and cancel it directly from the sale detail page.
- The activity timeline gives full traceability of who did what and when on every sale.
- Any authorized user can add a note to a sale for communication or documentation purposes.

---

## Exact Scope

### In Scope

1. Create `SaleSubscriptionSection` component (conditional on `paymentPlan === 'SUBSCRIPTION'`).
2. Create `SaleActivityTimeline` component.
3. Create `ActivityTimelineEntry` component.
4. Create `AddNoteModal` component.
5. Wire "Add Note" action to `POST /sales/:id/note` endpoint (from SM-BE-007).
6. Wire "Cancel Subscription" button to the existing cancel-subscription endpoint (verify its path).

### Out of Scope

- Editing past activity entries.
- Deleting activity entries.
- Pagination of the activity timeline (Phase 1 shows all entries).

---

## Backend Tasks

### Verify Cancel Subscription Endpoint

Find the existing cancel-subscription endpoint in `sales.controller.ts`. Verify:
- Route path (e.g., `POST /sales/:id/cancel-subscription` or similar).
- Required role (should be OWNER/ADMIN only).
- Response shape.

If the endpoint does not exist, add it to this ticket's backend tasks:

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Post(':id/cancel-subscription')
@Roles(UserRole.OWNER, UserRole.ADMIN)
async cancelSubscription(
  @Param('id') id: string,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<{ success: true }>> {
  const result = await this.salesService.cancelSubscription(
    id,
    organizationId,
    user.sub,
  );
  return CommApiResponse.success(result);
}
```

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

If `cancelSubscription()` method does not exist, implement it (calls Authorize.net ARB cancel API and logs STATUS_CHANGE activity).

---

## Frontend Tasks

### 1. Create `SaleSubscriptionSection` Component

**File:** `apps/frontend/components/sales/detail/SaleSubscriptionSection.tsx`

Props: `sale: ISale`, `userRole: UserRole`

**Rendered only when `sale.paymentPlan === 'SUBSCRIPTION'`.**

Displays:
- Subscription ID (formatted: first 12 chars + "..." with copy button).
- Subscription status (derived from sale status: ACTIVE = subscription active, CANCELLED/REFUNDED = cancelled, PENDING = pending activation).
- "Cancel Subscription" button: visible only for OWNER and ADMIN; disabled if sale is already CANCELLED or REFUNDED.

**Cancel Subscription button:**
- Opens a confirmation modal: "Are you sure you want to cancel this subscription? The customer will no longer be billed."
- On confirm: calls `POST /sales/:id/cancel-subscription`.
- On success: invalidates sale detail query, shows success toast.
- On error: shows error message in modal.

```typescript
// useCancelSubscription hook
export function useCancelSubscription(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelSaleSubscription(saleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
    },
  });
}
```

### 2. Create `SaleActivityTimeline` Component

**File:** `apps/frontend/components/sales/detail/SaleActivityTimeline.tsx`

Props: `activities: ISaleActivity[]`, `saleId: string`, `userRole: UserRole`

Layout: A vertical timeline (like a log feed):
- Most recent activities at the bottom (or top — use whatever is standard in the design system; document the choice).
- Each entry rendered by `ActivityTimelineEntry`.
- "Add Note" button at the bottom of the timeline (or top — be consistent with reading order).

Empty state: "No activity yet." (Should not occur after SM-BE-007 is implemented, since CREATED is always logged.)

### 3. Create `ActivityTimelineEntry` Component

**File:** `apps/frontend/components/sales/detail/ActivityTimelineEntry.tsx`

Props: `activity: ISaleActivity`

**Layout per entry:**
- Left: Vertical line connector + circle icon (color-coded by type — see below).
- Right:
  - Activity type label (formatted — see type label mapping below).
  - Data summary (human-readable summary of `activity.data`).
  - Timestamp: `activity.createdAt` formatted as "Mar 17, 2026 at 10:42 AM".
  - Actor: "by [userId]" — Note: for Phase 1, `userId` is a raw UUID; Phase 2 should resolve to user name. Show a short ID or "System" for webhook-triggered activities.

**Activity type label and color mapping:**

| Activity Type      | Label                    | Circle Color |
|--------------------|--------------------------|--------------|
| CREATED            | Sale Created             | Blue         |
| STATUS_CHANGE      | Status Changed           | Blue         |
| INVOICE_CREATED    | Invoice Generated        | Blue         |
| INVOICE_UPDATED    | Invoice Updated          | Blue         |
| PAYMENT_RECEIVED   | Payment Received         | Green        |
| PAYMENT_FAILED     | Payment Failed           | Red          |
| REFUND_ISSUED      | Refund Issued            | Purple       |
| CHARGEBACK_FILED   | Chargeback Filed         | Red          |
| NOTE               | Note Added               | Gray         |
| MANUAL_ADJUSTMENT  | Manual Adjustment        | Orange       |
| DISCOUNT_APPLIED   | Discount Applied         | Yellow       |

**Data summary rendering:**

For each type, render a human-readable summary from `activity.data`:

- CREATED: "Sale created with status {status}, total ${amount}, plan {paymentPlan}"
- STATUS_CHANGE: "Status changed from **{from}** to **{to}**" (for ARCHIVED: "Sale archived")
- PAYMENT_RECEIVED: "Payment of ${amount} received (Ref: {transactionId})"
- PAYMENT_FAILED: "Payment of ${amount} failed — {reason}"
- REFUND_ISSUED: "{type} refund of ${amount} issued"
- CHARGEBACK_FILED: "Chargeback of ${amount} filed — {notes}"
- NOTE: "{note}"
- DISCOUNT_APPLIED: "{discountType} discount of {discountValue}% applied, total reduced to ${discountedTotal}"
- INVOICE_CREATED: "Invoice #{invoiceNumber} created for ${amount}"
- INVOICE_UPDATED: "Invoice #{invoiceNumber} status: {oldStatus} → {newStatus}"

If `activity.data` is missing an expected field, fall back gracefully (show the type label only, no crash).

### 4. Create `AddNoteModal` Component

**File:** `apps/frontend/components/sales/detail/AddNoteModal.tsx`

Props: `isOpen: boolean`, `saleId: string`, `onClose: () => void`

Content:
- Title: "Add Note"
- Textarea: placeholder "Enter a note... (minimum 1 character)"
- Character counter (0 / 2000 max)
- Submit button: "Add Note"
- Cancel button

On submit: calls `POST /sales/:id/note` with `{ note: text }`.
On success: closes modal, shows toast "Note added", invalidates sale detail query.
On error: shows error in modal.

```typescript
export function useAddSaleNote(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => addSaleNote(saleId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
    },
  });
}
```

Add `addSaleNote()` to `apps/frontend/api/sales.api.ts`:

```typescript
export async function addSaleNote(saleId: string, note: string): Promise<{ success: true }> {
  const response = await apiClient.post(`/sales/${saleId}/note`, { note });
  return response.data.data;
}
```

### 5. Integrate Sections into `SaleDetailPage`

**File:** `SaleDetailPage` (from SM-FE-004)

Add the two sections at the bottom:

```typescript
{sale.paymentPlan === 'SUBSCRIPTION' && (
  <SaleSubscriptionSection sale={sale} userRole={currentUser.role} />
)}
<SaleActivityTimeline
  activities={sale.activities}
  saleId={sale.id}
  userRole={currentUser.role}
/>
```

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

### `GET /sales/:id` — Activities Array

The `activities` array in the response is populated after SM-BE-007. Each entry:
```json
{
  "id": "act_001",
  "type": "CREATED",
  "data": { "totalAmount": 5000, "status": "DRAFT" },
  "userId": "usr_abc",
  "createdAt": "2026-03-17T10:00:00.000Z"
}
```

### `POST /sales/:id/note` (New — from SM-BE-007)

Request: `{ "note": "Client requested extension" }`
Response: `{ "data": { "success": true } }`

### `POST /sales/:id/cancel-subscription`

Verify path and response from existing codebase or SM-BE-007 scope.

---

## Acceptance Criteria

1. `SaleSubscriptionSection` renders only when `sale.paymentPlan === 'SUBSCRIPTION'`.
2. `SaleSubscriptionSection` shows subscription ID, derived status, and cancel button.
3. "Cancel Subscription" button is visible only for OWNER and ADMIN.
4. Clicking "Cancel Subscription" opens a confirmation modal.
5. Confirming cancellation calls the cancel-subscription endpoint and updates the page.
6. `SaleActivityTimeline` renders all activity entries in chronological order.
7. Each `ActivityTimelineEntry` shows the correct type label, color-coded icon, data summary, and timestamp.
8. PAYMENT_RECEIVED entries have green icons; PAYMENT_FAILED have red icons.
9. NOTE entries render the note text from `activity.data.note`.
10. "Add Note" button opens `AddNoteModal`.
11. Submitting a note calls `POST /sales/:id/note`.
12. After submitting a note, the activity timeline updates with the new NOTE entry (query invalidated).
13. `AddNoteModal` shows a character counter (0–2000).
14. Empty note submission is prevented (submit button disabled when textarea is empty).
15. `SaleActivityTimeline` shows "No activity yet." when `activities` array is empty.

---

## Edge Cases

1. **Sale with no `subscriptionId` but `paymentPlan === 'SUBSCRIPTION':** The subscription section shows "Subscription not yet activated" and no subscription ID.
2. **`activity.data` is null:** All data summary renderers must handle `null` data gracefully — show only the type label.
3. **Very long note text:** The NOTE entry should wrap text, not overflow. Apply `word-break: break-word` or equivalent Tailwind class.
4. **Webhook-triggered activity with `userId: 'system'`:** Show "System" as the actor label instead of a UUID.
5. **Timeline with 200+ entries:** Phase 1 renders all entries. If there are performance concerns, add a "Show older activities" expand button to limit the initial render to the 20 most recent.

---

## Dependencies

- **SM-FE-004** — `SaleDetailPage` scaffold.
- **SM-FE-005** — `SaleDetailPage` with items/invoices/transactions sections.
- **SM-BE-007** — `POST /sales/:id/note` endpoint and activity logging.
- Auth context providing current user's role.

---

## Testing Requirements

### Unit Tests

- `ActivityTimelineEntry` renders correct label and color for each `SaleActivityType`.
- `ActivityTimelineEntry` handles null `data` without crashing.
- `ActivityTimelineEntry` renders NOTE entry with note text.
- `SaleActivityTimeline` renders empty state when `activities` is empty.
- `AddNoteModal` disables submit when textarea is empty.
- `SaleSubscriptionSection` does not render when `paymentPlan !== 'SUBSCRIPTION'`.
- `SaleSubscriptionSection` hides cancel button for SALES_MANAGER.

### Integration Tests

- Load sale detail with subscription. Verify subscription section visible.
- Load sale detail without subscription. Verify subscription section hidden.
- Click "Add Note". Enter text. Submit. Verify `POST /sales/:id/note` called. Verify activities refetched.

### Manual QA Checks

- [ ] Load a SUBSCRIPTION sale. Confirm subscription section renders.
- [ ] Load a ONE_TIME sale. Confirm subscription section is hidden.
- [ ] View activity timeline. Confirm entries are sorted chronologically.
- [ ] Add a note via the modal. Confirm it appears in the timeline.
- [ ] Verify PAYMENT_RECEIVED entries have green icons.
- [ ] Verify PAYMENT_FAILED entries have red icons.
- [ ] Log in as SALES_MANAGER. Confirm cancel subscription button is hidden.
- [ ] Log in as OWNER. Confirm cancel subscription button is visible.

---

## Verification Steps

- [ ] `SaleSubscriptionSection` conditionally renders for SUBSCRIPTION sales.
- [ ] `SaleSubscriptionSection` shows correct subscription ID and status.
- [ ] Cancel subscription confirmation modal implemented.
- [ ] `SaleActivityTimeline` renders all entries sorted chronologically.
- [ ] `ActivityTimelineEntry` color-coded by type.
- [ ] `ActivityTimelineEntry` renders data summary for all type mappings.
- [ ] `AddNoteModal` opens on "Add Note" click.
- [ ] `POST /sales/:id/note` called on note submit.
- [ ] Activity timeline invalidated and re-fetched after note added.
- [ ] Empty state for empty activity array.
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema changes.** Frontend-only (plus potentially adding cancel-subscription endpoint if missing).
- **Risk: Activity data shape inconsistency.** Different activity types store different shapes in `data`. The renderer must be defensive about missing fields to avoid crashes when viewing sales with activities logged by different versions of the backend.
