# DS-009: TeamBrand Management API + UI

## Priority: P1
## Estimate: 5-6 hours
## Depends On: DS-001

---

## Summary
Create CRUD API and UI for managing brand-to-team assignments. OWNER/ADMIN can assign brands to teams. One brand can only belong to one team (enforced by DB unique constraint).

---

## Implementation Details

### Backend: TeamBrand Controller + Service

```
apps/backend/core-service/src/modules/team-brands/
├── team-brands.module.ts
├── team-brands.controller.ts
├── team-brands.service.ts
└── dto/
    ├── assign-brand.dto.ts
    └── unassign-brand.dto.ts
```

### 1. DTOs

```typescript
// assign-brand.dto.ts
export class AssignBrandDto {
  @IsString() @MinLength(1)
  teamId!: string;

  @IsString() @MinLength(1)
  brandId!: string;
}

// unassign-brand.dto.ts — brandId in URL param, no body needed
```

### 2. Service

```typescript
@Injectable()
export class TeamBrandsService {
  constructor(
    private prisma: PrismaService,
    private scopeService: ScopeService,
  ) {}

  /** List all team-brand mappings for the org */
  async findAll(orgId: string) {
    return this.prisma.teamBrand.findMany({
      where: {
        team: { organizationId: orgId, deletedAt: null },
      },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
      orderBy: { team: { name: 'asc' } },
    });
  }

  /** Assign brand to team. Fails if brand already assigned to another team. */
  async assign(dto: AssignBrandDto, orgId: string) {
    // Verify team belongs to org
    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, organizationId: orgId, deletedAt: null },
    });
    if (!team) throw new NotFoundException('Team not found');

    // Verify brand belongs to org
    const brand = await this.prisma.brand.findFirst({
      where: { id: dto.brandId, organizationId: orgId },
    });
    if (!brand) throw new NotFoundException('Brand not found');

    // Check if brand is already assigned to another team
    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId: dto.brandId },
      select: { teamId: true, team: { select: { name: true } } },
    });
    if (existing && existing.teamId !== dto.teamId) {
      throw new ConflictException(
        `Brand is already assigned to team "${existing.team.name}". Unassign it first.`
      );
    }

    // Upsert (idempotent — assigning same brand to same team is no-op)
    const result = await this.prisma.teamBrand.upsert({
      where: { brandId: dto.brandId },
      create: { teamId: dto.teamId, brandId: dto.brandId },
      update: { teamId: dto.teamId },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    // Invalidate scope for all team members
    await this.scopeService.invalidateTeam(dto.teamId, orgId);

    return result;
  }

  /** Unassign brand from its team */
  async unassign(brandId: string, orgId: string) {
    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true, team: { select: { organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Brand is not assigned to any team');
    if (existing.team.organizationId !== orgId) throw new NotFoundException('Not found');

    await this.prisma.teamBrand.delete({ where: { brandId } });

    // Invalidate scope for affected team
    await this.scopeService.invalidateTeam(existing.teamId, orgId);

    return { ok: true };
  }

  /** Reassign brand from one team to another */
  async reassign(brandId: string, newTeamId: string, orgId: string) {
    const existing = await this.prisma.teamBrand.findUnique({
      where: { brandId },
      select: { teamId: true },
    });
    const oldTeamId = existing?.teamId;

    const result = await this.prisma.teamBrand.upsert({
      where: { brandId },
      create: { teamId: newTeamId, brandId },
      update: { teamId: newTeamId },
      include: {
        team: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    // Invalidate both old and new teams
    if (oldTeamId) await this.scopeService.invalidateTeam(oldTeamId, orgId);
    await this.scopeService.invalidateTeam(newTeamId, orgId);

    return result;
  }
}
```

### 3. Controller

```typescript
@Controller('team-brands')
export class TeamBrandsController {
  constructor(private service: TeamBrandsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  findAll(@CurrentUser('orgId') orgId: string) {
    return this.service.findAll(orgId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  assign(@Body() dto: AssignBrandDto, @CurrentUser('orgId') orgId: string) {
    return this.service.assign(dto, orgId);
  }

  @Delete(':brandId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  unassign(@Param('brandId') brandId: string, @CurrentUser('orgId') orgId: string) {
    return this.service.unassign(brandId, orgId);
  }
}
```

### 4. Frontend: Brand Assignment UI

Add a "Brand Assignments" section to the Sales Teams settings page or as a separate settings page.

```
apps/frontend/sales-dashboard/src/app/dashboard/settings/brand-assignments/
└── page.tsx
```

**UI Components:**
- Table showing all brands with their assigned team (or "Unassigned")
- Dropdown to assign/change team for each brand
- Confirmation dialog when reassigning (warns about scope impact)
- "Unassign" button to remove brand from team

**UI Flow:**
1. Load brands list + team-brand mappings
2. For each brand row: show brand name, current team (or "—"), action dropdown
3. Select team from dropdown → POST /team-brands → refresh list
4. Click unassign → DELETE /team-brands/:brandId → refresh list

### 5. Add to Sidebar

Add "Brand Assignments" to `settingsNavigation` in sidebar, restricted to OWNER/ADMIN.

### 6. API Client

```typescript
// apps/frontend/sales-dashboard/src/lib/api.ts
getTeamBrands: () => fetchApi('/team-brands'),
assignTeamBrand: (teamId: string, brandId: string) =>
  fetchApi('/team-brands', { method: 'POST', body: { teamId, brandId } }),
unassignTeamBrand: (brandId: string) =>
  fetchApi(`/team-brands/${brandId}`, { method: 'DELETE' }),
```

---

## Expected Behavior

1. **OWNER/ADMIN opens Brand Assignments page**: sees all brands with team assignments
2. **Assign brand to team**: brand appears under that team, scope invalidated
3. **Reassign brand**: old team loses access, new team gains access (after scope refresh)
4. **Unassign brand**: brand has no team → only OWNER/ADMIN can see its data
5. **Try to assign brand to 2 teams**: 409 Conflict with clear message
6. **Non-admin tries to access**: 403 Forbidden (role guard)

---

## Edge Cases

- **Brand already assigned**: Conflict error with team name in message
- **Assign to same team (idempotent)**: Upsert, no error, no scope change
- **Delete team that has brands**: TeamBrand rows should be cascade-deleted (add `onDelete: Cascade` to TeamBrand.team relation in schema)
- **Reassign brand mid-day**: Existing leads keep old teamId (historical), new leads get new team
- **Org has 0 brands**: Empty table, "No brands yet" message
- **Org has 0 teams**: Brand dropdown disabled, "Create teams in HRMS first" message

---

## Testing Checklist

- [ ] **GET /team-brands** returns all mappings for org
- [ ] **POST /team-brands** assigns brand to team
- [ ] **POST /team-brands** — brand already assigned to different team → 409
- [ ] **POST /team-brands** — same team assignment (idempotent) → 200
- [ ] **DELETE /team-brands/:brandId** unassigns brand
- [ ] **DELETE /team-brands/:brandId** — not assigned → 404
- [ ] **Role guard**: non-OWNER/ADMIN → 403
- [ ] **Scope invalidation fires** after assign/unassign/reassign
- [ ] **Frontend: brand list renders** with correct team assignments
- [ ] **Frontend: assign brand** via dropdown → success toast
- [ ] **Frontend: unassign brand** → confirmation dialog → success
- [ ] **Frontend: error handling** — conflict shows clear message

---

## Files Created/Modified

- `apps/backend/core-service/src/modules/team-brands/team-brands.module.ts` (NEW)
- `apps/backend/core-service/src/modules/team-brands/team-brands.controller.ts` (NEW)
- `apps/backend/core-service/src/modules/team-brands/team-brands.service.ts` (NEW)
- `apps/backend/core-service/src/modules/team-brands/dto/assign-brand.dto.ts` (NEW)
- `apps/backend/core-service/src/app/app.module.ts` (import TeamBrandsModule)
- `apps/frontend/sales-dashboard/src/app/dashboard/settings/brand-assignments/page.tsx` (NEW)
- `apps/frontend/sales-dashboard/src/components/sidebar.tsx` (add nav item)
- `apps/frontend/sales-dashboard/src/lib/api.ts` (add API methods)
