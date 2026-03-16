# SM-FE-008 — Refund Modal & Chargeback Modal

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-008                                  |
| Title          | Refund Modal & Chargeback Modal            |
| Phase          | 2 — Frontend                               |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 6 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

Refunds and chargebacks are high-stakes financial operations requiring careful confirmation UI. Both actions are role-restricted and irreversible. The modals implement a two-step confirmation flow, contextual field rendering based on type, and clear error propagation from the gateway.

---

## User / Business Outcome

- OWNER and ADMIN users can issue refunds and record chargebacks directly from the sale detail page.
- The two-step confirmation flow prevents accidental financial actions.
- Gateway errors (e.g., Authorize.net rejection) are surfaced immediately with actionable messages.
- The activity timeline updates automatically after a successful refund or chargeback.

---

## Exact Scope

### In Scope

1. Create `RefundModal` component.
2. Create `ChargebackModal` component.
3. Both modals triggered from an actions menu on `SaleDetailPage` (added to `SaleDetailHeader`'s action buttons).
4. Role-gating: buttons hidden from non-OWNER/ADMIN roles.
5. Two-step confirmation for both modals.
6. Error message display from API.
7. Toast notification on success.
8. Query invalidation on success (sale detail + activity timeline reload).

### Out of Scope

- Automatic gateway chargeback filing.
- Partial refund cap validation against paid amounts (honor system in Phase 1).
- Viewing past refund/chargeback history directly from the modal (use activity timeline for that).

---

## Backend Tasks

None. Backend endpoints are implemented in SM-BE-009 (refund) and SM-BE-010 (chargeback).

---

## Frontend Tasks

### 1. Add Refund and Chargeback Buttons to `SaleDetailHeader`

**File:** `apps/frontend/components/sales/detail/SaleDetailHeader.tsx`

In the action buttons area (OWNER/ADMIN only):

```typescript
{(userRole === 'OWNER' || userRole === 'ADMIN') && (
  <>
    {(sale.status === 'ACTIVE' || sale.status === 'COMPLETED') && (
      <button onClick={() => setRefundModalOpen(true)}>
        Issue Refund
      </button>
    )}
    {sale.status !== 'DRAFT' && (
      <button onClick={() => setChargebackModalOpen(true)}>
        Record Chargeback
      </button>
    )}
  </>
)}
```

State management: `RefundModal` and `ChargebackModal` are rendered in `SaleDetailPage` with `isOpen` prop controlled by state.

### 2. Create `RefundModal` Component

**File:** `apps/frontend/components/sales/modals/RefundModal.tsx`

Props:
```typescript
interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  transactions: IPaymentTransaction[];  // for selecting transaction to refund
  totalAmount: number;
  discountedTotal?: number;
}
```

**Step 1 — Form:**

| Field            | Type                    | Required | Condition                             |
|------------------|-------------------------|----------|---------------------------------------|
| Refund Type      | Radio: FULL / PARTIAL / MANUAL | Yes |                                  |
| Amount           | Currency number input   | Yes      | Only PARTIAL and MANUAL               |
| Transaction Ref  | Select (from transactions list) | Recommended | Only FULL and PARTIAL        |
| Card Last Four   | Text input (4 digits)   | Recommended | Only FULL and PARTIAL              |
| Note             | Textarea (min 10 chars) | Required | Only MANUAL; optional for FULL/PARTIAL |

**Field behavior by refund type:**

- **FULL:** Amount field hidden (computed from sale total). Transaction ref and card last four shown. Note optional.
- **PARTIAL:** Amount field shown (required, positive number). Transaction ref and card last four shown. Note optional.
- **MANUAL:** Amount field shown (required). Transaction ref and card last four hidden. Note field required (min 10 chars).

**Validation (client-side):**
- PARTIAL: `amount > 0`.
- MANUAL: `note.length >= 10`.
- FULL/PARTIAL with transaction ref: Select from the dropdown of the sale's `CHARGE` type transactions.

**Step 2 — Confirmation:**

After filling out Step 1 and clicking "Continue":

```
⚠️ Confirm Refund

You are about to issue a PARTIAL refund of $250.00 against transaction #60015617285.

This action cannot be undone.

[Cancel]  [Issue Refund]
```

For MANUAL:
```
You are about to record a manual refund of $500.00.
Reason: Customer paid by check outside the gateway.

This will update the sale status to Refunded.

[Cancel]  [Issue Refund]
```

**On submit:**
- Disable "Issue Refund" button and show loading spinner.
- Call `POST /sales/:id/refund`.
- On success: close modal, show toast "Refund issued successfully", invalidate queries.
- On error: show error message in the modal (do NOT close modal). Common errors:
  - 502: "Gateway error: [message from API]"
  - 422: "Refund not allowed: [message]"
  - 403: "You do not have permission to issue refunds."

### 3. Create `ChargebackModal` Component

**File:** `apps/frontend/components/sales/modals/ChargebackModal.tsx`

Props:
```typescript
interface ChargebackModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
}
```

**Step 1 — Form:**

| Field           | Type                    | Required |
|-----------------|-------------------------|----------|
| Amount          | Currency number input   | Yes      |
| Notes           | Textarea (min 10 chars) | Yes      |
| Evidence URL    | URL text input          | No       |
| Chargeback Date | Date picker             | No (defaults to today) |

**Validation:**
- `amount > 0`.
- `notes.length >= 10`.
- `evidenceUrl`: if provided, must be a valid URL format.

**Step 2 — Confirmation:**

```
⚠️ Record Chargeback

You are about to record a chargeback of $1,500.00 dated Mar 15, 2026.

Notes: Customer disputed the charge with their bank.

Note: Recording this chargeback does NOT automatically respond to the dispute with Authorize.net.
Manual action in the merchant portal is required.

[Cancel]  [Record Chargeback]
```

**On submit:**
- Disable "Record Chargeback" button and show loading spinner.
- Call `POST /sales/:id/chargeback`.
- On success: close modal, show toast "Chargeback recorded", invalidate queries.
- On error: show error in modal.

### 4. Create `useRefund` and `useChargeback` Mutation Hooks

**File:** `apps/frontend/hooks/sales/useRefund.ts`

```typescript
export function useRefund(saleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRefundFormData) => issueRefund(saleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'summary'] });
    },
  });
}
```

**File:** `apps/frontend/hooks/sales/useChargeback.ts`

```typescript
export function useChargeback(saleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateChargebackFormData) => fileChargeback(saleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
    },
  });
}
```

**File:** `apps/frontend/api/sales.api.ts`

Add:
```typescript
export async function issueRefund(
  saleId: string,
  data: CreateRefundFormData,
): Promise<{ success: true; transactionId?: string }> {
  const response = await apiClient.post(`/sales/${saleId}/refund`, data);
  return response.data.data;
}

export async function fileChargeback(
  saleId: string,
  data: CreateChargebackFormData,
): Promise<{ success: true; paymentTransactionId: string }> {
  const response = await apiClient.post(`/sales/${saleId}/chargeback`, data);
  return response.data.data;
}
```

### 5. Transaction Selector in RefundModal

The `transactions` prop is an array of all payment transactions on the sale. Filter to show only `CHARGE` type transactions (or `AUTH_CAPTURE` — check the enum values in use). Present as a dropdown:

```
Select transaction to refund:
[ ] Transaction #60015617285 — $2,500.00 — Mar 10, 2026
[ ] Transaction #60015617299 — $2,500.00 — Apr 10, 2026
```

If no transactions exist (e.g., the sale was never charged), disable the FULL and PARTIAL refund types and show a hint "No chargeable transactions found. Use Manual refund."

---

## Component Tree

```
SaleDetailPage
├── SaleDetailHeader
│   └── ActionsMenu
│       ├── RefundButton (OWNER/ADMIN, ACTIVE/COMPLETED only)
│       └── ChargebackButton (OWNER/ADMIN, non-DRAFT only)
├── RefundModal
│   ├── Step1_RefundForm
│   │   ├── RefundTypeSelector (FULL/PARTIAL/MANUAL)
│   │   ├── AmountInput (conditional)
│   │   ├── TransactionSelector (conditional)
│   │   ├── CardLastFourInput (conditional)
│   │   └── NoteTextarea (conditional)
│   └── Step2_Confirmation
│       ├── ConfirmationSummary
│       └── ActionButtons (Cancel / Issue Refund)
└── ChargebackModal
    ├── Step1_ChargebackForm
    │   ├── AmountInput
    │   ├── NotesTextarea
    │   ├── EvidenceUrlInput
    │   └── DatePicker
    └── Step2_Confirmation
        ├── ConfirmationSummary
        └── ActionButtons (Cancel / Record Chargeback)
```

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

### `POST /sales/:id/refund` (SM-BE-009)

**Request:**
```json
{
  "type": "PARTIAL",
  "amount": 250.00,
  "transactionId": "60015617285",
  "cardLastFour": "1234",
  "note": "Client requested partial adjustment"
}
```

**Response:** `{ "data": { "success": true, "transactionId": "..." } }`

### `POST /sales/:id/chargeback` (SM-BE-010)

**Request:**
```json
{
  "amount": 1500.00,
  "notes": "Customer disputed charge citing non-delivery.",
  "evidenceUrl": "https://storage.example.com/evidence/cb001.pdf",
  "chargebackDate": "2026-03-15"
}
```

**Response:** `{ "data": { "success": true, "paymentTransactionId": "..." } }`

---

## Acceptance Criteria

1. "Issue Refund" button is visible on the sale detail page for OWNER and ADMIN only, and only when `sale.status` is ACTIVE or COMPLETED.
2. "Record Chargeback" button is visible for OWNER and ADMIN only, for any non-DRAFT sale.
3. Neither button is visible for SALES_MANAGER, agents, or PROJECT_MANAGER.
4. Opening `RefundModal` shows Step 1 form.
5. Selecting FULL refund type hides the Amount field and shows the Transaction selector.
6. Selecting PARTIAL refund type shows the Amount field and Transaction selector.
7. Selecting MANUAL refund type shows Amount and Note fields; hides Transaction and Card Last Four.
8. Clicking "Continue" on Step 1 with valid inputs advances to Step 2 confirmation.
9. Step 2 shows a clear, human-readable summary of the refund being issued.
10. Clicking "Issue Refund" calls `POST /sales/:id/refund` with correct payload.
11. Successful refund: modal closes, toast "Refund issued successfully", sale status badge updates to REFUNDED (for FULL/MANUAL).
12. API error: modal stays open, error message shown (do not close modal on error).
13. Submit button disabled during API call (loading state).
14. `ChargebackModal` Step 1 notes field shows error if fewer than 10 characters.
15. `ChargebackModal` `chargebackDate` defaults to today when not set.
16. Successful chargeback: modal closes, toast "Chargeback recorded", activity timeline updates.
17. Both modals can be closed without submitting by clicking Cancel or the × button.
18. Activity timeline on sale detail reflects the new REFUND_ISSUED or CHARGEBACK_FILED entry after successful submission.

---

## Edge Cases

1. **FULL refund with no transactions:** The Transaction selector shows empty state. Disable FULL refund type. Show: "No charged transactions found. Use Manual refund."
2. **PARTIAL amount exceeds total:** Client-side validation could warn if the entered amount is greater than `discountedTotal ?? totalAmount`. This is a soft warning only (Phase 1 does not track cumulative paid amount client-side).
3. **Modal opened and closed mid-form:** Form state is reset to blank when the modal reopens. Do not persist Step 1 state between opens.
4. **Gateway returns 502 error:** Display the gateway error message from `error.response.data.message`. Show: "Gateway error: [message]. Please try again or use Manual refund."
5. **Network timeout:** Show: "Request timed out. Please check your connection and try again." Do not show "success".
6. **Chargeback modal `evidenceUrl` validation:** Only validate URL format if the field is non-empty. Empty string should be allowed (the field is optional).

---

## Dependencies

- **SM-FE-004** — `SaleDetailHeader` and `SaleDetailPage` where modals are triggered.
- **SM-FE-005** — `transactions` array from `GET /sales/:id` is passed to `RefundModal`.
- **SM-BE-009** — Refund endpoint.
- **SM-BE-010** — Chargeback endpoint.

---

## Testing Requirements

### Unit Tests

**File:** `apps/frontend/components/sales/modals/__tests__/RefundModal.test.tsx`

- FULL type: Amount field is hidden.
- PARTIAL type: Amount field is visible and required.
- MANUAL type: Transaction and Card Last Four fields are hidden; Note is required.
- "Continue" button disabled when required fields are empty.
- Step 2 shows correct summary for each refund type.
- Submit button disabled during loading.

**File:** `apps/frontend/components/sales/modals/__tests__/ChargebackModal.test.tsx`

- Notes field shows error when fewer than 10 characters.
- Date defaults to today when not set.
- "Record Chargeback" disabled during loading.

### Integration Tests

- `RefundModal` submits FULL refund: verify `POST /sales/:id/refund` called with `type: 'FULL'`.
- `RefundModal` handles 502 error: verify error shown in modal.
- `ChargebackModal` submits: verify `POST /sales/:id/chargeback` called with correct body.
- After successful submission, `GET /sales/:id` is re-fetched (verify query invalidation).

### Manual QA Checks

- [ ] Log in as OWNER on an ACTIVE sale. Confirm "Issue Refund" and "Record Chargeback" buttons are visible.
- [ ] Log in as SALES_MANAGER. Confirm neither button is visible.
- [ ] Open Refund Modal. Select FULL. Complete Step 2. Submit. Confirm sale status updates to REFUNDED.
- [ ] Open Refund Modal. Select PARTIAL. Enter $250. Complete Step 2. Submit. Confirm sale status does NOT change.
- [ ] Open Refund Modal. Select MANUAL. Enter note < 10 chars. Confirm Step 1 shows validation error.
- [ ] Open Chargeback Modal. Enter notes < 10 chars. Confirm error shown.
- [ ] Open Chargeback Modal. Submit valid chargeback. Confirm toast and activity timeline update.
- [ ] Confirm both modals can be cancelled without submitting.
- [ ] Simulate API error: confirm error message shown in modal; modal stays open.

---

## Verification Steps

- [ ] `RefundModal` component created with two-step flow.
- [ ] `ChargebackModal` component created with two-step flow.
- [ ] "Issue Refund" button only visible for OWNER/ADMIN on ACTIVE/COMPLETED sales.
- [ ] "Record Chargeback" button only visible for OWNER/ADMIN on non-DRAFT sales.
- [ ] FULL/PARTIAL/MANUAL type switching correctly shows/hides fields.
- [ ] Step 2 confirmation shows human-readable summary.
- [ ] Submit button disabled during mutation.
- [ ] Error message shown in modal on API failure (modal stays open).
- [ ] Success: modal closes, toast shown, queries invalidated.
- [ ] `useRefund` and `useChargeback` mutation hooks created.
- [ ] API functions `issueRefund` and `fileChargeback` added to sales API file.
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No backend changes.** Frontend-only ticket.
- **High financial impact.** Ensure role-gating tests include negative cases. A bug that allows SALES_MANAGER to access refund functionality is a critical security issue.
- **Gateway errors must be user-friendly.** Authorize.net error codes and messages are not human-readable by default. Map common error codes to friendly messages (e.g., error code 54 = "The referenced transaction does not meet the criteria for issuing a credit" → display "Refund rejected: the original transaction is not eligible for a refund. Please use Manual refund.").
