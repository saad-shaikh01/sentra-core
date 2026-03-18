You are implementing Sales Teams integration. This spans a backend subagent (SALES-TEAMS-001) and a
frontend subagent (SALES-TEAMS-002), followed by a test subagent.

---

## Critical context to read FIRST (all subagents):

### Backend files to understand before touching anything:
1. `libs/backend/prisma-client/prisma/schema.prisma` lines 946-981 — Lead model (no teamId yet)
2. `libs/backend/prisma-client/prisma/schema.prisma` lines 706-740 — Team model (HRMS teams, added in HRMS phase)
3. `apps/backend/core-service/src/modules/leads/leads.service.ts` — full service (especially `findAll()` at line 439, `update()` at line 569)
4. `apps/backend/core-service/src/modules/leads/dto/update-lead.dto.ts` — what fields exist
5. `apps/backend/core-service/src/modules/leads/dto/query-leads.dto.ts` — what filters exist
6. `apps/backend/core-service/src/modules/leads/leads.module.ts` — current imports
7. `apps/backend/core-service/src/modules/auth/auth.module.ts` — exports PermissionsService
8. `apps/backend/core-service/src/modules/leads/leads.controller.ts` — route structure

### Frontend files to understand before touching anything:
1. `apps/frontend/sales-dashboard/src/lib/api.ts` — single ApiClient class pointing to core-service
2. `apps/frontend/sales-dashboard/src/hooks/use-leads.ts` — React Query hooks for leads
3. `apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx` — leads page with filters
4. `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx` — lead detail
5. `apps/frontend/hrms-dashboard/src/components/shared/team-type-badge.tsx` — TeamTypeBadge component (copy this)

---

## SUBAGENT 1 — SALES-TEAMS-001: Backend

### What exists:
- **Existing `SalesTeam` model** (schema lines 466+): old sales team system with managers/members, used by `TeamsService` in `apps/backend/core-service/src/modules/teams/`. This is SEPARATE from HRMS teams and must NOT be touched.
- **New `Team` model** (schema lines 706+): HRMS-managed teams added in a previous phase. These are what we link Leads to.
- `LeadsService` already injects `TeamsService` (the old SalesTeam service). The `SALES_MANAGER` visibility uses `this.teams.getMemberIds()` which queries `SalesTeam` — keep this unchanged.
- `Sale` model has no direct relation to `Lead` or `Team`. Skip revenue in team stats.

### Step 1: Schema changes

READ `libs/backend/prisma-client/prisma/schema.prisma` around line 706 to see the Team model.
READ the Lead model at line 946.

Add to the **Lead model** (after `assignedToId`/`assignedTo` lines):
```prisma
  teamId String?
  team   Team?   @relation("LeadTeam", fields: [teamId], references: [id])

  @@index([teamId])
```

Add back-relation to the **Team model** (after the `members TeamMember[]` line):
```prisma
  leads Lead[] @relation("LeadTeam")
```

Run migration:
```bash
cd libs/backend/prisma-client
npx prisma migrate dev --name sales-teams-001-lead-team-assignment
```

Verify migration applied:
```bash
npx prisma validate
```

### Step 2: DTO changes

#### `apps/backend/core-service/src/modules/leads/dto/update-lead.dto.ts`

Add these imports if not present: `IsUUID, ValidateIf` from `class-validator`.
Add the teamId field:
```typescript
  @IsOptional()
  @ValidateIf((o) => o.teamId !== null)
  @IsUUID()
  teamId?: string | null;
```

#### `apps/backend/core-service/src/modules/leads/dto/query-leads.dto.ts`

Add:
```typescript
  @IsOptional()
  @IsUUID()
  teamId?: string;
```

### Step 3: leads.module.ts — inject AuthModule for PermissionsService

READ `apps/backend/core-service/src/modules/leads/leads.module.ts`.
READ `apps/backend/core-service/src/modules/auth/auth.module.ts` — it exports `PermissionsService`.

AuthModule does NOT import LeadsModule, so no circular dependency.

Update `leads.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { TeamsModule } from '../teams';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TeamsModule, AuthModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
```

### Step 4: leads.service.ts — inject PermissionsService, add teamId logic

READ `apps/backend/core-service/src/modules/leads/leads.service.ts` fully.
READ `apps/backend/core-service/src/common/services/permissions.service.ts` to see `getUserPermissions()` signature.

#### 4a. Update imports and constructor

Add to imports:
```typescript
import { PermissionsService } from '../../common';
```

Update constructor:
```typescript
constructor(
  private prisma: PrismaService,
  private cache: CacheService,
  private teams: TeamsService,
  private permissionsService: PermissionsService,
) {}
```

#### 4b. Add helper method `getTeamIdsForUser`

Add after the constructor:
```typescript
private async getTeamIdsForUser(userId: string, orgId: string): Promise<string[]> {
  const memberships = await this.prisma.teamMember.findMany({
    where: { userId },
    include: { team: { select: { id: true, organizationId: true } } },
  });
  return memberships
    .filter((m) => m.team.organizationId === orgId)
    .map((m) => m.teamId);
}
```

#### 4c. Update `findAll()` signature and visibility logic

The current `findAll()` signature: `findAll(orgId, query, userId, role: UserRole)`
The current `where` type declaration uses a narrow inline type. You need to expand it to support `teamId`.

**Replace** the existing `where` type declaration and visibility-scoping block. The new logic should:
1. Get user permissions via `this.permissionsService.getUserPermissions(userId, orgId)`
2. Check `sales:leads:view_all` → no visibility filter
3. Check `sales:leads:view_team` → own assigned + team leads (use `getTeamIdsForUser`)
4. Check `sales:leads:view_own` → only assigned to self
5. Fall back to existing role-based logic if no permission match (backwards compat)

Here is the updated visibility block to replace lines ~451-479 in the current `findAll()`:

```typescript
const { page, limit, status, leadType, source, assignedToId, brandId, dateFrom, dateTo, search, teamId } = query;

// Build visibility filter
const permissions = await this.permissionsService.getUserPermissions(userId, orgId);

const agentRoles: UserRole[] = [UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT];

let visibilityFilter: Prisma.LeadWhereInput = {};

if (permissions.includes('sales:leads:view_all')) {
  // no filter — see everything
} else if (permissions.includes('sales:leads:view_team')) {
  const userTeamIds = await this.getTeamIdsForUser(userId, orgId);
  if (userTeamIds.length > 0) {
    visibilityFilter = {
      OR: [
        { assignedToId: userId },
        { teamId: { in: userTeamIds } },
      ],
    };
  } else {
    visibilityFilter = { assignedToId: userId };
  }
} else if (permissions.includes('sales:leads:view_own')) {
  visibilityFilter = { assignedToId: userId };
} else {
  // Fallback: existing role-based visibility (preserves backward compat)
  if (agentRoles.includes(role)) {
    visibilityFilter = { assignedToId: userId };
  } else if (role === UserRole.SALES_MANAGER) {
    const memberIds = await this.teams.getMemberIds(userId, orgId);
    if (memberIds.length > 0) {
      visibilityFilter = { assignedToId: { in: [...memberIds, userId] } };
    }
  }
}
```

Then update the `where` object to use `visibilityFilter`:
```typescript
const where: Prisma.LeadWhereInput = {
  organizationId: orgId,
  deletedAt: null,
  ...visibilityFilter,
};
```

And remove the old narrow `where` type declaration (the one with inline union type). Use `Prisma.LeadWhereInput` instead.

Also add `teamId` filter after the other filters:
```typescript
if (teamId) (where as any).teamId = teamId;
// Or cleaner: if (teamId) where.teamId = teamId;
// (works since where is now Prisma.LeadWhereInput which has teamId after migration)
```

Also fix the `assignedToId` filter for non-agent users:
```typescript
if (assignedToId && !agentRoles.includes(role) && !permissions.includes('sales:leads:view_own')) {
  where.assignedToId = assignedToId;
}
```

#### 4d. Update `update()` to handle teamId

After the existing lead fetch at the start of `update()`, add team validation before the prisma.lead.update call:

```typescript
if (dto.teamId !== undefined) {
  if (dto.teamId !== null) {
    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, organizationId: orgId, deletedAt: null },
    });
    if (!team) throw new BadRequestException('Team not found or not in your organization');
  }
}
```

Add `teamId: dto.teamId` to the `data` object in `prisma.lead.update()`:
```typescript
data: {
  // ... existing fields ...
  teamId: dto.teamId,
},
```

#### 4e. Add `getTeamStats()` method

Add this method to LeadsService:

```typescript
async getTeamStats(
  teamId: string,
  orgId: string,
  period: string = 'this_month',
): Promise<{
  teamId: string;
  period: string;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: string;
}> {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (period) {
    case 'last_month': {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case 'this_quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterStart, 1);
      break;
    }
    case 'all_time': {
      startDate = new Date(0);
      break;
    }
    default: { // this_month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
  }

  const baseWhere: Prisma.LeadWhereInput = {
    teamId,
    organizationId: orgId,
    deletedAt: null,
    createdAt: { gte: startDate, lte: endDate },
  };

  const [totalLeads, wonLeads, lostLeads] = await Promise.all([
    this.prisma.lead.count({ where: baseWhere }),
    this.prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.CLOSED_WON } }),
    this.prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.CLOSED_LOST } }),
  ]);

  return {
    teamId,
    period,
    totalLeads,
    wonLeads,
    lostLeads,
    conversionRate: totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0',
  };
}
```

Note: `LeadStatus` import already exists in the file. Use `LeadStatus.CLOSED_WON` and `LeadStatus.CLOSED_LOST`.

### Step 5: Add team stats endpoint to leads.controller.ts

READ `apps/backend/core-service/src/modules/leads/leads.controller.ts`.

Add a new GET route for team stats. Add after the existing routes:

```typescript
@Get('teams/:teamId/stats')
@Permissions('sales:teams:view')
getTeamStats(
  @Param('teamId') teamId: string,
  @Query('period') period: string,
  @CurrentUser('orgId') orgId: string,
): Promise<{ teamId: string; period: string; totalLeads: number; wonLeads: number; lostLeads: number; conversionRate: string }> {
  return this.leadsService.getTeamStats(teamId, orgId, period ?? 'this_month');
}
```

Note: `Permissions` decorator is imported from `'../../common'` — already imported.

### Step 6: TypeScript check

```bash
cd apps/backend/core-service && npx tsc --noEmit
```

Fix any errors before reporting complete.

### Report back:
  ✅ SALES-TEAMS-001 COMPLETE
  - Migration name: `<name>`
  - Lead.teamId added to schema ✓
  - Team.leads back-relation added ✓
  - update-lead.dto.ts: teamId field added ✓
  - query-leads.dto.ts: teamId filter added ✓
  - leads.service.ts: permission-based visibility + team stats ✓
  - GET /leads/teams/:teamId/stats endpoint added ✓
  - tsc --noEmit passes ✓
  - Deviations: <list or "none">

---

## SUBAGENT 2 — SALES-TEAMS-002: Frontend

### What exists in sales-dashboard:
- **API client**: `src/lib/api.ts` — single `ApiClient` class calling core-service only (`NEXT_PUBLIC_API_URL`, default `http://localhost:3001/api`)
- **HRMS API** not yet configured in sales-dashboard — you need to add a second client
- **Leads page**: `src/app/dashboard/leads/page.tsx` — uses `useQueryStates` for filters
- **Lead detail sheet**: `src/app/dashboard/leads/_components/lead-detail-sheet.tsx`
- **Hooks**: `src/hooks/use-leads.ts`
- **Sidebar**: `src/components/sidebar.tsx` — has "Sales Teams" link at `/dashboard/settings/sales-teams` (stale — do NOT modify sidebar, we're just adding a new route)

### Step 1: Add HRMS API client to sales-dashboard

READ `apps/frontend/sales-dashboard/src/lib/api.ts` fully.

Add HRMS API base URL near the top:
```typescript
const HRMS_API_URL = process.env.NEXT_PUBLIC_HRMS_API_URL || 'http://localhost:3004/api/hrms';
```

Add a second export at the bottom of the file:
```typescript
export const hrmsApi = new ApiClient(HRMS_API_URL);
```

Also add these HRMS methods to the `ApiClient` class:
```typescript
// Team endpoints (HRMS)
async getTeams(params?: Record<string, unknown>) {
  const qs = buildQueryString(params);
  return this.fetch<any>(`/teams${qs}`);
}

async getTeam(id: string) {
  return this.fetch<any>(`/teams/${id}`);
}

async createTeam(dto: Record<string, unknown>) {
  return this.fetch<any>('/teams', { method: 'POST', body: JSON.stringify(dto) });
}

async updateTeam(id: string, dto: Record<string, unknown>) {
  return this.fetch<any>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

async deleteTeam(id: string) {
  return this.fetch<any>(`/teams/${id}`, { method: 'DELETE' });
}

async addTeamMember(teamId: string, dto: { userId: string; role?: string }) {
  return this.fetch<any>(`/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify(dto) });
}

async updateTeamMember(teamId: string, userId: string, dto: { role: string }) {
  return this.fetch<any>(`/teams/${teamId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

async removeTeamMember(teamId: string, userId: string) {
  return this.fetch<any>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
}

async getTeamTypes() {
  return this.fetch<any>('/team-types');
}
```

Also add a new method to the **core-service `api` client** (NOT hrmsApi):
```typescript
// Team stats (Sales, via core-service)
async getTeamStats(teamId: string, period = 'this_month') {
  return this.fetch<any>(`/leads/teams/${teamId}/stats?period=${period}`);
}
```

### Step 2: Create `src/hooks/use-teams.ts`

Create new file `apps/frontend/sales-dashboard/src/hooks/use-teams.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, hrmsApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export const teamKeys = {
  all:   ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list:  (params: object) => [...teamKeys.lists(), params] as const,
  detail: (id: string)   => [...teamKeys.all, 'detail', id] as const,
  stats:  (id: string, period: string) => [...teamKeys.all, 'stats', id, period] as const,
  types: ['team-types'] as const,
};

export function useTeams(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: teamKeys.list(params ?? {}),
    queryFn:  () => hrmsApi.getTeams({ isActive: true, ...params }),
    staleTime: 60_000,
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: teamKeys.detail(id),
    queryFn:  () => hrmsApi.getTeam(id),
    enabled:  !!id,
    staleTime: 60_000,
  });
}

export function useTeamStats(teamId: string, period = 'this_month') {
  return useQuery({
    queryKey: teamKeys.stats(teamId, period),
    queryFn:  () => api.getTeamStats(teamId, period),
    enabled:  !!teamId,
    staleTime: 30_000,
  });
}

export function useTeamTypes() {
  return useQuery({
    queryKey: teamKeys.types,
    queryFn:  () => hrmsApi.getTeamTypes(),
    staleTime: 300_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => hrmsApi.createTeam(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Team created');
    },
    onError: (e: Error) => toast.error('Failed to create team', e.message),
  });
}

export function useUpdateTeam(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => hrmsApi.updateTeam(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      qc.invalidateQueries({ queryKey: teamKeys.detail(id) });
      toast.success('Team updated');
    },
    onError: (e: Error) => toast.error('Failed to update team', e.message),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrmsApi.deleteTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      toast.success('Team deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete team', e.message),
  });
}

export function useAddTeamMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { userId: string; role?: string }) => hrmsApi.addTeamMember(teamId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      toast.success('Member added');
    },
    onError: (e: Error) => toast.error('Failed to add member', e.message),
  });
}

export function useUpdateTeamMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      hrmsApi.updateTeamMember(teamId, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
    onError: (e: Error) => toast.error('Failed to update role', e.message),
  });
}

export function useRemoveTeamMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => hrmsApi.removeTeamMember(teamId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      toast.success('Member removed');
    },
    onError: (e: Error) => toast.error('Failed to remove member', e.message),
  });
}
```

### Step 3: Create TeamTypeBadge component

READ `apps/frontend/hrms-dashboard/src/components/shared/team-type-badge.tsx` first.

Create `apps/frontend/sales-dashboard/src/components/shared/team-type-badge.tsx` with the SAME content as the HRMS version (copy it verbatim — deterministic slug→color).

### Step 4: Create Teams pages

#### 4a. Teams list page

Create `apps/frontend/sales-dashboard/src/app/dashboard/teams/page.tsx`:

```
READ the established page patterns from:
- src/app/dashboard/brands/page.tsx — for simple list page pattern
- src/app/dashboard/leads/page.tsx — for search + filter pattern
```

Page layout:
- `PageHeader` with title "Sales Teams" + `+ Create Team` button (if `canManage`)
- Search input (debounced 300ms) + Team Type filter dropdown (from `useTeamTypes()`)
- Team cards grid: 3-col on xl, 2-col on md, 1-col on sm
- Loading: skeleton cards
- Empty state: "No teams yet. Create your first team." with create button
- Error state: "Failed to load teams" with retry

Create `apps/frontend/sales-dashboard/src/app/dashboard/teams/_components/`:

**`team-type-badge.tsx`** — re-export from shared:
```typescript
export { TeamTypeBadge } from '@/components/shared/team-type-badge';
```

**`team-card.tsx`**:
```tsx
// Props: team (with type, manager, memberCount), stats (may be null/loading)
// Shows:
// ┌────────────────────────────────────┐
// │ [Ebook]  Ebook Team Alpha          │
// │ Manager: Jane Smith   5 members    │
// │ This month: 24 leads · 12 won      │
// │                   [View] [⋮ menu] │
// └────────────────────────────────────┘
// Clicking View → router.push(`/dashboard/teams/${team.id}`)
// ⋮ menu (manage permission only): Edit, Delete
```

**`team-filter-bar.tsx`**:
```tsx
// Search input + Type filter dropdown
// Props: search, onSearch, typeId, onTypeChange, teamTypes
```

**`create-edit-team-modal.tsx`**:
```tsx
// Dialog with:
// - Team Name (required)
// - Team Type: <Select> from useTeamTypes() — show system types first
// - Description: <Textarea> optional
// - Manager: debounced search combobox calling GET /api/hrms/employees?search=xxx&status=ACTIVE&limit=20
//   (via hrmsApi.getTeams(...) — add a getEmployees method to ApiClient if needed)
// Submit → useCreateTeam() or useUpdateTeam()
```

Add `getEmployees` to ApiClient in api.ts:
```typescript
async getEmployees(params?: Record<string, unknown>) {
  const qs = buildQueryString(params);
  return this.fetch<any>(`/employees${qs}`);
}
```
(This method goes on hrmsApi, used for manager picker.)

#### 4b. Team detail page

Create `apps/frontend/sales-dashboard/src/app/dashboard/teams/[id]/page.tsx`:

Layout:
- Back link to `/dashboard/teams`
- Team header: name, `TeamTypeBadge`, description, manager name, "Edit Team" button
- Stats cards row (from `useTeamStats(id)`):
  - Total Leads, Won Leads, Lost Leads, Conversion Rate
  - If stats loading → skeleton; if stats error → show "—"
  - Period selector: this_month | last_month | this_quarter | all_time
- Members table (from `useTeam(id)`): Avatar, Name, Role (inline selector), Email, Remove button
- "Add Member" button opens add-member modal

Create in `_components/`:

**`team-stats-cards.tsx`**:
```tsx
// Props: stats (may be undefined/loading), isLoading
// 4 stat cards: Total Leads, Won Leads, Conversion Rate, Lost Leads
// Show skeleton while loading
```

**`team-members-table.tsx`**:
```tsx
// Columns: Avatar+Name, Email, Role (Select), Actions (Remove)
// Role inline edit: useUpdateTeamMember
// Remove: confirm → useRemoveTeamMember
// No manage permission → read-only (no selects, no remove button)
```

**`add-member-modal.tsx`**:
```tsx
// Dialog: search employees (debounced, hrmsApi.getEmployees), role select (MEMBER|LEAD)
// Submit → useAddTeamMember
```

### Step 5: Add team assignment to lead detail sheet

READ `apps/frontend/sales-dashboard/src/app/dashboard/leads/_components/lead-detail-sheet.tsx` fully.

In the "details" tab section, add a "Team Assignment" section below the assignee section:

```tsx
// In lead-detail-sheet.tsx, add state:
const [teamId, setTeamId] = useState(lead?.teamId ?? null);

// Add team assignment select (in the details tab, below assignedTo section):
<div className="space-y-1">
  <p className="text-[10px] font-medium uppercase text-muted-foreground">Team</p>
  <TeamAssignmentSelect
    value={teamId}
    leadId={leadId!}
    onSuccess={(newTeamId) => setTeamId(newTeamId)}
  />
</div>
```

Create `_components/team-assignment-select.tsx`:
```tsx
// Shows a combobox/select:
// First option: "(No team)" — sets teamId: null
// Then all active teams with TeamTypeBadge
// On change → api.updateLead(leadId, { teamId: newTeamId }) → toast + invalidate leads
// Fetches teams: useTeams() from use-teams.ts
```

### Step 6: Add teamId filter to leads page

READ `apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx` — it uses `useQueryStates`.

Add `teamId: parseAsString` to the `useQueryStates` params.

Add a "Team" filter dropdown in the filter bar area:
```tsx
// Simple Select showing all teams (from useTeams({ limit: 100 }))
// Value: params.teamId, onChange: setParams({ teamId: value })
```

### Hard Rules
- `hrmsApi` client points to HRMS service (`NEXT_PUBLIC_HRMS_API_URL`, default `http://localhost:3004/api/hrms`)
- `api` client points to core-service (`NEXT_PUBLIC_API_URL`, default `http://localhost:3001/api`)
- Team CRUD calls → `hrmsApi`
- Team stats (`GET /leads/teams/:id/stats`) → `api` (core-service)
- `TeamTypeBadge` MUST be at `src/components/shared/team-type-badge.tsx`
- Do NOT re-implement HRMS team CRUD — just call the HRMS service
- Lead assignment to team → `api.updateLead(id, { teamId })` → existing PATCH /leads/:id

### Report back:
  ✅ SALES-TEAMS-002 COMPLETE
  - New files: <list>
  - hrmsApi added to api.ts ✓
  - Teams list page at /dashboard/teams ✓
  - Team detail page at /dashboard/teams/:id ✓
  - Team stats cards (totalLeads, wonLeads, lostLeads, conversionRate) ✓
  - Lead team assignment in lead-detail-sheet ✓
  - TeamId filter in leads page ✓
  - Deviations: <list or "none">

---

## SUBAGENT 3 — TEST RUNNER

1. TypeScript check — core-service:
   ```bash
   cd apps/backend/core-service && npx tsc --noEmit
   ```

2. TypeScript check — sales-dashboard:
   ```bash
   cd apps/frontend/sales-dashboard && npx tsc --noEmit
   ```

3. Verify schema has teamId on Lead:
   ```bash
   grep -n "teamId\|team.*Team" libs/backend/prisma-client/prisma/schema.prisma | grep -A2 -B2 "Lead"
   ```

4. Verify migration exists:
   ```bash
   ls libs/backend/prisma-client/prisma/migrations/ | grep sales-teams
   ```

5. Verify stats endpoint in controller:
   ```bash
   grep -n "teams.*stats\|getTeamStats" apps/backend/core-service/src/modules/leads/leads.controller.ts
   ```

6. Verify teamId in leads query DTO:
   ```bash
   grep -n "teamId" apps/backend/core-service/src/modules/leads/dto/query-leads.dto.ts
   ```

7. Verify hrmsApi exported from api.ts:
   ```bash
   grep -n "hrmsApi\|HRMS_API_URL" apps/frontend/sales-dashboard/src/lib/api.ts
   ```

8. Verify teams pages exist:
   ```bash
   ls apps/frontend/sales-dashboard/src/app/dashboard/teams/
   ls apps/frontend/sales-dashboard/src/app/dashboard/teams/_components/
   ```

9. Verify TeamTypeBadge in shared:
   ```bash
   ls apps/frontend/sales-dashboard/src/components/shared/team-type-badge.tsx
   ```

10. Check for console.log in new files:
    ```bash
    grep -rn "console\.log" \
      apps/frontend/sales-dashboard/src/app/dashboard/teams/ \
      apps/frontend/sales-dashboard/src/hooks/use-teams.ts \
      --include="*.tsx" --include="*.ts"
    ```

Report:
  ✅ ALL CHECKS PASSED or ❌ FAILURES: <list each with file:line>

---

## Start
Spawn SUBAGENT 1 (SALES-TEAMS-001 Backend) now. Wait for completion before spawning SUBAGENT 2.
