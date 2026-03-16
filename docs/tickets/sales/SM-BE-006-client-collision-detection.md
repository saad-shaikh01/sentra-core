# SM-BE-006 — Client Collision Detection & Warning Metadata

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-006                                  |
| Title          | Client Collision Detection & Warning Metadata |
| Phase          | 1 — Backend                                |
| Priority       | P1 — High                                  |
| Status         | [ ] Not Started                            |
| Estimate       | 3 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

When a sale is created from a lead that has not yet been converted to a client, the service uses `resolveClientIdFromLead()` to find or create the client. The current implementation silently reuses any email-matched client without alerting the caller. If the matched client is NOT the lead's own converted client (i.e., the email match found a completely different contact), the staff may unknowingly link the sale to the wrong person. This ticket adds a warning metadata field to the API response so staff can review potential collisions.

---

## User / Business Outcome

- Staff are informed when an email match during lead-to-client resolution returns a client that differs from the expected lead-owned client.
- The warning is informational: the default behavior (reuse the email-matched client) is preserved. No blocking occurs.
- The warning can be surfaced in the frontend as a banner on the sale detail page, enabling staff to review and correct if needed.

---

## Exact Scope

### In Scope

1. Update `resolveClientIdFromLead()` to return collision metadata alongside the resolved `clientId`.
2. When an email match finds a client whose ID is NOT the lead's own `convertedClientId`, include a `collisionWarning` object in the method's return value.
3. Update `SalesService.create()` to propagate the `collisionWarning` in the API response.
4. Create or update `ISaleCreateResponse` interface to include the optional `collisionWarning` field.
5. Update `CreateSaleDto` if needed (no new fields required — the behavior is automatic).

### Out of Scope

- Storing the `collisionWarning` on the `Sale` record in the database (deferred — requires a `metadata Json?` column addition).
- Blocking sale creation when a collision is detected.
- A "force override" flag to explicitly choose a different client.
- Any frontend implementation (handled in SM-FE-007 and SM-FE-004).

---

## Backend Tasks

### 1. Define Collision Warning Types

**File:** `apps/backend/core-service/src/modules/sales/interfaces/sale.interfaces.ts`

(Create this file if it does not exist, or add to the existing interfaces file.)

```typescript
export interface IClientCollisionWarning {
  matched: true;
  matchedClientId: string;
  matchedClientName: string;
  matchedClientEmail: string;
}

export interface ISaleCreateResponse {
  sale: ISale;
  collisionWarning?: IClientCollisionWarning;
}
```

If `ISale` is already the return type of `create()`, update it to be wrapped in `ISaleCreateResponse`. Alternatively, if restructuring the return type would cause too many downstream changes, add `collisionWarning` as an optional field directly on `ISale` with the understanding that it is only populated on creation and not on list/detail queries.

**Preferred approach:** Return `ISaleCreateResponse` from `create()` only. `GET /sales` and `GET /sales/:id` continue to return `ISale` (without the collision field).

### 2. Update `resolveClientIdFromLead()` Return Type

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

**Current signature (approximate):**
```typescript
private async resolveClientIdFromLead(
  leadId: string,
  organizationId: string,
): Promise<string>
```

**Updated signature:**
```typescript
private async resolveClientIdFromLead(
  leadId: string,
  organizationId: string,
): Promise<{ clientId: string; collisionWarning?: IClientCollisionWarning }>
```

**Updated implementation logic:**

```typescript
private async resolveClientIdFromLead(
  leadId: string,
  organizationId: string,
): Promise<{ clientId: string; collisionWarning?: IClientCollisionWarning }> {
  // Step 1: Load the lead
  const lead = await this.prisma.lead.findFirst({
    where: { id: leadId, organizationId },
  });

  if (!lead) {
    throw new NotFoundException(`Lead with id ${leadId} not found`);
  }

  // Step 2: If lead already has a convertedClientId, use it directly — no collision
  if (lead.convertedClientId) {
    return { clientId: lead.convertedClientId };
  }

  // Step 3: Attempt email-match lookup
  // Adjust the field name 'email' to the actual field on the Lead model
  if (!lead.email) {
    throw new UnprocessableEntityException(
      'Lead has no email and has not been converted to a client. Cannot create sale.',
    );
  }

  const emailMatchedClient = await this.prisma.client.findFirst({
    where: {
      organizationId,
      email: lead.email,
    },
    select: {
      id: true,
      name: true,      // adjust to actual Client model field name
      email: true,     // adjust to actual Client model field name
    },
  });

  if (emailMatchedClient) {
    // Check: is this the lead's own client or a different one?
    // Since lead.convertedClientId is null, any email match is a "foreign" client
    return {
      clientId: emailMatchedClient.id,
      collisionWarning: {
        matched: true,
        matchedClientId: emailMatchedClient.id,
        matchedClientName: emailMatchedClient.name,
        matchedClientEmail: emailMatchedClient.email,
      },
    };
  }

  // Step 4: No match — create a new client from the lead data
  // Adjust field mappings to actual Lead and Client model field names
  const newClient = await this.prisma.client.create({
    data: {
      organizationId,
      email: lead.email,
      name: lead.name ?? lead.email,
      // Map other lead fields to client fields as appropriate
    },
  });

  return { clientId: newClient.id };
}
```

**Critical:** Before implementing, inspect the actual `Lead` and `Client` Prisma models for the correct field names (`email`, `name`, `convertedClientId`). The field names above are illustrative. Document actual field names used in the PR.

### 3. Update `SalesService.create()` to Propagate Collision Warning

**File:** `apps/backend/core-service/src/modules/sales/sales.service.ts`

Update the call site of `resolveClientIdFromLead()` inside `create()`:

```typescript
let resolvedClientId: string = createSaleDto.clientId;
let collisionWarning: IClientCollisionWarning | undefined;

if (!resolvedClientId && createSaleDto.leadId) {
  const resolution = await this.resolveClientIdFromLead(
    createSaleDto.leadId,
    organizationId,
  );
  resolvedClientId = resolution.clientId;
  collisionWarning = resolution.collisionWarning;
}

if (!resolvedClientId) {
  throw new UnprocessableEntityException(
    'Either clientId or a valid leadId with resolvable client is required',
  );
}

// ... rest of create logic ...

// At the end of create(), return:
const mappedSale = this.mapToISale(createdSale);
return {
  sale: mappedSale,
  collisionWarning,  // undefined if no collision, populated if collision detected
};
```

Update the return type of `create()` to `Promise<ISaleCreateResponse>`.

### 4. Update `SalesController.create()` to Return Response with Collision Warning

**File:** `apps/backend/core-service/src/modules/sales/sales.controller.ts`

The controller response shape changes:

```typescript
@Post()
async create(
  @Body() createSaleDto: CreateSaleDto,
  @OrgContext() { organizationId }: IOrgContext,
  @CurrentUser() user: ICurrentUser,
): Promise<CommApiResponse<ISaleCreateResponse>> {
  const result = await this.salesService.create(
    createSaleDto,
    organizationId,
    user.sub,
    user.role,
  );
  return CommApiResponse.success(result);
}
```

The response body for a collision case will be:
```json
{
  "data": {
    "sale": { "id": "...", "status": "DRAFT", "..." : "..." },
    "collisionWarning": {
      "matched": true,
      "matchedClientId": "client_abc",
      "matchedClientName": "John Doe",
      "matchedClientEmail": "john@example.com"
    }
  }
}
```

For the non-collision case:
```json
{
  "data": {
    "sale": { "id": "...", "status": "DRAFT", "..." : "..." }
  }
}
```

(`collisionWarning` is omitted when undefined, not returned as `null`.)

### 5. Update Downstream Types

**File:** `libs/` (search for `ISaleCreateResponse` or `ISale` in shared types)

If a shared `ISale` type is exported from a libs package and returned from `create()`, update the types to reflect the new wrapped response. If the libs package is consumed by the frontend, ensure the frontend types are also updated (frontend implementation is in SM-FE-007).

---

## Frontend Tasks

None in this ticket. The frontend handling of the `collisionWarning` banner on the sale creation flow is in SM-FE-007. The warning banner on the sale detail page is in SM-FE-004.

---

## Schema / Migration Impact

No schema changes in this ticket.

---

## API / Contracts Affected

### `POST /sales` — Response Body Change

The response body for `POST /sales` changes from returning `ISale` directly to returning `ISaleCreateResponse`:

**Before:**
```json
{
  "data": { "id": "...", "status": "PENDING", ... }
}
```

**After (no collision):**
```json
{
  "data": {
    "sale": { "id": "...", "status": "DRAFT", ... }
  }
}
```

**After (collision detected):**
```json
{
  "data": {
    "sale": { "id": "...", "status": "DRAFT", ... },
    "collisionWarning": {
      "matched": true,
      "matchedClientId": "client_xyz",
      "matchedClientName": "Jane Smith",
      "matchedClientEmail": "jane@example.com"
    }
  }
}
```

**Breaking change:** The `data` field structure changes from a flat `ISale` to a nested `{ sale, collisionWarning? }`. All existing consumers of `POST /sales` must be updated. Coordinate with frontend to update SM-FE-007.

---

## Acceptance Criteria

1. `POST /sales` with a `leadId` whose lead has `convertedClientId` set — response has no `collisionWarning` field; the sale is linked to the converted client.
2. `POST /sales` with a `leadId` whose lead has no `convertedClientId` but an email match finds a DIFFERENT existing client — response includes `collisionWarning.matched: true` with the matched client's ID, name, and email.
3. `POST /sales` with a `leadId` whose lead has no `convertedClientId` and no email match exists — response has no `collisionWarning`; a new client is created from the lead data.
4. `POST /sales` with a direct `clientId` (no `leadId`) — response has no `collisionWarning`.
5. In the collision case, the sale is still created successfully (HTTP 201). The collision warning does not block creation.
6. In the collision case, the sale is linked to the email-matched client (not a new duplicate client).
7. `resolveClientIdFromLead()` throws `NotFoundException` if the `leadId` does not exist in the organization.
8. `resolveClientIdFromLead()` throws `UnprocessableEntityException` if the lead has no email and no `convertedClientId`.
9. The `collisionWarning` field is omitted from the response (not `null`) when no collision is detected.
10. `GET /sales/:id` does NOT include `collisionWarning` in the response (it is a creation-only field).

---

## Edge Cases

1. **Lead email is null/empty:** The method throws `UnprocessableEntityException` rather than attempting a null-email lookup. The error message must be informative.
2. **Multiple existing clients match the same email:** `findFirst` returns one (the first match). If this is a concern, log a warning. For Phase 1, using the first match is acceptable.
3. **`clientId` provided alongside `leadId`:** Implement a priority rule: if `clientId` is explicitly provided, use it directly and skip `resolveClientIdFromLead()` entirely. Document this rule.
4. **Lead with `convertedClientId` but the referenced client no longer exists (deleted):** `findFirst` on `convertedClientId` will return the ID but the client record may be soft-deleted or missing. Add a verification step: if `convertedClientId` is set, verify the client exists. If not, fall through to email-match logic.
5. **Collision warning on a sale created without a `leadId`:** This cannot occur — collision detection only runs when `leadId` is provided and `clientId` is not. Direct client-ID sales never trigger this path.

---

## Dependencies

- **SM-BE-001** — No schema dependency, but SM-BE-001 should be applied first for consistency.
- Requires knowledge of the actual `Lead` and `Client` Prisma model field names. Inspect schema before implementing.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.service.spec.ts`

- Test `resolveClientIdFromLead()`: lead has `convertedClientId` — expect `{ clientId: lead.convertedClientId }` returned with no `collisionWarning`.
- Test `resolveClientIdFromLead()`: lead has no `convertedClientId`, email match found — expect `{ clientId: matchedClient.id, collisionWarning: { matched: true, ... } }`.
- Test `resolveClientIdFromLead()`: lead has no `convertedClientId`, no email match — expect `{ clientId: newClient.id }` with no `collisionWarning` and `prisma.client.create` called once.
- Test `resolveClientIdFromLead()`: lead not found — expect `NotFoundException`.
- Test `resolveClientIdFromLead()`: lead has no email and no `convertedClientId` — expect `UnprocessableEntityException`.
- Test `create()` with leadId triggering collision — verify response includes `collisionWarning`.
- Test `create()` with direct `clientId` — verify `resolveClientIdFromLead` is NOT called.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/sales/__tests__/sales.integration.spec.ts`

- `POST /sales` with leadId that has a collision — HTTP 201, body includes `collisionWarning`.
- `POST /sales` with leadId with no collision — HTTP 201, body omits `collisionWarning`.
- `POST /sales` with direct `clientId` — HTTP 201, body omits `collisionWarning`.

### Manual QA Checks

- [ ] Create a lead with email `test@example.com`. Create a separate client also with `test@example.com`. Create a sale with the lead's ID. Confirm the API response includes `collisionWarning` with the existing client's details.
- [ ] Create a lead with a unique email not matching any existing client. Create a sale with this lead's ID. Confirm no `collisionWarning` in response and a new client was created.
- [ ] Create a lead and convert it (set `convertedClientId`). Create a sale with this lead. Confirm no `collisionWarning`.

---

## Verification Steps

- [ ] `resolveClientIdFromLead()` returns `{ clientId, collisionWarning? }` (not a bare string).
- [ ] `ISaleCreateResponse` interface defined with `sale: ISale` and `collisionWarning?: IClientCollisionWarning`.
- [ ] `IClientCollisionWarning` interface defined with `matched`, `matchedClientId`, `matchedClientName`, `matchedClientEmail`.
- [ ] `create()` return type is `Promise<ISaleCreateResponse>`.
- [ ] Controller `create()` returns `CommApiResponse<ISaleCreateResponse>`.
- [ ] `POST /sales` response includes `collisionWarning` when email collision detected.
- [ ] `GET /sales/:id` response does NOT include `collisionWarning`.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema changes.** Rollback is code revert.
- **Breaking response shape change.** The `POST /sales` response changes from returning `ISale` directly to wrapping it in `{ sale, collisionWarning? }`. All clients (including the frontend) must be updated to handle this new shape. Coordinate the deployment of this backend change with SM-FE-007.
- **Low risk of data corruption.** The collision warning is purely informational. The core create logic is unchanged in terms of which client is linked to the sale.
