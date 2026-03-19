# DS-013: Dashboard KPI Scoping

## Priority: P2
## Estimate: 3-4 hours
## Depends On: DS-004, DS-005, DS-006, DS-007

---

## Summary
Ensure all dashboard KPI endpoints (lead counts, revenue summaries, conversion rates, top performers) respect the user's data scope. Managers see team metrics, agents see personal metrics.

---

## Implementation Details

### 1. Identify KPI Endpoints

Check all dashboard-related endpoints that aggregate data:

```
GET /api/leads/stats          → lead count by status, conversion rate
GET /api/sales/stats          → revenue summary, sale count
GET /api/invoices/stats       → invoice totals, payment status
GET /api/dashboard/overview   → combined metrics (if exists)
```

### 2. Apply Scope to Each KPI Query

Every aggregation query must include the scope WHERE clause.

```typescript
// Example: Lead stats
async getLeadStats(orgId: string, userId: string, role: UserRole) {
  const scope = await this.scopeService.getUserScope(userId, orgId, role);
  const scopeWhere = scope.toLeadFilter();

  const [total, byStatus] = await Promise.all([
    this.prisma.lead.count({ where: scopeWhere }),
    this.prisma.lead.groupBy({
      by: ['status'],
      where: scopeWhere,
      _count: true,
    }),
  ]);

  return { total, byStatus };
}

// Example: Revenue stats
async getRevenueStats(orgId: string, userId: string, role: UserRole) {
  const scope = await this.scopeService.getUserScope(userId, orgId, role);
  const scopeWhere = scope.toSaleFilter();

  const result = await this.prisma.sale.aggregate({
    where: scopeWhere,
    _sum: { amount: true },
    _count: true,
    _avg: { amount: true },
  });

  return {
    totalRevenue: result._sum.amount ?? 0,
    saleCount: result._count,
    avgDealSize: result._avg.amount ?? 0,
  };
}
```

### 3. Team Performance Metrics (Manager View)

For SALES_MANAGER, add team-level breakdowns:

```typescript
async getTeamPerformance(orgId: string, userId: string, role: UserRole) {
  if (role !== UserRole.SALES_MANAGER) return null;

  const scope = await this.scopeService.getUserScope(userId, orgId, role);

  // Get leads grouped by assignedTo within scope
  const memberStats = await this.prisma.lead.groupBy({
    by: ['assignedToId'],
    where: scope.toLeadFilter(),
    _count: true,
  });

  // Enrich with user names
  const userIds = memberStats.map(s => s.assignedToId).filter(Boolean);
  const users = await this.prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  return memberStats.map(s => ({
    userId: s.assignedToId,
    name: userMap.get(s.assignedToId) || 'Unknown',
    leadCount: s._count,
  }));
}
```

### 4. Frontend Dashboard Adjustments

```tsx
// apps/frontend/sales-dashboard/src/app/dashboard/page.tsx

// Revenue cards: already fetching from scoped endpoint → no change needed
// Lead pipeline: already fetching from scoped endpoint → no change needed

// Manager-specific: team performance widget
{isManager && teamPerformance && (
  <Card>
    <CardHeader>
      <CardTitle>Team Performance</CardTitle>
    </CardHeader>
    <CardContent>
      {teamPerformance.map(member => (
        <div key={member.userId} className="flex justify-between py-2">
          <span>{member.name}</span>
          <Badge>{member.leadCount} leads</Badge>
        </div>
      ))}
    </CardContent>
  </Card>
)}

// Agent-specific: personal stats
{isAgent && (
  <div className="text-sm text-muted-foreground mb-4">
    Showing your personal performance metrics.
  </div>
)}
```

---

## Expected Behavior

| Role | Dashboard Shows |
|------|----------------|
| OWNER/ADMIN | Org-wide KPIs: total revenue, all leads, all conversions |
| SALES_MANAGER | Team KPIs: team revenue, team leads + per-member breakdown |
| FRONTSELL_AGENT | Personal KPIs: own leads, own conversions |
| UPSELL_AGENT | Personal KPIs: own clients, own sales |
| PROJECT_MANAGER | Minimal: own client count |

---

## Edge Cases

- **Manager with no brands**: All KPIs show 0. Dashboard shows "Assign brands to your team to see metrics."
- **New agent (0 assigned leads)**: All KPIs show 0. Dashboard shows "No data yet — leads will appear here when assigned."
- **Scope cached**: KPIs use cached scope → fast aggregation. If brand just reassigned, metrics may lag up to 15 min (or until scope invalidated).
- **Large dataset aggregation**: Prisma aggregate/groupBy uses SQL GROUP BY → efficient with indexes from DS-001.

---

## Testing Checklist

- [ ] **OWNER sees org-wide stats** — all leads, all revenue
- [ ] **ADMIN sees org-wide stats** — same as OWNER
- [ ] **SALES_MANAGER sees team stats** — only team brand data
- [ ] **SALES_MANAGER sees per-member breakdown**
- [ ] **FRONTSELL sees personal stats only**
- [ ] **UPSELL sees personal stats only**
- [ ] **Empty scope** → 0 values, helpful message
- [ ] **Aggregation performance** — no full table scan
- [ ] **Frontend widgets render correctly per role**

---

## Files Modified

- `apps/backend/core-service/src/modules/leads/leads.service.ts` (scope stats endpoints)
- `apps/backend/core-service/src/modules/sales/sales.service.ts` (scope stats endpoints)
- `apps/backend/core-service/src/modules/invoices/invoices.service.ts` (scope stats endpoints)
- `apps/frontend/sales-dashboard/src/app/dashboard/page.tsx` (conditional widgets)
