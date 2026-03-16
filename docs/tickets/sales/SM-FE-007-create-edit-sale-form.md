# SM-FE-007 — Create / Edit Sale Form

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-FE-007                                  |
| Title          | Create / Edit Sale Form                    |
| Phase          | 2 — Frontend                               |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 10 hours                                   |
| Assignee       | TBD                                        |

---

## Purpose

Staff need a comprehensive, validated form to create new sales and edit existing ones. The form handles client/lead selection, line items (with catalog picker and free-form entry), discount application, and live total calculation.

---

## User / Business Outcome

- Sales can be created rapidly with pre-filled catalog items, reducing data entry errors.
- Live discount calculation eliminates the need for manual arithmetic.
- Agents can create scoped sales for their clients directly from the form.
- Edit mode allows modifying DRAFT/PENDING sales without starting over.

---

## Exact Scope

### In Scope

1. Create `SaleFormModal` or `SaleFormPage` component for both create and edit modes.
2. Create `SaleItemsEditor` sub-component for item management.
3. Create `PackageCatalogPicker` typeahead component.
4. Create `DiscountSection` sub-component.
5. Create `SaleSummaryPreview` sub-component showing live totals.
6. Client-side validation mirroring backend business rules.
7. Collision warning display after successful creation.
8. Role-based form field restrictions (agents cannot set financial totals directly).

### Out of Scope

- Contract file upload (future — `contractUrl` accepts a text URL for now).
- Multi-currency selection UI.
- Tax line items.
- Item-level discounts.

---

## Backend Tasks

### Verify Package Catalog API

Before implementing `PackageCatalogPicker`, determine:
1. Does a packages/catalog API endpoint exist? (Search for `PackagesController`, `CatalogController`, or `GET /packages` in the codebase.)
2. If yes: what is the endpoint path, query params (search), and response shape?
3. If no: the `PackageCatalogPicker` must degrade gracefully to free-form-only entry. Add a TODO comment and a visual indicator that catalog search is unavailable.

Document the finding in the PR description.

---

## Frontend Tasks

### 1. Create `SaleFormModal` / `SaleFormPage` Component

**File:** `apps/frontend/components/sales/form/SaleFormModal.tsx` (prefer modal for create; page for edit — or use modal for both)

**Decision:** Use a modal for both create and edit to avoid navigation complexity. If the design system requires full-page forms, use a page instead. Document the decision.

**Props:**
```typescript
interface SaleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId?: string;       // if set, form is in edit mode
  defaultLeadId?: string; // pre-fill lead from lead detail page
  defaultClientId?: string; // pre-fill client
}
```

**Form state management:** Use `react-hook-form` with `zod` schema validation (or the project's established form library — do not introduce a new one).

**Form fields:**

| Field             | Type                            | Required | Condition                          |
|-------------------|---------------------------------|----------|------------------------------------|
| Client            | Search/select                   | One of client/lead required | |
| Lead              | Search/select                   | One of client/lead required | |
| Brand             | Select (from org's brands)      | Yes      |                                    |
| Payment Plan      | Radio/select: ONE_TIME / INSTALLMENTS / SUBSCRIPTION | Yes | |
| Installment Count | Number input (2–60)             | Yes      | Only when INSTALLMENTS             |
| Items             | Repeating item editor           | See validation rules |            |
| Total Amount      | Number input (manual)           | Yes if no items | Hidden/disabled if items present |
| Discount Type     | Select: PERCENTAGE / FIXED_AMOUNT | No      |                                    |
| Discount Value    | Number input                    | Yes if discountType set |          |
| Description       | Textarea                        | No       |                                    |
| Contract URL      | URL text input                  | No       |                                    |
| Initial Status    | Select: DRAFT / PENDING / ACTIVE | Yes     | ACTIVE only for OWNER/ADMIN/SALES_MANAGER |

### 2. Create `SaleItemsEditor` Component

**File:** `apps/frontend/components/sales/form/SaleItemsEditor.tsx`

Dynamic list of item rows. Each row:

| Field         | Control                    | Required |
|---------------|----------------------------|----------|
| Catalog Picker| `PackageCatalogPicker`     | No (optional catalog link) |
| Name          | Text input                 | Yes      |
| Description   | Text input                 | No       |
| Quantity      | Number input (min: 1)      | Yes      |
| Unit Price    | Currency number input      | Yes      |
| Custom Price  | Currency number input      | No       |

Interactions:
- "+ Add Item" button appends a new empty row.
- "×" button removes a row (minimum 0 items, but see validation — if totalAmount is not manually set, at least one item is required).
- Selecting a package from `PackageCatalogPicker` auto-fills `name`, `unitPrice`, and `packageName`. The user can then override `name` and set a `customPrice`.

### 3. Create `PackageCatalogPicker` Component

**File:** `apps/frontend/components/sales/form/PackageCatalogPicker.tsx`

A typeahead/autocomplete input:
- User types a package name or code.
- After 300ms debounce, calls `GET /packages?search={query}` (or the verified catalog API endpoint).
- Shows a dropdown of matching packages with name, price, and ID.
- Selecting a package fills the parent item row's `name`, `unitPrice`, `packageId`, `packageName`.
- Clear button resets package linkage (item becomes free-form again).

**Degraded mode (if catalog API does not exist):**
- Show the field with a disabled state and a tooltip: "Package catalog not available. Enter item details manually."
- The field still accepts free-form text entry in degraded mode (the `packageId` is simply null).

### 4. Create `DiscountSection` Component

**File:** `apps/frontend/components/sales/form/DiscountSection.tsx`

- Toggle: "Apply Discount" checkbox/switch. Expands the discount fields when checked.
- Discount Type: Dropdown (PERCENTAGE / FIXED_AMOUNT).
- Discount Value: Number input. Placeholder changes based on type ("e.g., 10 for 10%" vs "e.g., 500 for $500 off").
- Inline validation:
  - PERCENTAGE: value must be between 0.01 and 100.
  - FIXED_AMOUNT: value must be > 0 and < totalAmount.
  - Show inline error message below the value input.

### 5. Create `SaleSummaryPreview` Component

**File:** `apps/frontend/components/sales/form/SaleSummaryPreview.tsx`

A live-updating summary that recalculates as the user edits items and discount:

```
Items:           3
Subtotal:        $5,000.00
Discount (10%):  - $500.00
─────────────────────────
Total:           $4,500.00
```

Updates in real-time using `watch()` from `react-hook-form`. The calculation mirrors the backend logic:
- PERCENTAGE: `subtotal * (1 - discountValue/100)`, rounded to 2 decimal places.
- FIXED_AMOUNT: `subtotal - discountValue`.

The displayed total is informational — the server always recomputes.

### 6. Client-Side Validation Schema

Using Zod or the established validation library:

```typescript
const saleFormSchema = z.object({
  clientId: z.string().optional(),
  leadId: z.string().optional(),
  brandId: z.string().min(1, 'Brand is required'),
  paymentPlan: z.enum(['ONE_TIME', 'INSTALLMENTS', 'SUBSCRIPTION']),
  installmentCount: z.number().min(2).max(60).optional(),
  items: z.array(saleItemSchema).optional(),
  totalAmount: z.number().positive().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().positive().optional(),
  description: z.string().max(1000).optional(),
  contractUrl: z.string().url().optional().or(z.literal('')),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE']),
}).refine(
  (data) => data.clientId || data.leadId,
  { message: 'Either a client or lead is required', path: ['clientId'] }
).refine(
  (data) => (data.items && data.items.length > 0) || data.totalAmount,
  { message: 'Either items or a total amount is required', path: ['items'] }
).refine(
  (data) => data.paymentPlan !== 'INSTALLMENTS' || (data.installmentCount && data.installmentCount >= 2),
  { message: 'Installment count is required for installment plans', path: ['installmentCount'] }
).refine(
  (data) => !data.discountValue || data.discountType,
  { message: 'Discount type is required when discount value is set', path: ['discountType'] }
);
```

### 7. Agent Restrictions in Form

When `currentUser.role === 'FRONTSELL_AGENT' || 'UPSELL_AGENT'`:
- Status field: Only DRAFT and PENDING are available (ACTIVE option is hidden).
- Total Amount field (if shown): disabled/read-only with tooltip "Agents cannot set total amount directly."
- Discount fields: hidden entirely.
- Currency field: hidden or read-only.
- Payment Plan: read-only if editing an existing sale.

### 8. Handle Collision Warning After Create

After `POST /sales` returns a `collisionWarning`:
- Store the `collisionWarning` in local state (or URL state) before navigating to the new sale's detail page.
- On the sale detail page, read the collision warning from state and show the `CollisionWarningBanner` (from SM-FE-004).
- The collision warning is NOT persistent — it only shows on first visit after creation.

Implementation:
```typescript
// After successful POST /sales:
const result = await createSale(formData);
if (result.collisionWarning) {
  // Store in router state or sessionStorage
  sessionStorage.setItem(`collision-warning-${result.sale.id}`, JSON.stringify(result.collisionWarning));
}
router.push(`/sales/${result.sale.id}`);

// In SaleClientSection (SM-FE-004):
const collisionWarning = sessionStorage.getItem(`collision-warning-${sale.id}`);
// Display if present, then remove on user dismissal
```

### 9. Edit Mode

When `saleId` prop is provided:
- Pre-fetch the sale via `GET /sales/:id`.
- Pre-fill all form fields with existing values.
- Change submit button label to "Save Changes".
- Only DRAFT/PENDING sales should be editable (show a read-only notice for ACTIVE+ sales in the form — or block opening the edit form entirely for non-editable statuses).
- Calls `PATCH /sales/:id` on submit.

### 10. Create API Mutation Hooks

**File:** `apps/frontend/hooks/sales/useCreateSale.ts`

```typescript
export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSaleFormData) => createSale(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'summary'] });
    },
  });
}
```

**File:** `apps/frontend/hooks/sales/useUpdateSale.ts`

```typescript
export function useUpdateSale(saleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSaleFormData) => updateSale(saleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
    },
  });
}
```

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

### `POST /sales` — Request Body

The form submits:
```json
{
  "clientId": "cl_abc" | null,
  "leadId": "lead_xyz" | null,
  "brandId": "br_123",
  "paymentPlan": "INSTALLMENTS",
  "installmentCount": 3,
  "items": [
    {
      "name": "Web Dev",
      "quantity": 1,
      "unitPrice": 5000.00,
      "packageId": "pkg_001",
      "packageName": "Standard Web Package"
    }
  ],
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "description": "Website project for Acme Corp",
  "status": "DRAFT"
}
```

### `POST /sales` — Response Body (ISaleCreateResponse)

```json
{
  "data": {
    "sale": { "id": "...", "status": "DRAFT", "discountedTotal": 4500.00 },
    "collisionWarning": { "matched": true, "matchedClientId": "...", ... }
  }
}
```

---

## Acceptance Criteria

1. "New Sale" button on list page opens the create form.
2. "Edit Sale" button on detail page opens the edit form pre-filled with existing values.
3. Submitting the form with no client/lead shows validation error "Either a client or lead is required".
4. Submitting with no items and no totalAmount shows validation error.
5. Selecting a package from `PackageCatalogPicker` auto-fills name and unitPrice for the item row.
6. `SaleSummaryPreview` updates live as items and discount are changed.
7. PERCENTAGE discount of 10% on $5,000 shows $4,500.00 in the preview.
8. FIXED_AMOUNT discount of $500 on $5,000 shows $4,500.00 in the preview.
9. Submitting with PERCENTAGE discount > 100 shows validation error.
10. Agent user does not see ACTIVE as a status option.
11. Agent user sees discount fields hidden.
12. Successful creation navigates to the new sale detail page.
13. If creation returns `collisionWarning`, the warning banner is shown on the sale detail page.
14. Edit mode pre-fills all form fields with existing sale data.
15. Edit mode PATCH call updates the sale and navigates back to detail page.
16. Success toast shown after create and edit.
17. Error toast or inline error shown when API returns 4xx/5xx.
18. Submit button is disabled while mutation is in flight.

---

## Edge Cases

1. **Edit a sale with existing items:** The items editor pre-fills all item rows including `packageId`/`packageName`. Items with catalog linkage show the package picker populated.
2. **Catalog API unavailable:** `PackageCatalogPicker` shows degraded state. Free-form entry still works.
3. **Switching from INSTALLMENTS to ONE_TIME:** `installmentCount` field should hide and its value should be cleared from the form state to avoid sending an invalid value.
4. **Removing all items when `totalAmount` was auto-computed:** Clearing all items should reset `totalAmount` to undefined, triggering the validation that requires either items or totalAmount.
5. **Long client/lead search results:** Limit dropdown to 10 results. Show "Search for more..." if there are more matches.
6. **Collision warning and navigation:** If the user opens the edit form of a sale and dismisses it, the collision warning (stored in sessionStorage) should be cleared.

---

## Dependencies

- **SM-FE-001** — "New Sale" button is on the list page.
- **SM-FE-004** — "Edit Sale" button is on the detail page header.
- **SM-BE-002** — `packageId`/`packageName` accepted in `POST /sales`.
- **SM-BE-006** — Collision warning in `POST /sales` response.
- **SM-BE-008** — Discount fields in `POST /sales` and `PATCH /sales/:id`.
- Package catalog API (verify existence before implementing `PackageCatalogPicker`).

---

## Testing Requirements

### Unit Tests

- `SaleSummaryPreview` computes correct total for PERCENTAGE discount.
- `SaleSummaryPreview` computes correct total for FIXED_AMOUNT discount.
- `SaleSummaryPreview` shows subtotal without discount when no discount type is set.
- `DiscountSection` shows PERCENTAGE constraints error when value > 100.
- `SaleItemsEditor` adds and removes item rows correctly.
- Form validation: no client/lead → error.
- Form validation: no items and no totalAmount → error.
- Agent role: ACTIVE status option is absent.

### Integration Tests

- Submit create form with all required fields. Verify `POST /sales` called with correct body.
- Submit create form with invalid discount (PERCENTAGE = 110). Verify form error shown, API not called.
- Open edit form for an existing sale. Verify form pre-filled. Submit. Verify `PATCH /sales/:id` called.

### Manual QA Checks

- [ ] Create a sale with a catalog-linked item. Confirm `packageId` is set in the API request.
- [ ] Create a sale with PERCENTAGE discount 10%. Confirm preview shows correct total.
- [ ] Create a sale as FRONTSELL_AGENT. Confirm ACTIVE status option is absent.
- [ ] Create a sale from a lead with an email-match collision. Confirm collision warning banner shows on detail page.
- [ ] Edit a DRAFT sale. Confirm form pre-fills correctly.
- [ ] Submit an edit with a discount change. Confirm `discountedTotal` updates in the API response.

---

## Verification Steps

- [ ] `SaleFormModal` exists with create and edit modes.
- [ ] `SaleItemsEditor` supports add/remove item rows.
- [ ] `PackageCatalogPicker` typeahead implemented (or degraded state documented).
- [ ] `DiscountSection` with percentage and fixed-amount controls.
- [ ] `SaleSummaryPreview` live-updates from form state.
- [ ] Client-side validation schema covers all business rules.
- [ ] Agent restrictions applied in form rendering.
- [ ] Collision warning stored and displayed after creation.
- [ ] Edit mode pre-fills all fields.
- [ ] `useCreateSale` and `useUpdateSale` mutation hooks created.
- [ ] All unit tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No backend changes.** Frontend-only ticket (except clarifying catalog API existence).
- **Risk: Form complexity.** This is the most complex frontend ticket in the plan. Prioritize core create/edit functionality first; add catalog picker and live preview in a second pass within the same ticket.
- **Risk: Collision warning sessionStorage.** sessionStorage is cleared on tab close. If the user opens the sale in a new tab, the warning will not appear. This is a known Phase 1 limitation.
