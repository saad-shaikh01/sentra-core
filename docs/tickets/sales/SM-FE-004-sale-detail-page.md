# SM-FE-004 — Sale Detail Page: Header, Client Section, Status Controls

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-004                                  |
| Title          | Sale Detail Page: Header, Client Section, Status Controls |
| Phase          | 2 — Frontend                               |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 7 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The sale detail page is the primary workspace for managing an individual sale. This ticket covers the page scaffolding plus the first three sections: the header (sale metadata and action buttons), the client/lead information section, and the status controls panel (allowing authorized users to advance the sale through its lifecycle).

---

## User / Business Outcome

- Staff can view all key sale metadata at a glance.
- Authorized users can transition sale status directly from the detail page without navigating to an edit form.
- The client collision warning (if present) is displayed so staff can review and correct if needed.

---

## Exact Scope

### In Scope

1. Create `SaleDetailPage` route component at `/sales/:id`.
2. Create `SaleDetailHeader` component.
3. Create `SaleClientSection` component.
4. Create `SaleStatusControls` component.
5. Create `StatusTransitionModal` component (confirmation dialog).
6. Fetch sale detail from `GET /sales/:id` using React Query.
7. Role-aware rendering of action buttons (Edit, Archive).
8. Collision warning banner if `collisionWarning` was associated with the sale.

### Out of Scope

- Items/pricing section (SM-FE-005).
- Invoices and transactions sections (SM-FE-005).
- Subscription section (SM-FE-006).
- Activity timeline (SM-FE-006).

---

## Backend Tasks

None. All backend changes are in prior tickets. Confirm the `GET /sales/:id` response shape matches the expected contract before implementing.

---

## Frontend Tasks

### 1. Create `SaleDetailPage` Route

**File:** Appropriate route file for the project's routing convention (e.g., `apps/frontend/app/(dashboard)/sales/[id]/page.tsx` for Next.js App Router).

```typescript
// SaleDetailPage
// - Fetches sale detail via useSaleDetail(id) hook
// - Renders: SaleDetailHeader, SaleClientSection, SaleStatusControls,
//            SaleItemsSection (SM-FE-005), SaleInvoicesSection (SM-FE-005),
//            SaleTransactionsSection (SM-FE-005), SaleSubscriptionSection (SM-FE-006),
//            SaleActivityTimeline (SM-FE-006)
// - Loading state: page skeleton
// - Error state: "Sale not found" with back button
```

### 2. Create `useSaleDetail` React Query Hook

**File:** `apps/frontend/hooks/sales/useSaleDetail.ts`

```typescript
export function useSaleDetail(id: string) {
  return useQuery({
    queryKey: ['sales', 'detail', id],
    queryFn: () => fetchSaleDetail(id),
    enabled: !!id,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // Do not retry on 404
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });
}
```

### 3. Create `SaleDetailHeader` Component

**File:** `apps/frontend/components/sales/detail/SaleDetailHeader.tsx`

Props: `sale: ISale`, `userRole: UserRole`

Displays:
- Sale ID: Truncated UUID (first 8 chars) with a copy-to-clipboard button. Full UUID shown in tooltip.
- `SaleStatusBadge` (from SM-FE-001).
- Total Amount: Formatted currency.
- Discounted Total: Shown as a separate line below total amount, only if `discountedTotal` is not null. Include a small discount label: "(10% discount applied)" or "(- $500 discount)".
- Payment Plan chip: ONE_TIME / INSTALLMENTS (n payments) / SUBSCRIPTION.
- Brand Name.
- Created date (e.g., "Created Mar 17, 2026") and Updated date.
- **Action buttons (right side, role-gated):**
  - "Edit Sale" button: visible for OWNER, ADMIN, SALES_MANAGER; also FRONTSELL/UPSELL_AGENT for their scoped sales. Navigates to edit form or opens edit modal (per SM-FE-007).
  - "Archive Sale" button: visible for OWNER and ADMIN only. Opens confirmation dialog.

### 4. Create `SaleClientSection` Component

**File:** `apps/frontend/components/sales/detail/SaleClientSection.tsx`

Props: `sale: ISale`

**Client sub-section:**
- Client name (linked to `/clients/:clientId` if the route exists).
- Client email.
- Client phone.

**Lead linkage sub-section (conditional — only if `sale.leadId` is set):**
- Lead title/summary.
- Lead current status badge.
- Link to `/leads/:leadId`.

**Collision warning banner (conditional — only if a `collisionWarning` is stored or returned):**

```
⚠️ Client Collision Warning
This sale was linked to client "John Doe" (john@example.com) via email match.
This may not be the same person as the original lead. Please verify the client assignment.
[Review Client]
```

Banner styling: yellow/amber background, warning icon, dismissible.

**Implementation note on collision warning:** The `collisionWarning` object is returned in the `POST /sales` response (creation-only). It is NOT stored on the Sale record in Phase 1. Therefore, the warning banner can only be shown immediately after creation (e.g., by passing it via URL state or localStorage after the create form redirects). If the user navigates away and comes back, the banner will NOT reappear. Document this limitation. Phase 2 can add a `metadata` column to `Sale` for persistence.

### 5. Create `SaleStatusControls` Component

**File:** `apps/frontend/components/sales/detail/SaleStatusControls.tsx`

Props: `sale: ISale`, `userRole: UserRole`, `onStatusChange: (newStatus: SaleStatus) => void`

Logic:
1. Compute allowed next transitions based on `sale.status` and `userRole` using the same transition matrix as the backend. Do NOT call the backend to get allowed transitions — compute client-side using a frontend copy of the `SALE_STATUS_TRANSITIONS` and `SALE_TRANSITION_ROLE_REQUIREMENTS` constants.
2. Render a button for each allowed transition. Examples:
   - DRAFT → PENDING: "Submit for Processing" button
   - PENDING → ACTIVE: "Mark as Active" button
   - ACTIVE → COMPLETED: "Mark as Completed" button
   - ACTIVE → ON_HOLD: "Put On Hold" button
   - ON_HOLD → ACTIVE: "Resume" button
   - Any → CANCELLED: "Cancel Sale" button (red)
   - Any → REFUNDED: "Issue Refund" button (redirects to refund modal in SM-FE-008)
3. If no transitions are available (terminal states CANCELLED/REFUNDED), show a "No further actions available" chip.

**Clicking any transition button** opens `StatusTransitionModal` for confirmation.

### 6. Create `StatusTransitionModal` Component

**File:** `apps/frontend/components/sales/detail/StatusTransitionModal.tsx`

Props: `isOpen: boolean`, `fromStatus: SaleStatus`, `toStatus: SaleStatus`, `onConfirm: () => void`, `onCancel: () => void`, `isLoading: boolean`

Modal content:
- Title: "Confirm Status Change"
- Body: "Change sale status from **[FROM]** to **[TO]**?"
- For CANCELLED transition: Show a "Reason (optional)" textarea.
- Warning for irreversible transitions (CANCELLED, REFUNDED): "This action cannot be easily undone."
- Confirm button: "Confirm" (disabled while loading).
- Cancel button: "Cancel".

On confirm:
```typescript
// Call PATCH /sales/:id with { status: toStatus }
// On success: invalidate sale detail query, close modal, show success toast
// On error: show error message in modal, do not close
```

### 7. Create API Mutation for Status Update

**File:** `apps/frontend/hooks/sales/useSaleStatusUpdate.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useSaleStatusUpdate(saleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newStatus: SaleStatus) =>
      patchSaleStatus(saleId, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'summary'] });
    },
  });
}
```

---

## Component Tree (This Ticket)

```
SaleDetailPage
├── PageHeader (breadcrumb: Sales > Sale #XXXXX, back link)
├── SaleDetailHeader
│   ├── SaleStatusBadge
│   ├── PaymentPlanChip
│   └── ActionButtons (Edit, Archive — role-gated)
├── SaleClientSection
│   ├── ClientInfoCard
│   ├── LeadLinkageCard (conditional)
│   └── CollisionWarningBanner (conditional)
└── SaleStatusControls
    ├── TransitionButton[] (per allowed transition)
    └── StatusTransitionModal
        └── ReasonTextarea (conditional for CANCELLED)
```

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

### `GET /sales/:id` — Used By This Component

The response must include:
- `id`, `status`, `totalAmount`, `discountedTotal`, `discountType`, `discountValue`
- `paymentPlan`, `installmentCount`
- `brandId`, `brand.name`
- `clientId`, `client.name`, `client.email`, `client.phone`
- `leadId` (if linked)
- `createdAt`, `updatedAt`

Verify the backend enriches the `GET /sales/:id` response with nested `brand` and `client` fields. If not, add an `include` in `findOne()`.

### `PATCH /sales/:id` — Used for Status Transitions

Only sends `{ status: newStatus }` for pure status transitions.

---

## Acceptance Criteria

1. Navigating to `/sales/:id` loads and renders the sale detail page.
2. `SaleDetailHeader` displays sale ID (truncated), status badge, total amount, payment plan, brand, and dates.
3. `SaleDetailHeader` shows `discountedTotal` and discount details when `discountedTotal` is not null.
4. "Edit Sale" button is visible for OWNER/ADMIN/SALES_MANAGER but hidden for PROJECT_MANAGER.
5. "Archive Sale" button is visible only for OWNER and ADMIN.
6. `SaleClientSection` displays client name, email, and phone.
7. `SaleClientSection` shows the lead linkage section when `sale.leadId` is set.
8. `SaleStatusControls` shows only the transitions allowed for the current sale status and user role.
9. `SaleStatusControls` shows no buttons for CANCELLED and REFUNDED sales (terminal states).
10. Clicking a transition button opens `StatusTransitionModal`.
11. Confirming a transition calls `PATCH /sales/:id` and updates the status badge on success.
12. A toast notification appears on successful status change.
13. If `PATCH /sales/:id` returns 422 (invalid transition), the modal shows the error message.
14. If `PATCH /sales/:id` returns 403 (insufficient role), the modal shows the error message.
15. The CANCELLED transition modal includes an optional reason textarea.
16. Loading state shows a page skeleton while `GET /sales/:id` is pending.
17. Error state shows "Sale not found" when the API returns 404.

---

## Edge Cases

1. **Sale has no brand assigned:** Brand field shows "—" or is hidden.
2. **Sale has no client (orphaned):** Client section shows "No client linked" placeholder.
3. **`discountedTotal` same as `totalAmount`:** Do not show the discount row (this would happen if discountValue is 0, but validation prevents that — still defensive check).
4. **User is FRONTSELL_AGENT on an unscoped sale:** The API returns 403 on `GET /sales/:id`. The error state must handle 403 with a "You do not have permission to view this sale" message.
5. **Status transition button click during pending mutation:** Disable all transition buttons while a mutation is in flight.

---

## Dependencies

- **SM-FE-001** — `SaleStatusBadge` component created in SM-FE-001.
- **SM-BE-003** — Status transition validation on backend.
- **SM-BE-005** — Role-gating on backend.
- Auth context providing current user's role.

---

## Testing Requirements

### Unit Tests

- `SaleDetailHeader` renders correct discount info when `discountedTotal` is present.
- `SaleDetailHeader` hides discount info when `discountedTotal` is null.
- `SaleStatusControls` renders correct transition buttons for DRAFT status + OWNER role.
- `SaleStatusControls` renders correct transition buttons for DRAFT status + FRONTSELL_AGENT role.
- `SaleStatusControls` renders no buttons for CANCELLED status.
- `StatusTransitionModal` shows reason textarea when `toStatus` is CANCELLED.

### Integration Tests

- Load sale detail page with mocked API. Verify header data renders.
- Click a transition button. Verify modal opens. Confirm. Verify `PATCH /sales/:id` called.
- Backend returns 422. Verify error shown in modal.

### Manual QA Checks

- [ ] Load a DRAFT sale. Confirm "Submit for Processing" button is shown.
- [ ] Click "Submit for Processing" with OWNER JWT. Confirm modal opens. Confirm. Confirm status badge updates to PENDING.
- [ ] Load a CANCELLED sale. Confirm no transition buttons are shown.
- [ ] Log in as PROJECT_MANAGER. Confirm "Edit Sale" button is hidden.
- [ ] Log in as SALES_MANAGER. Attempt to trigger REFUNDED transition. Confirm button is not shown (SALES_MANAGER cannot refund).
- [ ] Load a sale with a lead linkage. Confirm lead section is visible.

---

## Verification Steps

- [ ] `SaleDetailPage` route exists at `/sales/:id`.
- [ ] `useSaleDetail` hook created with correct query key.
- [ ] `SaleDetailHeader` renders all required fields.
- [ ] `SaleClientSection` renders client and lead info.
- [ ] `SaleStatusControls` computes allowed transitions client-side.
- [ ] `StatusTransitionModal` opens on transition button click.
- [ ] Successful transition invalidates detail, list, and summary queries.
- [ ] Toast notification on successful transition.
- [ ] Error message shown in modal on 422/403 responses.
- [ ] Role-based visibility correct for all action buttons.
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No backend changes.** Frontend-only ticket.
- **Risk: Client-side transition matrix drift.** If the backend `SALE_STATUS_TRANSITIONS` is updated but the frontend copy is not, users will see buttons that fail with 422. Maintain a shared TypeScript constants file (or import from a shared lib) to keep both in sync. Consider creating `libs/sales-constants/` for shared transition and role constants.
