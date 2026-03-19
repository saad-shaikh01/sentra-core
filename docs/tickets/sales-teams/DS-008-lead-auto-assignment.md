# DS-008: Lead Auto-Assignment (teamId + Brand Resolution)

## Priority: P1
## Estimate: 3-4 hours
## Depends On: DS-001, DS-002

---

## Summary
When a lead is created or assigned, automatically set `Lead.teamId` based on the lead's brand → TeamBrand mapping. This is the **historical attribution** model: teamId is set at assignment time and never changes when users move teams.

---

## Implementation Details

### 1. Brand → Team Resolution Helper

```typescript
// apps/backend/core-service/src/modules/scope/team-brand.helper.ts

@Injectable()
export class TeamBrandHelper {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve which team owns a brand.
   * Returns null if brand has no team mapping (unassigned brand).
   */
  async resolveTeamForBrand(brandId: string): Promise<string | null> {
    const mapping = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true },
    });
    return mapping?.teamId ?? null;
  }
}
```

### 2. Hook into Lead Creation

```typescript
// apps/backend/core-service/src/modules/leads/leads.service.ts

async create(data: CreateLeadDto, orgId: string, userId: string) {
  // Resolve teamId from brand
  let teamId: string | null = null;
  if (data.brandId) {
    teamId = await this.teamBrandHelper.resolveTeamForBrand(data.brandId);
  }

  return this.prisma.lead.create({
    data: {
      ...data,
      organizationId: orgId,
      createdBy: userId,
      teamId,  // null if brand has no team mapping
    },
  });
}
```

### 3. Hook into Lead Assignment / Update

```typescript
async update(id: string, data: UpdateLeadDto, orgId: string) {
  const existing = await this.prisma.lead.findFirst({
    where: { id, organizationId: orgId },
    select: { brandId: true, teamId: true },
  });

  let teamId = existing?.teamId;

  // Re-resolve teamId if brand changes
  if (data.brandId && data.brandId !== existing?.brandId) {
    teamId = await this.teamBrandHelper.resolveTeamForBrand(data.brandId);
  }

  return this.prisma.lead.update({
    where: { id },
    data: {
      ...data,
      teamId,
    },
  });
}
```

### 4. Hook into Lead Import (Bulk)

```typescript
async importLeads(leads: CreateLeadDto[], orgId: string, userId: string) {
  // Batch resolve: get all unique brandIds → teamIds in one query
  const uniqueBrandIds = [...new Set(leads.map(l => l.brandId).filter(Boolean))];
  const mappings = await this.prisma.teamBrand.findMany({
    where: { brandId: { in: uniqueBrandIds } },
    select: { brandId: true, teamId: true },
  });
  const brandTeamMap = new Map(mappings.map(m => [m.brandId, m.teamId]));

  // Create leads with resolved teamIds
  const createData = leads.map(l => ({
    ...l,
    organizationId: orgId,
    createdBy: userId,
    teamId: l.brandId ? (brandTeamMap.get(l.brandId) ?? null) : null,
  }));

  return this.prisma.lead.createMany({ data: createData });
}
```

### 5. What Happens When Brand-Team Mapping Changes

**Lead.teamId does NOT retroactively change.** This is the historical attribution model:
- Lead A was created when Brand X belonged to Team 1 → `Lead A.teamId = Team 1`
- Brand X is now reassigned to Team 2
- Lead A still has `teamId = Team 1`
- NEW leads under Brand X get `teamId = Team 2`

If the business wants to retroactively update, they use the backfill script (DS-012).

### 6. What Happens When User Moves Teams

**Lead.teamId does NOT change.** The lead belongs to the team it was assigned to when created. If user moves to another team, their old leads stay with the old team.

The user can still see their own assigned leads (via `assignedToId` filter), but the team reporting shows those leads under the original team.

---

## Expected Behavior

1. **New lead with brand A (mapped to Team 1)**: `Lead.teamId = Team 1 ID`
2. **New lead with brand B (no team mapping)**: `Lead.teamId = null`
3. **Lead brand changed from A to C (mapped to Team 2)**: `Lead.teamId = Team 2 ID`
4. **Lead brand changed from A to D (no mapping)**: `Lead.teamId = null`
5. **Lead assigned to different user**: `teamId` unchanged (historical attribution)
6. **Bulk import 100 leads**: all teamIds resolved in a single batch query (1 DB call for mappings)

---

## Edge Cases

- **Brand with no TeamBrand mapping**: `teamId = null`. Lead is visible to OWNER/ADMIN only (not scoped to any team).
- **Brand assigned to team AFTER lead creation**: Existing leads keep `teamId = null` unless backfilled (DS-012).
- **Lead has no brandId**: `teamId = null`. Should be rare — UI requires brand selection.
- **User in 2 teams creates lead**: teamId resolved from BRAND, not from user's team. No ambiguity.
- **TeamBrand deleted (brand unassigned)**: Existing leads keep their teamId. New leads under this brand get `teamId = null`.

---

## Testing Checklist

- [ ] **Create lead with mapped brand** → teamId set correctly
- [ ] **Create lead with unmapped brand** → teamId is null
- [ ] **Create lead with no brand** → teamId is null
- [ ] **Update lead brand (mapped → mapped)** → teamId updated
- [ ] **Update lead brand (mapped → unmapped)** → teamId set to null
- [ ] **Update lead (non-brand fields)** → teamId unchanged
- [ ] **Import 50 leads with 3 different brands** → all teamIds resolved in 1 batch query
- [ ] **Brand-team mapping changes** → existing leads' teamId unchanged
- [ ] **Delete TeamBrand** → new leads get null teamId, existing unchanged
- [ ] **Assign lead to different user** → teamId unchanged (historical attribution)

---

## Files Modified

- `apps/backend/core-service/src/modules/scope/team-brand.helper.ts` (NEW)
- `apps/backend/core-service/src/modules/leads/leads.service.ts` (add teamId resolution)
- `apps/backend/core-service/src/modules/scope/scope.module.ts` (export TeamBrandHelper)
