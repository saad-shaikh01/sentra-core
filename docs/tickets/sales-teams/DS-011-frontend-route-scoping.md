# DS-011: Frontend Route & Widget Scoping

## Priority: P1
## Estimate: 4-5 hours
## Depends On: DS-004, DS-005, DS-006, DS-007

---

## Summary
Ensure all frontend pages (leads, clients, sales, invoices, dashboard) respect the backend scope. No frontend-only filtering needed — the backend already returns scoped data. But the UI must handle empty states, hide irrelevant actions, and adjust filters/widgets per role.

---

## Implementation Details

### 1. No Frontend Scope Logic

**Critical principle**: The frontend does NOT implement its own scope filtering. The backend returns pre-scoped data. The frontend simply renders what it receives.

This means:
- No `if (role === 'FRONTSELL') { filter leads by assignedToId }` on frontend
- No hiding data client-side based on role
- If the backend returns 0 results, the frontend shows an empty state

### 2. Conditional UI Elements per Role

```typescript
// Reuse existing RoleGuard component for showing/hiding UI elements
// apps/frontend/sales-dashboard/src/components/role-guard.tsx (already exists)

// Example usage:
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN]}>
  <Button>Create Lead</Button>
</RoleGuard>
```

### 3. Leads Page Adjustments

```tsx
// apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx

// "Assigned To" filter: only show for OWNER/ADMIN/SALES_MANAGER
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER]}>
  <AssignedToFilter />
</RoleGuard>

// "Team" filter: only show for OWNER/ADMIN (managers see their team data only)
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN]}>
  <TeamFilter />
</RoleGuard>

// Brand filter: show for all roles (agents can filter within their visible brands)
<BrandFilter />
```

### 4. Clients Page Adjustments

```tsx
// Hide "Assign Upsell Agent" action for non-admin roles
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER]}>
  <AssignAgentButton />
</RoleGuard>

// Empty state for FRONTSELL with visibility OFF:
// "No clients available. Ask your team manager to enable team data visibility."
```

### 5. Sales Page Adjustments

```tsx
// Hide "Create Sale" for roles that can't create sales
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.UPSELL_AGENT]}>
  <CreateSaleButton />
</RoleGuard>
```

### 6. Invoices Page Adjustments

```tsx
// Hide "Create Invoice" for agents (they only view)
<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER]}>
  <CreateInvoiceButton />
</RoleGuard>
```

### 7. Dashboard Page (Main) Widget Scoping

Dashboard widgets (revenue cards, lead counts, etc.) should call scoped endpoints. Since the backend already scopes data, the frontend just fetches normally:

```tsx
// Revenue summary: uses scoped /sales endpoint → shows only scoped revenue
// Lead count: uses scoped /leads/count endpoint → shows only scoped leads
// Recent activity: uses scoped /leads?sort=recent&take=5 → shows only visible leads

// For FRONTSELL with visibility OFF, dashboard may show very little data.
// Add helpful message:
{role === UserRole.FRONTSELL_AGENT && (
  <div className="text-sm text-muted-foreground">
    Showing your assigned data. Contact your manager for team-wide visibility.
  </div>
)}
```

### 8. Sidebar Navigation Visibility

Some pages may be completely empty for certain roles. Consider hiding them:

```typescript
// sidebar.tsx — leads page visible to all except PROJECT_MANAGER
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Leads', href: '/dashboard/leads', icon: Users,
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER,
            UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT] },
  { name: 'Clients', href: '/dashboard/clients', icon: Building2,
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER,
            UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT, UserRole.PROJECT_MANAGER] },
  { name: 'Sales', href: '/dashboard/sales', icon: DollarSign,
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER,
            UserRole.FRONTSELL_AGENT, UserRole.UPSELL_AGENT] },
  { name: 'Invoices', href: '/dashboard/invoices', icon: FileText,
    roles: [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER,
            UserRole.UPSELL_AGENT] },
];
```

---

## Expected Behavior

1. **All pages**: render whatever data backend returns — no client-side filtering
2. **Filters**: contextual to role (agents don't see "Assigned To" filter)
3. **Empty states**: clear messaging when role has no data
4. **Sidebar**: hides pages that are never accessible for the role
5. **Dashboard widgets**: show scoped counts and summaries
6. **Create/Edit buttons**: hidden for roles without write access

---

## Edge Cases

- **Role change mid-session**: User's token has old role → backend scope uses old role until token refresh. Not a security issue (scope is recomputed on next login).
- **Deep link to hidden page**: Page loads but shows empty data (backend returns 0 results). Not a crash.
- **FRONTSELL sees empty clients**: Expected when visibility OFF. Clear empty state message.

---

## Testing Checklist

- [ ] **OWNER sees all nav items and all data**
- [ ] **ADMIN sees all nav items and all data**
- [ ] **SALES_MANAGER sees appropriate nav items** — no brand assignments
- [ ] **FRONTSELL_AGENT sees leads, clients (maybe), sales (maybe), no invoices**
- [ ] **UPSELL_AGENT sees leads (own), clients (own), sales (own), invoices (own)**
- [ ] **PROJECT_MANAGER sees no leads, own clients only**
- [ ] **Filters contextual**: agent doesn't see "Assigned To" filter
- [ ] **Empty states**: clear messages, no broken UI
- [ ] **Dashboard widgets**: show scoped data, not all-org data
- [ ] **Create buttons**: hidden appropriately per role
- [ ] **Deep link**: no crash, shows empty or appropriate data

---

## Files Modified

- `apps/frontend/sales-dashboard/src/app/dashboard/leads/page.tsx` (conditional filters + actions)
- `apps/frontend/sales-dashboard/src/app/dashboard/clients/page.tsx` (conditional actions)
- `apps/frontend/sales-dashboard/src/app/dashboard/sales/page.tsx` (conditional actions)
- `apps/frontend/sales-dashboard/src/app/dashboard/invoices/page.tsx` (conditional actions)
- `apps/frontend/sales-dashboard/src/app/dashboard/page.tsx` (scoped widgets + role message)
- `apps/frontend/sales-dashboard/src/components/sidebar.tsx` (role-based nav items)
