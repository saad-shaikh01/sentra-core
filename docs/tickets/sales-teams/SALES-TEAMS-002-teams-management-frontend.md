# SALES-TEAMS-002: Teams Management Frontend (Sales Dashboard)

## Overview
Build the Teams management section in the Sales Dashboard. Shows all teams, allows creating/editing teams (calls HRMS API), shows team members, team performance stats, and allows assigning leads to teams.

## Background / Context
The Teams section in the Sales Dashboard is a consumer of HRMS data. Admins and managers manage teams here. Agents see their team's leads. The team type is shown as a badge/label (e.g., "Ebook", "Design") — not frontsell/upsell.

## Acceptance Criteria

### Teams List Page (`/dashboard/teams`)
- [ ] Shows all active teams in a table/card layout
- [ ] Each team shows: name, type badge, manager name, member count, this-month stats (total leads, revenue)
- [ ] Filter by team type (dropdown with all available types)
- [ ] Search by team name
- [ ] "Create Team" button (visible only to users with `sales:teams:manage`)
- [ ] Click on team → team detail page
- [ ] Pagination

### Team Detail Page (`/dashboard/teams/:id`)
- [ ] Shows team info: name, type, description, manager
- [ ] Stats cards: Total Leads, Won Leads, Conversion Rate, Total Revenue (this month)
- [ ] Members table: avatar, name, role (MEMBER/LEAD), email, status badge
- [ ] "Edit Team" button (manage permission only)
- [ ] "Add Member" button → opens member picker (search employees, assign role)
- [ ] Remove member button per row (manage permission only)
- [ ] Change member role (MEMBER ↔ LEAD) inline

### Create/Edit Team Modal
- [ ] Fields: Team Name (required), Team Type (dropdown — fetched from `/hrms/team-types`), Description (optional), Manager (optional, employee picker)
- [ ] Team Type dropdown shows system types + any org custom types
- [ ] Manager picker: search employees by name, shows avatar + job title
- [ ] Validation: name required, typeId required
- [ ] On success: closes modal, refreshes team list

### Lead Assignment
- [ ] In lead list page and lead detail page: "Assign Team" dropdown showing all teams
- [ ] Filter leads by team in the leads list sidebar/filter panel
- [ ] After assigning team, lead card shows team badge

## Technical Specification

### Routes
```
/dashboard/teams              → TeamsListPage
/dashboard/teams/:id          → TeamDetailPage
```

### API Calls
```typescript
// Teams list
GET /api/hrms/teams?isActive=true&page=1&limit=20&search=xxx&typeId=yyy

// Team types for dropdown
GET /api/hrms/team-types

// Team detail
GET /api/hrms/teams/:id

// Team stats (sales-specific)
GET /api/sales/teams/:id/stats?period=this_month

// Create team
POST /api/hrms/teams

// Update team
PATCH /api/hrms/teams/:id

// Add member
POST /api/hrms/teams/:id/members

// Remove member
DELETE /api/hrms/teams/:id/members/:userId

// Update member role
PATCH /api/hrms/teams/:id/members/:userId
```

### Components

```
teams/
├── page.tsx                          ← TeamsListPage
├── [id]/
│   └── page.tsx                      ← TeamDetailPage
└── _components/
    ├── team-card.tsx                 ← Card view for team in list
    ├── team-stats-cards.tsx          ← 4 stats cards (leads, won, rate, revenue)
    ├── team-members-table.tsx        ← Members list with roles
    ├── create-edit-team-modal.tsx    ← Create/edit form modal
    ├── add-member-modal.tsx          ← Employee search + role picker
    ├── team-type-badge.tsx           ← Badge with type label
    └── team-filter-bar.tsx           ← Type filter + search
```

### Team Card Component
```tsx
// Shows in list view
<TeamCard
  team={team}
  stats={stats}
  onView={() => router.push(`/dashboard/teams/${team.id}`)}
/>

// Visual:
// ┌────────────────────────────────────┐
// │ [Ebook]  Ebook Team Alpha          │
// │ Manager: Jane Smith                │
// │ 5 members                          │
// │ This month: 24 leads · $12,500     │
// └────────────────────────────────────┘
```

### Team Type Badge
```tsx
// Color-coded by type slug
const TYPE_COLORS = {
  ebook:           'bg-blue-100 text-blue-700',
  design:          'bg-purple-100 text-purple-700',
  social_media:    'bg-pink-100 text-pink-700',
  video:           'bg-red-100 text-red-700',
  seo:             'bg-green-100 text-green-700',
  development:     'bg-orange-100 text-orange-700',
  content_writing: 'bg-yellow-100 text-yellow-700',
  // custom types: default
  default:         'bg-gray-100 text-gray-700',
};

export function TeamTypeBadge({ type }: { type: { slug: string; name: string } }) {
  const color = TYPE_COLORS[type.slug] || TYPE_COLORS.default;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{type.name}</span>;
}
```

### Create/Edit Team Modal
```tsx
// Fields:
// Team Name: text input (required)
// Team Type: select dropdown
//   - Fetched from GET /api/hrms/team-types
//   - System types listed first, then custom org types
//   - Option format: "Ebook" (system) vs "Custom Type Name" (org)
// Description: textarea (optional)
// Manager: combobox/search
//   - Type to search employees
//   - Shows: avatar, name, job title
//   - Clearable (manager is optional)

// Validation errors shown below each field
// "Save" button disabled during submission (loading spinner)
// On success: toast "Team created" / "Team updated"
```

### Member Role Selector
```tsx
// Inline edit in members table
<Select value={member.role} onChange={(role) => handleUpdateRole(member.userId, role)}>
  <SelectItem value="MEMBER">Member</SelectItem>
  <SelectItem value="LEAD">Team Lead</SelectItem>
</Select>
// Update is debounced — show toast on success
```

### Lead Assignment (in lead detail page)
```tsx
// New section in lead detail: "Team Assignment"
<TeamAssignmentSelect
  value={lead.teamId}
  onChange={(teamId) => assignLeadToTeam(lead.id, teamId)}
/>

// Dropdown shows:
// "(No team)" option at top to clear assignment
// All active teams with type badge
// Searchable
```

### Permission-Based UI
```tsx
// Hide create/edit/manage buttons based on permission
const { hasPermission } = usePermissions();
const canManage = hasPermission('sales:teams:manage');
const canView = hasPermission('sales:teams:view');

// In teams list:
{canManage && <Button onClick={openCreateModal}>+ Create Team</Button>}

// In team detail members table:
{canManage && <Button>Add Member</Button>}
{canManage && <Button variant="ghost" onClick={() => removeMember(m.userId)}>Remove</Button>}
```

## Testing Requirements

### Component Tests
- Teams list renders correct number of team cards
- Team type badge shows correct color for each type slug
- "Create Team" button not visible when user lacks `sales:teams:manage`
- Create modal validates required fields before submission
- Add member modal shows search results as user types

### Integration Tests
- Create team → appears in team list
- Edit team name → updated in list and detail view
- Add member → appears in team members table
- Remove member → removed from table
- Assign lead to team → lead list shows team badge

### UX Tests
- Loading skeleton shown while teams are fetching
- Empty state: "No teams yet. Create your first team." with create button
- Error state: "Failed to load teams" with retry button
- Search: debounced (300ms), clears when X clicked
- Pagination: correct page indicators

### Edge Cases
- Team with no manager: shows "No manager assigned" (not crash)
- Team with 0 members: shows "0 members" (not crash)
- Stats API fails: show "—" in stat cards, not blank
- Team type not in TYPE_COLORS map → default gray badge
