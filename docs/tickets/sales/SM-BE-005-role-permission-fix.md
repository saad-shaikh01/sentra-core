# SM-BE-005 — Role Permission Fix (PROJECT_MANAGER / Agents)

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-005                                  |
| Title          | Role Permission Fix (PROJECT_MANAGER / Agents) |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 4 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

The current `SalesController` has two role-permission bugs:
1. `PROJECT_MANAGER` is listed in `@Roles()` on `POST /sales` and `PATCH /sales/:id`, granting them write access that business rules prohibit.
2. `FRONTSELL_AGENT` and `UPSELL_AGENT` are absent from `@Roles()` on `POST /sales`, blocking agents from creating sales entirely. Agents should be able to create DRAFT/PENDING sales for their scoped clients.

Additionally, there is no service-layer enforcement of agent scoping (agents should only operate on clients linked to their assigned leads).

---

## User / Business Outcome

- Project Managers can view sales for financial context but cannot create or modify them.
- Sales agents (FRONTSELL_AGENT, UPSELL_AGENT) can create and update their own scoped sales, enabling them to be productive without requiring a manager to create sales on their behalf.
- Agent scoping ensures that agents cannot access or manipulate sales belonging to clients assigned to other agents.

---

## Exact Scope

### In Scope

1. Remove `PROJECT_MANAGER` from `@Roles()` on `POST /sales`.
2. Remove `PROJECT_MANAGER` from `@Roles()` on `PATCH /sales/:id`.
3. Add `PROJECT_MANAGER` to `@Roles()` on `GET /sales` and `GET /sales/:id` (read-only access).
4. Add `FRONTSELL_AGENT` and `UPSELL_AGENT` to `@Roles()` on `POST /sales`.
5. In `SalesService.create()`: when actor role is `FRONTSELL_AGENT` or `UPSELL_AGENT`, validate that the resolved `clientId` belongs to a client linked to a lead that is assigned to `actorId`. Throw 403 if the check fails.
6. In `SalesService.create()`: when actor role is an agent, restrict initial sale status to `DRAFT` or `PENDING` only. Throw 422 if the requested status is `ACTIVE` or higher.
7. In `SalesService.update()`: when actor role is an agent, block changes to financial fields: `totalAmount`, `currency`, `paymentPlan`, `discountType`, `discountValue`. Throw 403 if any of these fields are present in the update DTO.
8. Update `SalesService.create()` and `SalesService.update()` signatures to accept `actorId` and `actorRole` (coordinate with SM-BE-003 which already adds these to `update()`).

### Out of Scope

- Agent scoping for read operations (`GET /sales`, `GET /sales/:id`). Agents will see the backend-filtered list based on existing org scoping. Additional fine-grained read scoping is a future enhancement.
- Restricting agents from the PATCH endpoint entirely — they can update non-financial fields on their scoped sales.
- Changing any schema or migration.

---

## Backend Tasks

### 1. Update `@Roles()` Decorators in Controller

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

**`POST /sales` — change from:**
```typescript
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
```
**To:**
```typescript
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES_MANAGER,
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
)
```

**`PATCH /sales/:id` — change from:**
```typescript
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.PROJECT_MANAGER)
```
**To:**
```typescript
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES_MANAGER,
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
)
```

**`GET /sales` — ensure PROJECT_MANAGER is included:**
```typescript
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES_MANAGER,
  UserRole.PROJECT_MANAGER,
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
)
```

**`GET /sales/:id` — ensure PROJECT_MANAGER is included:**
```typescript
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES_MANAGER,
  UserRole.PROJECT_MANAGER,
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
)
```

**`DELETE /sales/:id` — must remain restricted to OWNER and ADMIN only (per SM-BE-004):**
```typescript
@Roles(UserRole.OWNER, UserRole.ADMIN)
```

### 2. Add Agent Scoping Validation Helper in SalesService

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Add a private method:

```typescript
private async validateAgentClientScope(
  clientId: string,
  actorId: string,
  organizationId: string,
): Promise<void> {
  /**
   * Validates that the given clientId is linked to at least one Lead
   * that is assigned to actorId within the organization.
   *
   * The check: Client -> Lead.convertedClientId OR Lead.clientId (check existing Lead model fields)
   * The Lead must have assignedUserId === actorId.
   */
  const lead = await this.prisma.lead.findFirst({
    where: {
      organizationId,
      assignedUserId: actorId,
      OR: [
        { convertedClientId: clientId },
        // If Lead has a direct clientId field, include it here
        // Adjust field names to match the actual Lead Prisma model
      ],
    },
  });

  if (!lead) {
    throw new ForbiddenException(
      'Agent does not have permission to create or update sales for this client',
    );
  }
}
```

**Important:** Before implementing, inspect the actual `Lead` Prisma model to identify the correct field names (`assignedUserId`, `convertedClientId`, or equivalent). Update the query accordingly. Document the actual field names used in the PR description.

### 3. Update `SalesService.create()` — Agent Restrictions

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Update the `create()` method signature:

```typescript
async create(
  createSaleDto: CreateSaleDto,
  organizationId: string,
  actorId: string,      // ADD (if not already present)
  actorRole: UserRole,  // ADD (if not already present)
): Promise<ISaleCreateResponse> {
```

Add the following logic at the top of `create()`, after resolving `clientId`:

```typescript
const isAgent =
  actorRole === UserRole.FRONTSELL_AGENT ||
  actorRole === UserRole.UPSELL_AGENT;

if (isAgent) {
  // 1. Validate that the client is scoped to this agent
  await this.validateAgentClientScope(resolvedClientId, actorId, organizationId);

  // 2. Restrict initial status to DRAFT or PENDING only
  const allowedAgentStatuses: SaleStatus[] = [SaleStatus.DRAFT, SaleStatus.PENDING];
  const requestedStatus = createSaleDto.status ?? SaleStatus.DRAFT;
  if (!allowedAgentStatuses.includes(requestedStatus)) {
    throw new UnprocessableEntityException(
      `Agents may only create sales with status DRAFT or PENDING. Requested: ${requestedStatus}`,
    );
  }
}
```

### 4. Update `SalesService.update()` — Agent Financial Field Restriction

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

In the `update()` method, after fetching `existingSale` and before the transition validation, add:

```typescript
const isAgent =
  actorRole === UserRole.FRONTSELL_AGENT ||
  actorRole === UserRole.UPSELL_AGENT;

if (isAgent) {
  // 1. Validate scope: agent can only update sales for their clients
  if (existingSale.clientId) {
    await this.validateAgentClientScope(existingSale.clientId, actorId, organizationId);
  }

  // 2. Block changes to financial fields
  const financialFields: (keyof UpdateSaleDto)[] = [
    'totalAmount',
    'currency',
    'paymentPlan',
    'discountType',
    'discountValue',
  ];

  const attemptedFinancialFields = financialFields.filter(
    (field) => updateSaleDto[field] !== undefined,
  );

  if (attemptedFinancialFields.length > 0) {
    throw new ForbiddenException(
      `Agents may not modify financial fields: ${attemptedFinancialFields.join(', ')}`,
    );
  }
}
```

### 5. Update `SalesController.create()` to Pass Actor Context

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

```typescript
@Post()
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT)
async create(
  @Body() createSaleDto: CreateSaleDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<ISaleCreateResponse>> {
  const result = await this.salesService.create(
    createSaleDto,
    organizationId,
    user.sub,    // actorId — ADD
    user.role,   // actorRole — ADD
  );
  return CommApiResponse.success(result);
}
```

---

## Frontend Tasks

None. Role-based UI rendering (hiding create/edit buttons from PROJECT_MANAGER, showing them to agents) is addressed in the frontend tickets.

---

## Schema / Migration Impact

No schema changes in this ticket.

---

## API / Contracts Affected

### `POST /sales`

- `PROJECT_MANAGER` role now receives HTTP 403 (previously HTTP 201).
- `FRONTSELL_AGENT` and `UPSELL_AGENT` roles now receive HTTP 201 for valid requests (previously HTTP 403).
- Agent requesting `status: 'ACTIVE'` on create receives HTTP 422.
- Agent creating a sale for a client not linked to their leads receives HTTP 403.

### `PATCH /sales/:id`

- `PROJECT_MANAGER` role now receives HTTP 403 (previously HTTP 200).
- Agent attempting to change `totalAmount`, `currency`, `paymentPlan`, `discountType`, or `discountValue` receives HTTP 403.
- Agent attempting to update a sale for a client not linked to their leads receives HTTP 403.

### `GET /sales` and `GET /sales/:id`

- `PROJECT_MANAGER` role now receives HTTP 200 (previously HTTP 403 — adding read access).

---

## Acceptance Criteria

1. `POST /sales` with `PROJECT_MANAGER` JWT returns HTTP 403.
2. `POST /sales` with `FRONTSELL_AGENT` JWT and a client linked to the agent's lead returns HTTP 201.
3. `POST /sales` with `FRONTSELL_AGENT` JWT and `status: 'ACTIVE'` returns HTTP 422 with message about agent status restriction.
4. `POST /sales` with `FRONTSELL_AGENT` JWT and a client NOT linked to the agent's leads returns HTTP 403.
5. `POST /sales` with `UPSELL_AGENT` JWT mirrors the same behavior as `FRONTSELL_AGENT`.
6. `PATCH /sales/:id` with `PROJECT_MANAGER` JWT returns HTTP 403.
7. `PATCH /sales/:id` with `FRONTSELL_AGENT` JWT and `totalAmount` in the body returns HTTP 403 with message listing the blocked field.
8. `PATCH /sales/:id` with `FRONTSELL_AGENT` JWT changing only `description` on a scoped sale returns HTTP 200.
9. `PATCH /sales/:id` with `FRONTSELL_AGENT` JWT on a sale belonging to another agent's client returns HTTP 403.
10. `GET /sales` with `PROJECT_MANAGER` JWT returns HTTP 200 with the sales list.
11. `GET /sales/:id` with `PROJECT_MANAGER` JWT returns HTTP 200 with the sale detail.
12. `SALES_MANAGER` retains full create and update access (HTTP 201/200 as before, except for role-restricted transitions).
13. `OWNER` and `ADMIN` retain full access to all endpoints.

---

## Edge Cases

1. **Agent creating a sale with `leadId` only (no explicit `clientId`):** The `resolveClientIdFromLead()` method determines `clientId`. The scoping check must use the resolved `clientId` (after resolution), not the raw `leadId`. Ensure the scope check runs AFTER client resolution.
2. **Agent whose lead has been reassigned:** If a lead that was previously assigned to the agent has been reassigned to another user, the `validateAgentClientScope` check will fail for the agent. This is correct behavior — reassignment revokes the agent's scoped access.
3. **Agent and a client linked to multiple leads (different agents):** If the same client is linked to leads assigned to multiple agents, either agent's scope check passes (because `findFirst` finds any matching lead). This is acceptable behavior for Phase 1.
4. **`PROJECT_MANAGER` attempting to read a specific sale via `GET /sales/:id`:** Returns HTTP 200. No additional data filtering is applied — they see the full sale detail.
5. **`totalAmount` not present in `UpdateSaleDto`:** The financial field check only triggers if the field is explicitly included in the DTO body. An update with `{ description: "new desc" }` is not blocked even for agents.
6. **Agent attempting to change `installmentCount`:** `installmentCount` is not in the blocked financial fields list. Determine whether agents should be able to change this. If not, add it to `financialFields` in the service. Document the decision.

---

## Dependencies

- **SM-BE-001** — No direct schema dependency, but the `SaleStatus.DRAFT` enum value (from SM-BE-001) is used in the agent status restriction.
- **SM-BE-003** — Both tickets modify `update()` signature to accept `actorRole`. Coordinate to ensure the signature is defined consistently.
- The `Lead` Prisma model must have an `assignedUserId` field (or equivalent). Verify the actual field name before implementing.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `validateAgentClientScope()`: mock `prisma.lead.findFirst` returning a lead — expect no exception.
- Test `validateAgentClientScope()`: mock `prisma.lead.findFirst` returning null — expect `ForbiddenException`.
- Test `create()` with `actorRole: FRONTSELL_AGENT` and `status: 'ACTIVE'` — expect `UnprocessableEntityException`.
- Test `create()` with `actorRole: FRONTSELL_AGENT` and `status: 'DRAFT'` — expect successful call (mock scope check).
- Test `create()` with `actorRole: OWNER` — expect no scope check called.
- Test `update()` with `actorRole: FRONTSELL_AGENT` and `totalAmount: 999` in DTO — expect `ForbiddenException`.
- Test `update()` with `actorRole: FRONTSELL_AGENT` and only `description` in DTO — expect no exception from financial guard.
- Test `update()` with `actorRole: PROJECT_MANAGER` — note: controller guard should block PM before reaching service. Add a defense-in-depth test in service if warranted.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `POST /sales` with PROJECT_MANAGER JWT → HTTP 403.
- `POST /sales` with FRONTSELL_AGENT JWT and scoped client → HTTP 201.
- `POST /sales` with FRONTSELL_AGENT JWT and unscoped client → HTTP 403.
- `POST /sales` with FRONTSELL_AGENT JWT and `status: 'ACTIVE'` → HTTP 422.
- `PATCH /sales/:id` with PROJECT_MANAGER JWT → HTTP 403.
- `PATCH /sales/:id` with FRONTSELL_AGENT JWT and financial field → HTTP 403.
- `GET /sales` with PROJECT_MANAGER JWT → HTTP 200.

### Manual QA Checks

- [ ] Log in as PROJECT_MANAGER. Attempt to create a sale via API. Confirm HTTP 403.
- [ ] Log in as FRONTSELL_AGENT. Create a sale for an assigned client with status DRAFT. Confirm HTTP 201.
- [ ] Log in as FRONTSELL_AGENT. Attempt to create a sale for an unassigned client. Confirm HTTP 403.
- [ ] Log in as FRONTSELL_AGENT. Attempt to update `totalAmount` on an existing sale. Confirm HTTP 403.
- [ ] Log in as PROJECT_MANAGER. Retrieve the sales list. Confirm HTTP 200.

---

## Verification Steps

- [ ] `@Roles()` on `POST /sales` includes FRONTSELL_AGENT and UPSELL_AGENT, does NOT include PROJECT_MANAGER.
- [ ] `@Roles()` on `PATCH /sales/:id` does NOT include PROJECT_MANAGER.
- [ ] `@Roles()` on `GET /sales` includes PROJECT_MANAGER.
- [ ] `@Roles()` on `GET /sales/:id` includes PROJECT_MANAGER.
- [ ] `validateAgentClientScope()` private method exists in SalesService.
- [ ] Agent status restriction (DRAFT/PENDING only) implemented in `create()`.
- [ ] Financial field block implemented in `update()`.
- [ ] Controller `create()` and `update()` pass `user.sub` and `user.role` to service.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration.** Rollback is code revert.
- **Breaking change for PROJECT_MANAGER users.** Existing PROJECT_MANAGER API consumers using `POST /sales` or `PATCH /sales/:id` will receive HTTP 403 after deployment. Communicate before release.
- **Risk: `Lead.assignedUserId` field name mismatch.** If the actual field is named differently (e.g., `ownerId`, `agentId`), the `validateAgentClientScope()` query will silently return null for all lookups, causing all agent creates to fail with 403. Verify the field name against the actual schema before implementation.
