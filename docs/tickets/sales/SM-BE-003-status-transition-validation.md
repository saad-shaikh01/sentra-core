# SM-BE-003 — Status Transition Validation

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-003                                  |
| Title          | Status Transition Validation               |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 4 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The current `SalesService.update()` method accepts any `status` value from the DTO and writes it directly to the database with no validation. This means a sale can jump from `PENDING` directly to `COMPLETED`, from `REFUNDED` back to `ACTIVE`, or any other nonsensical transition. This ticket implements a strict transition guard and role-based gate that enforces the lifecycle defined in the product requirements.

---

## User / Business Outcome

- Invalid status transitions are rejected at the API layer with a clear error message, preventing corrupt sale state.
- Role-restricted transitions (e.g., REFUNDED) are rejected for unauthorized users, enforcing financial controls.
- The sales lifecycle is predictable and auditable.

---

## Exact Scope

### In Scope

1. Define a `TRANSITIONS` constant (map of allowed transitions per status).
2. Define a `TRANSITION_ROLE_REQUIREMENTS` constant (map of transition → minimum required roles).
3. Implement a private `validateStatusTransition()` method in `SalesService`.
4. Call `validateStatusTransition()` inside `SalesService.update()` when `status` is present in the update DTO.
5. Update the `update()` method signature to accept `actorRole` and `actorId`.
6. Update `SalesController.update()` to extract user role and ID from the request and pass to the service.
7. Throw `UnprocessableEntityException` (HTTP 422) for invalid transitions.
8. Throw `ForbiddenException` (HTTP 403) for valid transitions where the actor lacks the required role.

### Out of Scope

- Automatic status transitions triggered by payment events (that is SM-BE-011 — webhook receiver).
- Activity logging for status changes (that is SM-BE-007).
- Discount field validation (SM-BE-008).
- Frontend status control UI (SM-FE-004).

---

## Backend Tasks

### 1. Define Transition Constants

**File:** `apps/backend/core-service/src/modules/sales/sales.constants.ts`

Create this file if it does not exist:

```typescript
import { SaleStatus } from '@prisma/client';
import { UserRole } from '@prisma/client';

/**
 * Maps each SaleStatus to the array of statuses it may transition TO.
 * Any transition not listed here is invalid and must be rejected with HTTP 422.
 */
export const SALE_STATUS_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.DRAFT]: [SaleStatus.PENDING],
  [SaleStatus.PENDING]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.ACTIVE]: [SaleStatus.COMPLETED, SaleStatus.ON_HOLD, SaleStatus.CANCELLED, SaleStatus.REFUNDED],
  [SaleStatus.COMPLETED]: [SaleStatus.REFUNDED],
  [SaleStatus.ON_HOLD]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.CANCELLED]: [],
  [SaleStatus.REFUNDED]: [],
};

/**
 * Maps each "from → to" transition to the minimum roles allowed to perform it.
 * Key format: `${fromStatus}__${toStatus}`
 */
export const SALE_TRANSITION_ROLE_REQUIREMENTS: Record<string, UserRole[]> = {
  [`${SaleStatus.DRAFT}__${SaleStatus.PENDING}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.FRONTSELL_AGENT,
    UserRole.UPSELL_AGENT,
  ],
  [`${SaleStatus.PENDING}__${SaleStatus.ACTIVE}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.PENDING}__${SaleStatus.CANCELLED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.ACTIVE}__${SaleStatus.COMPLETED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.ACTIVE}__${SaleStatus.ON_HOLD}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.ACTIVE}__${SaleStatus.CANCELLED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.ACTIVE}__${SaleStatus.REFUNDED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
  ],
  [`${SaleStatus.COMPLETED}__${SaleStatus.REFUNDED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
  ],
  [`${SaleStatus.ON_HOLD}__${SaleStatus.ACTIVE}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
  [`${SaleStatus.ON_HOLD}__${SaleStatus.CANCELLED}`]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
  ],
};
```

### 2. Implement `validateStatusTransition()` in SalesService

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add the following private method to `SalesService`:

```typescript
import { UnprocessableEntityException, ForbiddenException } from '@nestjs/common';
import { SALE_STATUS_TRANSITIONS, SALE_TRANSITION_ROLE_REQUIREMENTS } from './sales.constants';
import { SaleStatus, UserRole } from '@prisma/client';

private validateStatusTransition(
  currentStatus: SaleStatus,
  newStatus: SaleStatus,
  actorRole: UserRole,
): void {
  // 1. Check if transition is structurally allowed
  const allowedTransitions = SALE_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new UnprocessableEntityException(
      `Transition from ${currentStatus} to ${newStatus} is not allowed`,
    );
  }

  // 2. Check if actor role is authorized for this specific transition
  const transitionKey = `${currentStatus}__${newStatus}`;
  const allowedRoles = SALE_TRANSITION_ROLE_REQUIREMENTS[transitionKey] ?? [];
  if (!allowedRoles.includes(actorRole)) {
    throw new ForbiddenException(
      `Role ${actorRole} is not permitted to transition a sale from ${currentStatus} to ${newStatus}`,
    );
  }
}
```

### 3. Update `SalesService.update()` Signature and Call Site

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Update the `update()` method to accept actor context:

```typescript
async update(
  id: string,
  organizationId: string,
  updateSaleDto: UpdateSaleDto,
  actorId: string,        // ADD
  actorRole: UserRole,    // ADD
): Promise<ISale> {
  const existingSale = await this.prisma.sale.findFirst({
    where: { id, organizationId, deletedAt: null },
  });

  if (!existingSale) {
    throw new NotFoundException(`Sale with id ${id} not found`);
  }

  // Status transition validation — call BEFORE writing to DB
  if (updateSaleDto.status && updateSaleDto.status !== existingSale.status) {
    this.validateStatusTransition(
      existingSale.status,
      updateSaleDto.status,
      actorRole,
    );
  }

  // ... rest of existing update logic ...
}
```

**Important:** The `deletedAt: null` filter in the `findFirst` query is part of SM-BE-004. Add it here preemptively so the two tickets do not conflict. If SM-BE-004 is implemented first, this filter will already be present.

### 4. Update `SalesController.update()` to Pass Actor Context

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Patch(':id')
@Roles(/* role list updated in SM-BE-005 */)
async update(
  @Param('id') id: string,
  @Body() updateSaleDto: UpdateSaleDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,  // ensure this decorator exists and provides sub + role
): Promise<CommApiResponse<ISale>> {
  const result = await this.salesService.update(
    id,
    organizationId,
    updateSaleDto,
    user.sub,   // actorId
    user.role,  // actorRole — ADD THIS
  );
  return CommApiResponse.success(result);
}
```

If the `@CurrentUser()` decorator does not exist in core-service, look for the equivalent decorator that exposes JWT payload fields (`sub`, `role`). Use whatever pattern is already established in the codebase. Do not create a new decorator if one already exists.

### 5. Verify `UpdateSaleDto` Allows `status` Field

**File:** `apps/backend/core-service/src/modules/sales/dto/update-sale.dto.ts`

Confirm that `status` is present and typed as `SaleStatus`. If it uses `PartialType(CreateSaleDto)`, the field should already be included. Confirm the field is decorated:

```typescript
@IsOptional()
@IsEnum(SaleStatus)
status?: SaleStatus;
```

If `SaleStatus.DRAFT` is not in the enum yet (awaiting SM-BE-001), ensure SM-BE-001 is applied before this ticket is tested.

---

## Frontend Tasks

None. The status transition UI (buttons for allowed transitions) is implemented in SM-FE-004.

---

## Schema / Migration Impact

No schema changes in this ticket. The `DRAFT` value added in SM-BE-001 is used in the transition constants, so SM-BE-001 must be applied before testing this ticket.

---

## API / Contracts Affected

### `PATCH /sales/:id`

**New error responses:**

| Condition                                          | HTTP Status | Response Body                                                               |
|----------------------------------------------------|-------------|-----------------------------------------------------------------------------|
| Status transition is not in the allowed matrix     | 422         | `{ message: "Transition from PENDING to COMPLETED is not allowed" }`       |
| Actor role is not authorized for the transition    | 403         | `{ message: "Role SALES_MANAGER is not permitted to transition..." }`      |
| Status field is omitted (no status change)         | 200         | Normal success response — no validation triggered                          |
| Status field is same as current status             | 200         | No validation triggered — treated as no-op for status                      |

---

## Full Transition Matrix Reference

| From \ To     | DRAFT | PENDING | ACTIVE | COMPLETED | ON_HOLD | CANCELLED | REFUNDED |
|---------------|-------|---------|--------|-----------|---------|-----------|----------|
| **DRAFT**     | —     | ✅      | ❌     | ❌        | ❌      | ❌        | ❌       |
| **PENDING**   | ❌    | —       | ✅     | ❌        | ❌      | ✅        | ❌       |
| **ACTIVE**    | ❌    | ❌      | —      | ✅        | ✅      | ✅        | ✅       |
| **COMPLETED** | ❌    | ❌      | ❌     | —         | ❌      | ❌        | ✅       |
| **ON_HOLD**   | ❌    | ❌      | ✅     | ❌        | —       | ✅        | ❌       |
| **CANCELLED** | ❌    | ❌      | ❌     | ❌        | ❌      | —         | ❌       |
| **REFUNDED**  | ❌    | ❌      | ❌     | ❌        | ❌      | ❌        | —        |

---

## Acceptance Criteria

1. `PATCH /sales/:id` with `status: 'COMPLETED'` on a `DRAFT` sale returns HTTP 422 with message containing "Transition from DRAFT to COMPLETED is not allowed".
2. `PATCH /sales/:id` with `status: 'PENDING'` on a `DRAFT` sale by an `OWNER` returns HTTP 200.
3. `PATCH /sales/:id` with `status: 'PENDING'` on a `DRAFT` sale by a `FRONTSELL_AGENT` returns HTTP 200.
4. `PATCH /sales/:id` with `status: 'ACTIVE'` on a `PENDING` sale by a `SALES_MANAGER` returns HTTP 200.
5. `PATCH /sales/:id` with `status: 'REFUNDED'` on an `ACTIVE` sale by an `OWNER` returns HTTP 200.
6. `PATCH /sales/:id` with `status: 'REFUNDED'` on an `ACTIVE` sale by a `SALES_MANAGER` returns HTTP 403.
7. `PATCH /sales/:id` with `status: 'REFUNDED'` on an `ACTIVE` sale by a `FRONTSELL_AGENT` returns HTTP 403.
8. `PATCH /sales/:id` with `status: 'PENDING'` on a `CANCELLED` sale returns HTTP 422 (CANCELLED has no outgoing transitions).
9. `PATCH /sales/:id` with `status: 'DRAFT'` on a `PENDING` sale returns HTTP 422 (reverse transition not allowed).
10. `PATCH /sales/:id` with no `status` field (only updating `description`) returns HTTP 200 with no transition validation triggered.
11. `PATCH /sales/:id` with `status` equal to the current status (no change) returns HTTP 200 with no validation triggered.
12. The error message for invalid transitions always includes the `from` and `to` status names.
13. `SALE_STATUS_TRANSITIONS` constant correctly represents all 7 statuses with their allowed targets.

---

## Edge Cases

1. **`status` not present in DTO:** Validation must be skipped entirely. Only trigger when `updateSaleDto.status` is defined AND differs from `existingSale.status`.
2. **`status` same as current status:** Treat as a no-op — do not run transition validation, do not throw. The update proceeds with other fields.
3. **`actorRole` is `undefined` or missing from JWT:** If the role cannot be extracted, default behavior should be to throw `ForbiddenException`. Do not silently allow unknown roles.
4. **Sale is soft-deleted (`deletedAt` is set):** The `findFirst` query with `deletedAt: null` will not find the sale, causing `NotFoundException` before transition validation is reached. This is correct behavior.
5. **Concurrent updates:** Two simultaneous requests to transition the same sale. The second request will read the already-updated status and validate the transition from the new status. Use a database transaction for read + update to prevent race conditions. The existing Prisma `$transaction` in `update()` should handle this.
6. **Agent attempting `DRAFT → PENDING`:** This is allowed per the matrix. However, SM-BE-005 adds an additional scoping check (client must be assigned to agent). The transition validation passes first; then SM-BE-005's scoping check runs.

---

## Dependencies

- **SM-BE-001** must be applied (for `SaleStatus.DRAFT` to exist in the enum).
- **SM-BE-005** (role-permission fix) modifies the `@Roles()` decorators on the controller — coordinate to avoid merge conflicts in `sales.controller.ts`.
- **SM-BE-007** (activity logging) will add a `logActivity()` call inside `update()` after the transition validation passes — coordinate to avoid conflicts.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `validateStatusTransition()` directly for each invalid transition (at minimum 10 invalid paths: DRAFT→ACTIVE, DRAFT→COMPLETED, PENDING→COMPLETED, CANCELLED→PENDING, REFUNDED→ACTIVE, etc.).
- Test `validateStatusTransition()` for each valid transition with sufficient role (at minimum 7 valid paths).
- Test `validateStatusTransition()` for each valid transition where the actor role is insufficient — expect `ForbiddenException` (e.g., `ACTIVE → REFUNDED` with `SALES_MANAGER` role).
- Test `update()` with no `status` field — verify `validateStatusTransition` is NOT called (use a spy).
- Test `update()` with `status` equal to current status — verify `validateStatusTransition` is NOT called.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `PATCH /sales/:id` — all 13 acceptance criteria scenarios must be covered by integration tests with real HTTP calls.
- Test the `actorRole` is correctly extracted from the JWT and passed to the service.

### Manual QA Checks

- [ ] Create a DRAFT sale. Attempt to set status to COMPLETED via `PATCH /sales/:id`. Confirm HTTP 422 with correct message.
- [ ] Set the same sale to PENDING (valid). Confirm HTTP 200.
- [ ] Using a SALES_MANAGER JWT, attempt to set an ACTIVE sale to REFUNDED. Confirm HTTP 403.
- [ ] Using an OWNER JWT, set an ACTIVE sale to REFUNDED. Confirm HTTP 200.

---

## Verification Steps

- [ ] `sales.constants.ts` created with `SALE_STATUS_TRANSITIONS` and `SALE_TRANSITION_ROLE_REQUIREMENTS`.
- [ ] `validateStatusTransition()` private method exists in `SalesService`.
- [ ] `update()` method signature includes `actorId: string` and `actorRole: UserRole` parameters.
- [ ] Controller `update()` passes `user.sub` and `user.role` to service `update()`.
- [ ] `PATCH /sales/:id` returns 422 for DRAFT → COMPLETED.
- [ ] `PATCH /sales/:id` returns 403 for ACTIVE → REFUNDED with SALES_MANAGER role.
- [ ] `PATCH /sales/:id` returns 200 for DRAFT → PENDING with OWNER role.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema changes.** This ticket is pure application logic. Rollback is simply reverting the code.
- **Risk: Breaking existing PATCH /sales/:id callers.** Any caller currently relying on free-form status updates (e.g., jumping PENDING → COMPLETED without going through ACTIVE) will now receive HTTP 422. This is an intentional breaking change to enforce the lifecycle. Communicate to all API consumers before deploying.
- **Risk: `actorRole` not available in JWT.** Verify that the JWT payload includes a `role` field before deploying. If not, this ticket requires a prior auth-service change to include the role.
