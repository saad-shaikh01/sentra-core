# SALES-TEAMS-001: Sales Dashboard Teams CRUD (Backend Integration + Sales-Specific Endpoints)

## Overview
Expose team management functionality within the Sales Dashboard context. This ticket covers the API Gateway routing for HRMS teams endpoints, any sales-specific team data (e.g., team's sales performance), and the team assignment on leads.

## Background / Context
Teams data lives in HRMS service (HRMS-BE-005). The Sales Dashboard needs to:
1. Display and manage teams (proxied through API Gateway to HRMS)
2. Assign leads to teams
3. Filter leads by team
4. Show team performance metrics on the teams page

This ticket does NOT re-implement team CRUD — it wires up HRMS endpoints for use in Sales and adds Sales-specific team data.

## Acceptance Criteria
- [ ] API Gateway routes `/api/sales/teams/*` → HRMS service (or direct HRMS call with Sales context)
- [ ] `GET /api/hrms/teams` works from Sales Dashboard frontend with sales team context
- [ ] Sales lead model has `teamId` field (optional — lead can be unassigned)
- [ ] `PATCH /api/sales/leads/:id` accepts `teamId` to assign/reassign lead to a team
- [ ] `GET /api/sales/leads` supports `?teamId=xxx` filter
- [ ] `GET /api/sales/teams/:id/stats` returns team's sales stats: total leads, won, lost, revenue this month
- [ ] Sales users with `sales:teams:view` can view teams; `sales:teams:manage` can create/edit via HRMS
- [ ] When a lead is assigned to a team, any member of that team with `sales:leads:view_team` can see it

## Technical Specification

### Schema: Add teamId to Lead

```prisma
// In schema.prisma — add to Lead model:
model Lead {
  // ... existing fields ...
  teamId    String?   // nullable — lead can be unassigned
  team      Team?     @relation(fields: [teamId], references: [id])

  @@index([teamId])
}
```

### Lead Assignment Update (core-service: leads endpoint)

```typescript
// PATCH /api/sales/leads/:id
// Body can now include: { teamId?: string | null }

async updateLead(id: string, orgId: string, dto: UpdateLeadDto) {
  // If teamId provided, validate it belongs to same org
  if (dto.teamId) {
    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, organizationId: orgId, deletedAt: null }
    });
    if (!team) throw new BadRequestException('Team not found or not in your organization');
  }

  return this.prisma.lead.update({
    where: { id },
    data: { ...dto }
  });
}
```

### Lead Filtering by Team

```typescript
// GET /api/sales/leads?teamId=xxx
// Add to existing leads query WHERE clause:
...(query.teamId && { teamId: query.teamId })
```

### Team Stats Endpoint (core-service or hrms)

```typescript
// GET /api/sales/teams/:teamId/stats
// Query: ?period=this_month | last_month | this_quarter | all_time

async getTeamStats(teamId: string, orgId: string, period: string) {
  const dateRange = getDateRange(period); // helper: returns { start, end }

  const [totalLeads, wonLeads, lostLeads, totalRevenue] = await Promise.all([
    this.prisma.lead.count({
      where: { teamId, organizationId: orgId, createdAt: { gte: dateRange.start, lte: dateRange.end } }
    }),
    this.prisma.lead.count({
      where: { teamId, organizationId: orgId, status: 'WON', updatedAt: { gte: dateRange.start } }
    }),
    this.prisma.lead.count({
      where: { teamId, organizationId: orgId, status: 'LOST', updatedAt: { gte: dateRange.start } }
    }),
    this.prisma.sale.aggregate({
      where: { lead: { teamId }, organizationId: orgId, createdAt: { gte: dateRange.start } },
      _sum: { totalAmount: true }
    }),
  ]);

  return {
    teamId,
    period,
    totalLeads,
    wonLeads,
    lostLeads,
    conversionRate: totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0',
    totalRevenue: totalRevenue._sum.totalAmount || 0,
  };
}
```

### View-Team Permission Logic

```typescript
// When fetching leads list, apply team visibility:

async getLeads(userId: string, orgId: string, query: LeadsQueryDto) {
  const permissions = await this.permissionsService.getUserPermissions(userId, orgId);

  // Build visibility filter
  let teamFilter: Prisma.LeadWhereInput = {};
  if (permissions.includes('sales:leads:view_all')) {
    // see all leads — no filter
  } else if (permissions.includes('sales:leads:view_team')) {
    // see own leads + team leads
    const userTeamIds = await this.getTeamIdsForUser(userId, orgId);
    teamFilter = {
      OR: [
        { assignedTo: userId },
        { teamId: { in: userTeamIds } }
      ]
    };
  } else if (permissions.includes('sales:leads:view_own')) {
    // only own leads
    teamFilter = { assignedTo: userId };
  } else {
    throw new ForbiddenException();
  }

  return this.prisma.lead.findMany({
    where: { organizationId: orgId, ...teamFilter, ...query.filters }
  });
}

async getTeamIdsForUser(userId: string, orgId: string): Promise<string[]> {
  const memberships = await this.prisma.teamMember.findMany({
    where: { userId },
    include: { team: { select: { id: true, organizationId: true } } }
  });
  return memberships
    .filter(m => m.team.organizationId === orgId)
    .map(m => m.teamId);
}
```

## Testing Requirements

### Unit Tests
- `updateLead()` with invalid teamId → 400
- `updateLead()` with null teamId → clears team assignment
- `getTeamStats()` returns 0 for all metrics for team with no leads
- `getLeads()` with `view_team` permission: returns own + team leads but not other teams' leads
- `getLeads()` with `view_own` permission: returns only own leads regardless of team

### Integration Tests
- Assign lead to team → GET leads with `?teamId=xxx` returns the lead
- Team member with `view_team` can see all their team's leads
- Non-member with `view_own` cannot see team's leads (only their own)
- Team stats update when new leads are created and assigned

### Edge Cases
- Lead with no team assignment: `teamId: null` — still appears for users with `view_all`
- Team deleted (soft) → leads still have `teamId` set (don't nullify) → show "Unknown Team" in UI
- User in 2 teams: `view_team` permission shows leads from both teams
