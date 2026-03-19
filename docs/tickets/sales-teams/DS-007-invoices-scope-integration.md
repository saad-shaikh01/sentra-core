# DS-007: Invoices Service Scope Integration

## Priority: P0
## Estimate: 2-3 hours
## Depends On: DS-002

---

## Summary
Add scope filtering to `InvoicesService.findAll()`. Invoices don't have a direct `brandId` — they join through `Sale`. The scope filter nests inside the `sale` relation.

---

## Implementation Details

### Current State

No role-based filtering on invoices. All org users see all invoices. This is a security gap.

### New Implementation

```typescript
// apps/backend/core-service/src/modules/invoices/invoices.service.ts

async findAll(params: {
  orgId: string;
  userId: string;
  role: UserRole;
  query?: InvoiceQueryDto;
}) {
  const { orgId, userId, role, query } = params;

  const scope = await this.scopeService.getUserScope(userId, orgId, role);
  const invoiceScope = scope.toInvoiceFilter();

  const where: any = {
    organizationId: orgId,
    // Nest sale scope filter
    ...(invoiceScope.sale && { sale: invoiceScope.sale }),
    ...(query?.status && { status: query.status }),
    ...(query?.saleId && { saleId: query.saleId }),
    ...(query?.search && {
      OR: [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { sale: { client: { companyName: { contains: query.search, mode: 'insensitive' } } } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    this.prisma.invoice.findMany({
      where,
      skip: query?.skip ?? 0,
      take: query?.take ?? 25,
      orderBy: query?.orderBy ?? { createdAt: 'desc' },
      include: {
        sale: {
          select: {
            id: true,
            title: true,
            brandId: true,
            brand: { select: { id: true, name: true } },
            client: { select: { id: true, companyName: true } },
            assignedTo: { select: { id: true, name: true } },
          },
        },
      },
    }),
    this.prisma.invoice.count({ where }),
  ]);

  return { data, meta: { total, ... } };
}
```

### How Invoice Scope Works

`UserScope.toInvoiceFilter()` returns:
- **OWNER/ADMIN**: `{}` — no sale filter, all invoices
- **SALES_MANAGER**: `{ sale: { brandId: { in: [...] } } }` — invoices where sale's brand is in scope
- **FRONTSELL (visibility ON)**: `{ sale: { brandId: { in: [...] } } }`
- **FRONTSELL (visibility OFF)**: `{ sale: { assignedToId: userId } }`
- **UPSELL_AGENT**: `{ sale: { assignedToId: userId } }`
- **PROJECT_MANAGER**: `{ sale: { assignedToId: '__none__' } }` — no invoices

Prisma handles nested relation filtering natively — `where: { sale: { brandId: { in: [...] } } }` translates to a JOIN + WHERE in SQL.

---

## Expected Behavior

| Role | Sees | Mechanism |
|------|------|-----------|
| OWNER | All org invoices | No sale filter |
| ADMIN | All org invoices | No sale filter |
| SALES_MANAGER | Invoices where sale.brandId in team brands | Nested sale filter |
| FRONTSELL (vis ON) | Invoices where sale.brandId in team brands | Nested sale filter |
| FRONTSELL (vis OFF) | Invoices where sale.assignedToId = self | Nested sale filter |
| UPSELL_AGENT | Invoices where sale.assignedToId = self | Nested sale filter |
| PROJECT_MANAGER | No invoices | Empty result |

---

## Performance Note

Nested relation filter (`where: { sale: { ... } }`) generates a SQL JOIN. With the `saleId` index on Invoice and `brandId` / `assignedToId` indexes on Sale (from DS-001), this is efficient. The query planner uses the Sale indexes for the WHERE clause.

---

## Edge Cases

- **Invoice with orphaned sale** (sale deleted): `sale` is null → nested filter can't match → invoice invisible to scoped roles. OWNER/ADMIN still sees it via org filter.
- **Invoice.organizationId vs Sale.organizationId mismatch**: Should never happen. Both set at creation. If it does, invoice visible at invoice org level, sale filter uses sale org.
- **Sale with no brandId**: Nested `brandId: { in: [...] }` won't match null → invoice invisible to brand-scoped users. Correct.

---

## Testing Checklist

- [ ] **OWNER/ADMIN sees all org invoices** — no sale nesting
- [ ] **SALES_MANAGER sees invoices for sales under team brands**
- [ ] **FRONTSELL (visibility ON) sees brand-scoped invoices**
- [ ] **FRONTSELL (visibility OFF) sees own-sale invoices only**
- [ ] **UPSELL_AGENT sees own-sale invoices only**
- [ ] **PROJECT_MANAGER sees no invoices**
- [ ] **Nested filter performance** — query uses indexes, no full table scan
- [ ] **Search across scope** — invoice number search within scope
- [ ] **Pagination correct** — total count reflects scoped invoices
- [ ] **Sale filter intersection with user query** — saleId filter + scope both applied

---

## Files Modified

- `apps/backend/core-service/src/modules/invoices/invoices.service.ts`
- `apps/backend/core-service/src/modules/invoices/invoices.module.ts` (if needed)
