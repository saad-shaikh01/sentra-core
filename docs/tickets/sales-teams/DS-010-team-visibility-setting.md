# DS-010: Team Visibility Setting (allowMemberVisibility)

## Priority: P1
## Estimate: 2-3 hours
## Depends On: DS-002

---

## Summary
Add per-team toggle for `allowMemberVisibility`. When ON, team members (FRONTSELL_AGENT) can see all data under the team's brands (clients, sales, invoices). When OFF, they only see their own assigned data.

---

## Implementation Details

### 1. Backend: Add to Team Update API

The `allowMemberVisibility` column was added in DS-001. Now expose it in the HRMS team update endpoint.

```typescript
// apps/backend/hrms-service/src/modules/teams/dto/update-team.dto.ts
// Add to existing DTO:
@IsOptional()
@IsBoolean()
allowMemberVisibility?: boolean;
```

```typescript
// apps/backend/hrms-service/src/modules/teams/teams.service.ts
// In update method, include allowMemberVisibility in the Prisma update data
// After update, fire scope invalidation for the team
async update(id: string, dto: UpdateTeamDto, orgId: string) {
  const team = await this.prisma.team.update({
    where: { id },
    data: {
      ...dto,
      // allowMemberVisibility is included if present in dto
    },
  });

  // If visibility changed, invalidate all team members' scopes
  if (dto.allowMemberVisibility !== undefined) {
    await this.notifyScopeInvalidation('team', { teamId: id, orgId });
  }

  return team;
}
```

### 2. Include in Team Response

Ensure `allowMemberVisibility` is returned in team GET endpoints (both HRMS and core-service).

```typescript
// In team findAll/findOne responses, include:
{
  id: team.id,
  name: team.name,
  // ... other fields ...
  allowMemberVisibility: team.allowMemberVisibility,
}
```

### 3. Frontend: Toggle in Team Detail (HRMS Dashboard)

Add a Switch/Toggle in the HRMS team edit form:

```tsx
<div className="flex items-center justify-between">
  <div>
    <Label>Member Data Visibility</Label>
    <p className="text-xs text-muted-foreground">
      When enabled, team members can see all data (clients, sales, invoices)
      under this team's brands. When disabled, members only see their own assigned data.
    </p>
  </div>
  <Switch
    checked={form.allowMemberVisibility}
    onCheckedChange={(checked) => setForm(f => ({ ...f, allowMemberVisibility: checked }))}
  />
</div>
```

### 4. Frontend: Show Status in Sales Dashboard Team List

In the read-only sales-teams page, show a badge indicating visibility status:

```tsx
{team.allowMemberVisibility ? (
  <Badge variant="secondary" className="text-[10px]">Team Visibility ON</Badge>
) : (
  <Badge variant="outline" className="text-[10px]">Individual Only</Badge>
)}
```

---

## Expected Behavior

1. **Default**: `allowMemberVisibility = false` — members see only own data
2. **Toggle ON**: Members (FRONTSELL_AGENT) in this team can see all clients/sales/invoices under team brands
3. **Toggle OFF**: Members revert to own-assigned-only visibility
4. **Scope invalidation**: Toggling triggers cache invalidation for all team members
5. **SALES_MANAGER**: Unaffected — managers always see team brand data regardless of toggle
6. **OWNER/ADMIN**: Unaffected — always full access

---

## Edge Cases

- **User in 2 teams, one has visibility ON**: `memberVisibleTeamIds` has at least one entry → agent gets brand-scoped access for ALL their teams' brands (union). This is intentional — partial visibility would be confusing.
- **Toggle while users are active**: Scope cache invalidated → next request uses new setting. In-flight requests use old scope (acceptable).
- **Team with no brands**: Toggle has no practical effect — no brand data to show regardless.

---

## Testing Checklist

- [ ] **Default OFF**: new team has `allowMemberVisibility = false`
- [ ] **Toggle ON via API**: PATCH updates field, scope invalidated
- [ ] **Toggle OFF via API**: field updated, scope invalidated
- [ ] **FRONTSELL in team (vis ON)**: sees all team brand clients/sales/invoices
- [ ] **FRONTSELL in team (vis OFF)**: sees only own assigned data
- [ ] **SALES_MANAGER unaffected**: always sees team brand data
- [ ] **HRMS UI**: toggle renders, changes saved on team update
- [ ] **Sales dashboard**: visibility badge shows correct state

---

## Files Modified

- `apps/backend/hrms-service/src/modules/teams/dto/update-team.dto.ts` (add field)
- `apps/backend/hrms-service/src/modules/teams/teams.service.ts` (include in update + invalidation)
- `apps/backend/core-service/src/modules/teams/teams.service.ts` (include in response)
- `apps/frontend/hrms-dashboard/src/app/dashboard/teams/_components/create-edit-team-modal.tsx` (add toggle)
- `apps/frontend/sales-dashboard/src/app/dashboard/settings/sales-teams/page.tsx` (show badge)
