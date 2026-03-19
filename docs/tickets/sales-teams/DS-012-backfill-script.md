# DS-012: Backfill Script (Existing Leads → teamId)

## Priority: P2
## Estimate: 2-3 hours
## Depends On: DS-001, DS-008

---

## Summary
One-time migration script to set `Lead.teamId` on existing leads that have a `brandId` mapped to a team via `TeamBrand`. Runs after DS-001 (schema) and DS-009 (brand-team assignments are configured).

---

## Implementation Details

### 1. Script Location

```
libs/backend/prisma-client/prisma/scripts/backfill-lead-team-ids.ts
```

### 2. Script Logic

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillLeadTeamIds() {
  console.log('Starting Lead.teamId backfill...');

  // 1. Get all team-brand mappings
  const teamBrands = await prisma.teamBrand.findMany({
    select: { teamId: true, brandId: true },
  });

  if (teamBrands.length === 0) {
    console.log('No team-brand mappings found. Nothing to backfill.');
    return;
  }

  const brandTeamMap = new Map(teamBrands.map(tb => [tb.brandId, tb.teamId]));
  console.log(`Found ${teamBrands.length} brand-team mappings.`);

  // 2. Find leads with brandId but null teamId
  const leadsToUpdate = await prisma.lead.findMany({
    where: {
      teamId: null,
      brandId: { in: [...brandTeamMap.keys()] },
    },
    select: { id: true, brandId: true },
  });

  console.log(`Found ${leadsToUpdate.length} leads to backfill.`);

  if (leadsToUpdate.length === 0) {
    console.log('All leads already have teamId set. Nothing to do.');
    return;
  }

  // 3. Batch update in chunks of 500
  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < leadsToUpdate.length; i += BATCH_SIZE) {
    const batch = leadsToUpdate.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(lead =>
        prisma.lead.update({
          where: { id: lead.id },
          data: { teamId: brandTeamMap.get(lead.brandId!) },
        })
      )
    );

    updated += batch.length;
    console.log(`Updated ${updated}/${leadsToUpdate.length} leads...`);
  }

  console.log(`Backfill complete. ${updated} leads updated.`);
}

backfillLeadTeamIds()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 3. Run Command

```bash
cd libs/backend/prisma-client
npx ts-node prisma/scripts/backfill-lead-team-ids.ts
```

Or add to package.json:
```json
"scripts": {
  "backfill:lead-teams": "ts-node prisma/scripts/backfill-lead-team-ids.ts"
}
```

### 4. Safety

- **Idempotent**: only updates leads where `teamId IS NULL`. Running twice is safe.
- **Non-destructive**: never overwrites existing teamId values.
- **Batched**: 500 leads per transaction to avoid timeout.
- **Reversible**: set teamId back to null if needed: `UPDATE "Lead" SET "teamId" = NULL WHERE ...`

---

## Expected Behavior

1. Run script after TeamBrand assignments are configured (DS-009)
2. All existing leads with a brandId that maps to a team get their teamId set
3. Leads with no brandId or unmapped brandId are skipped
4. Leads that already have a teamId are skipped
5. Output logs progress: `Updated 500/2000 leads...`

---

## Edge Cases

- **No TeamBrand mappings**: Script exits early, no updates
- **Lead has brandId but brand is not mapped to any team**: Skipped (teamId stays null)
- **Lead already has teamId**: Skipped (WHERE teamId IS NULL)
- **Large dataset (100k+ leads)**: Batched in chunks of 500 — each batch is a separate transaction
- **Script interrupted mid-run**: Safe to re-run — idempotent
- **Brand mapped to team A, then reassigned to team B**: Script uses CURRENT mapping. If you want historical accuracy, don't reassign brands before running backfill.

---

## Testing Checklist

- [ ] **Happy path**: 10 leads with mapped brands → all get teamId
- [ ] **No mappings**: script exits cleanly, 0 updates
- [ ] **Mixed**: some leads have teamId, some don't → only nulls updated
- [ ] **Idempotent**: run twice → second run updates 0 leads
- [ ] **Large batch**: 1000+ leads → batched correctly, no timeout
- [ ] **Unmapped brands**: leads with unmapped brandId skipped
- [ ] **Null brandId**: leads with no brandId skipped

---

## Files Created

- `libs/backend/prisma-client/prisma/scripts/backfill-lead-team-ids.ts` (NEW)
- `libs/backend/prisma-client/package.json` (add script command — optional)
