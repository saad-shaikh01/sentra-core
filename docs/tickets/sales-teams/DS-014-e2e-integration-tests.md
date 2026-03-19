# DS-014: E2E Integration Tests

## Priority: P2
## Estimate: 5-6 hours
## Depends On: All previous tickets

---

## Summary
Comprehensive integration test suite covering the complete data scope system end-to-end. Tests verify that each role sees exactly the right data, scope caching works correctly, invalidation refreshes data, and edge cases are handled.

---

## Implementation Details

### 1. Test File Location

```
apps/backend/core-service/test/scope/
├── scope.e2e-spec.ts       — ScopeService + UserScope unit tests
├── leads-scope.e2e-spec.ts — Leads visibility per role
├── clients-scope.e2e-spec.ts
├── sales-scope.e2e-spec.ts
├── invoices-scope.e2e-spec.ts
├── team-brands.e2e-spec.ts — TeamBrand CRUD + invalidation
└── helpers/
    └── scope-test-setup.ts — shared test data factory
```

### 2. Test Data Factory

```typescript
// helpers/scope-test-setup.ts

export async function createScopeTestData(prisma: PrismaClient) {
  // Organization
  const org = await prisma.organization.create({ data: { name: 'Test Org' } });

  // Users (one per role)
  const owner = await createUser(prisma, org.id, UserRole.OWNER, 'owner@test.com');
  const admin = await createUser(prisma, org.id, UserRole.ADMIN, 'admin@test.com');
  const manager = await createUser(prisma, org.id, UserRole.SALES_MANAGER, 'manager@test.com');
  const frontsell = await createUser(prisma, org.id, UserRole.FRONTSELL_AGENT, 'frontsell@test.com');
  const upsell = await createUser(prisma, org.id, UserRole.UPSELL_AGENT, 'upsell@test.com');
  const pm = await createUser(prisma, org.id, UserRole.PROJECT_MANAGER, 'pm@test.com');

  // Brands
  const brandA = await prisma.brand.create({ data: { name: 'Brand A', organizationId: org.id } });
  const brandB = await prisma.brand.create({ data: { name: 'Brand B', organizationId: org.id } });
  const brandC = await prisma.brand.create({ data: { name: 'Brand C (unmapped)', organizationId: org.id } });

  // Team type
  const teamType = await prisma.teamType.create({ data: { name: 'Sales', organizationId: org.id } });

  // Teams
  const team1 = await prisma.team.create({
    data: {
      name: 'Team Alpha',
      organizationId: org.id,
      teamTypeId: teamType.id,
      managerId: manager.id,
      allowMemberVisibility: true,
    },
  });
  const team2 = await prisma.team.create({
    data: {
      name: 'Team Beta',
      organizationId: org.id,
      teamTypeId: teamType.id,
      allowMemberVisibility: false,
    },
  });

  // Team members
  await prisma.teamMember.create({ data: { teamId: team1.id, userId: frontsell.id, role: 'MEMBER' } });
  await prisma.teamMember.create({ data: { teamId: team2.id, userId: upsell.id, role: 'MEMBER' } });

  // Team-brand mappings
  await prisma.teamBrand.create({ data: { teamId: team1.id, brandId: brandA.id } });
  await prisma.teamBrand.create({ data: { teamId: team2.id, brandId: brandB.id } });
  // brandC is unmapped

  // Leads
  const leadA1 = await prisma.lead.create({
    data: { organizationId: org.id, brandId: brandA.id, assignedToId: frontsell.id, teamId: team1.id, companyName: 'Lead A1' },
  });
  const leadA2 = await prisma.lead.create({
    data: { organizationId: org.id, brandId: brandA.id, assignedToId: manager.id, teamId: team1.id, companyName: 'Lead A2' },
  });
  const leadB1 = await prisma.lead.create({
    data: { organizationId: org.id, brandId: brandB.id, assignedToId: upsell.id, teamId: team2.id, companyName: 'Lead B1' },
  });
  const leadC1 = await prisma.lead.create({
    data: { organizationId: org.id, brandId: brandC.id, teamId: null, companyName: 'Lead C1 (no team)' },
  });

  // Clients
  const clientA = await prisma.client.create({
    data: { organizationId: org.id, brandId: brandA.id, companyName: 'Client A', upsellAgentId: upsell.id },
  });
  const clientB = await prisma.client.create({
    data: { organizationId: org.id, brandId: brandB.id, companyName: 'Client B' },
  });

  // Sales
  const saleA = await prisma.sale.create({
    data: { organizationId: org.id, brandId: brandA.id, clientId: clientA.id, assignedToId: frontsell.id, amount: 1000 },
  });
  const saleB = await prisma.sale.create({
    data: { organizationId: org.id, brandId: brandB.id, clientId: clientB.id, assignedToId: upsell.id, amount: 2000 },
  });

  // Invoices
  const invoiceA = await prisma.invoice.create({
    data: { organizationId: org.id, saleId: saleA.id, amount: 1000 },
  });
  const invoiceB = await prisma.invoice.create({
    data: { organizationId: org.id, saleId: saleB.id, amount: 2000 },
  });

  return {
    org, owner, admin, manager, frontsell, upsell, pm,
    brandA, brandB, brandC,
    team1, team2,
    leadA1, leadA2, leadB1, leadC1,
    clientA, clientB,
    saleA, saleB,
    invoiceA, invoiceB,
  };
}
```

### 3. Test Cases

#### ScopeService Tests (`scope.e2e-spec.ts`)

```typescript
describe('ScopeService', () => {
  it('OWNER gets full access scope (no team queries)', async () => {
    const scope = await scopeService.getUserScope(owner.id, org.id, UserRole.OWNER);
    expect(scope.isFullAccess).toBe(true);
    expect(scope.toLeadFilter()).toEqual({ organizationId: org.id });
  });

  it('SALES_MANAGER scope includes team brands', async () => {
    const scope = await scopeService.getUserScope(manager.id, org.id, UserRole.SALES_MANAGER);
    expect(scope.isManager).toBe(true);
    const filter = scope.toLeadFilter();
    expect(filter.brandId.in).toContain(brandA.id);
    expect(filter.brandId.in).not.toContain(brandB.id);
  });

  it('FRONTSELL scope reflects team membership', async () => {
    const scope = await scopeService.getUserScope(frontsell.id, org.id, UserRole.FRONTSELL_AGENT);
    const filter = scope.toLeadFilter();
    expect(filter.assignedToId).toBe(frontsell.id);
  });

  it('caches scope in Redis', async () => {
    await scopeService.getUserScope(manager.id, org.id, UserRole.SALES_MANAGER);
    // Second call should hit cache
    const spy = jest.spyOn(prisma.teamMember, 'findMany');
    await scopeService.getUserScope(manager.id, org.id, UserRole.SALES_MANAGER);
    expect(spy).not.toHaveBeenCalled();
  });

  it('invalidateUser clears cache', async () => {
    await scopeService.getUserScope(manager.id, org.id, UserRole.SALES_MANAGER);
    await scopeService.invalidateUser(manager.id, org.id);
    const spy = jest.spyOn(prisma.teamMember, 'findMany');
    await scopeService.getUserScope(manager.id, org.id, UserRole.SALES_MANAGER);
    expect(spy).toHaveBeenCalled();
  });

  it('user in 2 teams gets union of brands', async () => {
    // Add frontsell to team2 as well
    await prisma.teamMember.create({ data: { teamId: team2.id, userId: frontsell.id, role: 'MEMBER' } });
    await scopeService.invalidateUser(frontsell.id, org.id);
    const scope = await scopeService.getUserScope(frontsell.id, org.id, UserRole.FRONTSELL_AGENT);
    // Frontsell still sees own leads only (not brand-scoped)
    // But memberVisibleTeamIds includes team1 (visibility ON)
    expect(scope.toLeadFilter().assignedToId).toBe(frontsell.id);
  });
});
```

#### Leads Scope Tests (`leads-scope.e2e-spec.ts`)

```typescript
describe('Leads Scope', () => {
  it('OWNER sees all 4 leads', async () => {
    const result = await leadsService.findAll({ orgId: org.id, userId: owner.id, role: UserRole.OWNER });
    expect(result.data).toHaveLength(4);
  });

  it('SALES_MANAGER sees only Brand A leads (2)', async () => {
    const result = await leadsService.findAll({ orgId: org.id, userId: manager.id, role: UserRole.SALES_MANAGER });
    expect(result.data).toHaveLength(2);
    expect(result.data.every(l => l.brandId === brandA.id)).toBe(true);
  });

  it('FRONTSELL sees only own assigned lead (1)', async () => {
    const result = await leadsService.findAll({ orgId: org.id, userId: frontsell.id, role: UserRole.FRONTSELL_AGENT });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].assignedToId).toBe(frontsell.id);
  });

  it('UPSELL sees only own assigned lead (1)', async () => {
    const result = await leadsService.findAll({ orgId: org.id, userId: upsell.id, role: UserRole.UPSELL_AGENT });
    expect(result.data).toHaveLength(1);
  });

  it('PROJECT_MANAGER sees 0 leads', async () => {
    const result = await leadsService.findAll({ orgId: org.id, userId: pm.id, role: UserRole.PROJECT_MANAGER });
    expect(result.data).toHaveLength(0);
  });

  it('manager search restricted to scope', async () => {
    const result = await leadsService.findAll({
      orgId: org.id, userId: manager.id, role: UserRole.SALES_MANAGER,
      query: { search: 'Lead' },
    });
    expect(result.data).toHaveLength(2); // Only Brand A leads match
  });

  it('manager filter by out-of-scope brand returns 0', async () => {
    const result = await leadsService.findAll({
      orgId: org.id, userId: manager.id, role: UserRole.SALES_MANAGER,
      query: { brandId: brandB.id },
    });
    expect(result.data).toHaveLength(0);
  });
});
```

#### Similar test suites for Clients, Sales, Invoices...

#### TeamBrand Tests (`team-brands.e2e-spec.ts`)

```typescript
describe('TeamBrand CRUD', () => {
  it('assigns brand to team', async () => { ... });
  it('rejects duplicate brand assignment (409)', async () => { ... });
  it('unassigns brand from team', async () => { ... });
  it('reassign triggers scope invalidation for both teams', async () => { ... });
  it('non-admin gets 403', async () => { ... });
});
```

---

## Expected Behavior

All tests pass, proving:
1. Each role sees exactly the right subset of data
2. Scope caching reduces DB queries
3. Invalidation refreshes stale scope
4. Filter intersection works correctly
5. Edge cases (empty scope, unmapped brands, multi-team users) handled
6. No security leaks — lower roles cannot see higher-scope data

---

## Testing Checklist

- [ ] All ScopeService unit tests pass
- [ ] All Leads scope integration tests pass
- [ ] All Clients scope integration tests pass
- [ ] All Sales scope integration tests pass
- [ ] All Invoices scope integration tests pass
- [ ] All TeamBrand CRUD tests pass
- [ ] Cache hit/miss behavior verified
- [ ] Invalidation triggers verified
- [ ] Role-based access verified for all 6 roles
- [ ] Filter + scope intersection verified
- [ ] Empty scope returns 0 results (not errors)
- [ ] Test data cleanup after each suite

---

## Files Created

- `apps/backend/core-service/test/scope/scope.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/leads-scope.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/clients-scope.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/sales-scope.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/invoices-scope.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/team-brands.e2e-spec.ts` (NEW)
- `apps/backend/core-service/test/scope/helpers/scope-test-setup.ts` (NEW)
