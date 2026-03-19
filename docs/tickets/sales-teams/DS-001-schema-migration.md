# DS-001: Schema Migration — TeamBrand Junction + Indexes

## Priority: P0 (blocks everything)
## Estimate: 2-3 hours
## Depends On: None

---

## Summary
Create the `TeamBrand` junction table linking teams to brands, add `allowMemberVisibility` to Team, add performance indexes, and ensure `Lead.teamId` is properly indexed.

---

## Implementation Details

### 1. Prisma Schema Changes

```prisma
// NEW: TeamBrand junction — 1 brand belongs to exactly 1 team
model TeamBrand {
  id        String   @id @default(cuid())
  teamId    String
  brandId   String   @unique  // UNIQUE constraint: 1 brand = 1 team
  team      Team     @relation(fields: [teamId], references: [id])
  brand     Brand    @relation(fields: [brandId], references: [id])
  createdAt DateTime @default(now())

  @@unique([teamId, brandId])    // prevent duplicate pair
  @@index([teamId])
  @@index([brandId])
}

// UPDATE Team model — add:
model Team {
  // ... existing fields ...
  allowMemberVisibility Boolean    @default(false)
  teamBrands            TeamBrand[]
}

// UPDATE Brand model — add:
model Brand {
  // ... existing fields ...
  teamBrand TeamBrand?  // singular — brand belongs to at most 1 team
}
```

### 2. Migration Script

```bash
cd libs/backend/prisma-client
npx prisma migrate dev --name ds-001-team-brand-junction
```

### 3. Additional Indexes (add to existing models)

```prisma
// Lead — ensure teamId is indexed for scope queries
model Lead {
  // teamId already exists
  @@index([teamId])
  @@index([organizationId, teamId])
  @@index([organizationId, brandId])
  @@index([organizationId, assignedToId])
}

// Client
model Client {
  @@index([organizationId, brandId])
  @@index([organizationId, upsellAgentId])
}

// Sale
model Sale {
  @@index([organizationId, brandId])
  @@index([organizationId, assignedToId])
  @@index([organizationId, clientId])
}

// Invoice — joins through Sale, so index saleId
model Invoice {
  @@index([saleId])
}
```

### 4. Update Prisma Client Generation

After migration, regenerate client:
```bash
npx prisma generate
```

---

## Expected Behavior

1. `TeamBrand` table created with unique constraint on `brandId` (1 brand → 1 team)
2. `Team.allowMemberVisibility` defaults to `false` for all existing teams
3. All indexes created for performant scope queries
4. `Lead.teamId` index exists (may already exist — migration should be idempotent)
5. Existing data is unaffected — no data modifications in this migration

---

## Edge Cases

- **Brand with no team**: Valid — brand simply has no TeamBrand row. Leads under this brand have no team scope (visible to OWNER/ADMIN only until assigned).
- **Existing Lead.teamId values**: Unchanged. Backfill script (DS-012) handles historical data.
- **TeamBrand.brandId unique violation**: If someone tries to assign a brand to a second team, Prisma throws a unique constraint error. The API (DS-009) must handle this gracefully.

---

## Testing Checklist

- [ ] Migration runs cleanly on empty database (`prisma migrate reset`)
- [ ] Migration runs cleanly on existing database with data
- [ ] `TeamBrand` table exists with correct columns and constraints
- [ ] `brandId` unique constraint works — inserting duplicate brand fails
- [ ] `Team.allowMemberVisibility` column exists, defaults to `false`
- [ ] All new indexes visible in `\d+ table_name` (psql) or Prisma Studio
- [ ] `npx prisma generate` succeeds — TypeScript types include new models
- [ ] Existing CRUD operations on Team, Brand, Lead still work (no regression)
- [ ] Rollback: `prisma migrate resolve` or down migration drops TeamBrand cleanly

---

## Files Modified

- `libs/backend/prisma-client/prisma/schema.prisma`
- `libs/backend/prisma-client/prisma/migrations/<timestamp>_ds_001_team_brand_junction/migration.sql` (auto-generated)
