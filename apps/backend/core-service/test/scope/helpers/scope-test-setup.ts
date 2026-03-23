import { PrismaService } from '@sentra-core/prisma-client';
import { UserRole } from '@sentra-core/types';

export interface ScopeTestData {
  org: { id: string; name: string };
  owner: { id: string; email: string };
  admin: { id: string; email: string };
  manager: { id: string; email: string };
  frontsell: { id: string; email: string };
  upsell: { id: string; email: string };
  pm: { id: string; email: string };
  brandA: { id: string; name: string };
  brandB: { id: string; name: string };
  brandC: { id: string; name: string };
  team1: { id: string; name: string };
  team2: { id: string; name: string };
  leadA1: { id: string };
  leadA2: { id: string };
  leadB1: { id: string };
  leadC1: { id: string };
  clientA: { id: string };
  clientB: { id: string };
  saleA: { id: string };
  saleB: { id: string };
  invoiceA: { id: string };
  invoiceB: { id: string };
}

async function createUser(
  prisma: PrismaService,
  orgId: string,
  role: UserRole,
  email: string,
) {
  return prisma.user.create({
    data: {
      email,
      password: 'hashed_test_password',
      name: role,
      role,
      organizationId: orgId,
    },
    select: { id: true, email: true },
  });
}

export async function createScopeTestData(
  prisma: PrismaService,
): Promise<ScopeTestData> {
  const org = await prisma.organization.create({
    data: { name: 'Scope Test Org' },
    select: { id: true, name: true },
  });

  const [owner, admin, manager, frontsell, upsell, pm] = await Promise.all([
    createUser(prisma, org.id, UserRole.OWNER, `owner-${org.id}@test.com`),
    createUser(prisma, org.id, UserRole.ADMIN, `admin-${org.id}@test.com`),
    createUser(prisma, org.id, UserRole.SALES_MANAGER, `manager-${org.id}@test.com`),
    createUser(prisma, org.id, UserRole.FRONTSELL_AGENT, `frontsell-${org.id}@test.com`),
    createUser(prisma, org.id, UserRole.UPSELL_AGENT, `upsell-${org.id}@test.com`),
    createUser(prisma, org.id, UserRole.PROJECT_MANAGER, `pm-${org.id}@test.com`),
  ]);

  const [brandA, brandB, brandC] = await Promise.all([
    prisma.brand.create({ data: { name: 'Brand A', organizationId: org.id }, select: { id: true, name: true } }),
    prisma.brand.create({ data: { name: 'Brand B', organizationId: org.id }, select: { id: true, name: true } }),
    prisma.brand.create({ data: { name: 'Brand C Unmapped', organizationId: org.id }, select: { id: true, name: true } }),
  ]);

  const teamType = await prisma.teamType.create({
    data: { name: 'Sales Test', slug: `sales-test-${org.id}`, organizationId: org.id },
    select: { id: true },
  });

  const [team1, team2] = await Promise.all([
    prisma.team.create({
      data: {
        name: 'Team Alpha',
        organizationId: org.id,
        typeId: teamType.id,
        managerId: manager.id,
        allowMemberVisibility: true,
      },
      select: { id: true, name: true },
    }),
    prisma.team.create({
      data: {
        name: 'Team Beta',
        organizationId: org.id,
        typeId: teamType.id,
        allowMemberVisibility: false,
      },
      select: { id: true, name: true },
    }),
  ]);

  await Promise.all([
    prisma.teamMember.create({ data: { teamId: team1.id, userId: frontsell.id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { teamId: team2.id, userId: upsell.id, role: 'MEMBER' } }),
    prisma.teamBrand.create({ data: { teamId: team1.id, brandId: brandA.id } }),
    prisma.teamBrand.create({ data: { teamId: team2.id, brandId: brandB.id } }),
  ]);

  const [leadA1, leadA2, leadB1, leadC1] = await Promise.all([
    prisma.lead.create({ data: { organizationId: org.id, brandId: brandA.id, assignedToId: frontsell.id, teamId: team1.id, name: 'Lead A1' }, select: { id: true } }),
    prisma.lead.create({ data: { organizationId: org.id, brandId: brandA.id, assignedToId: manager.id, teamId: team1.id, name: 'Lead A2' }, select: { id: true } }),
    prisma.lead.create({ data: { organizationId: org.id, brandId: brandB.id, assignedToId: upsell.id, teamId: team2.id, name: 'Lead B1' }, select: { id: true } }),
    prisma.lead.create({ data: { organizationId: org.id, brandId: brandC.id, name: 'Lead C1 Unassigned' }, select: { id: true } }),
  ]);

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, brandId: brandA.id, email: `clienta-${org.id}@test.com`, contactName: 'Client A', upsellAgentId: upsell.id }, select: { id: true } }),
    prisma.client.create({ data: { organizationId: org.id, brandId: brandB.id, email: `clientb-${org.id}@test.com`, contactName: 'Client B' }, select: { id: true } }),
  ]);

  const [saleA, saleB] = await Promise.all([
    prisma.sale.create({ data: { organizationId: org.id, brandId: brandA.id, clientId: clientA.id, totalAmount: 1000, status: 'PENDING' }, select: { id: true } }),
    prisma.sale.create({ data: { organizationId: org.id, brandId: brandB.id, clientId: clientB.id, totalAmount: 2000, status: 'PENDING' }, select: { id: true } }),
  ]);

  const invoiceNumber1 = `TEST-INV-${Date.now()}-A`;
  const invoiceNumber2 = `TEST-INV-${Date.now()}-B`;
  const [invoiceA, invoiceB] = await Promise.all([
    prisma.invoice.create({ data: { invoiceNumber: invoiceNumber1, saleId: saleA.id, amount: 1000, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, select: { id: true } }),
    prisma.invoice.create({ data: { invoiceNumber: invoiceNumber2, saleId: saleB.id, amount: 2000, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, select: { id: true } }),
  ]);

  return { org, owner, admin, manager, frontsell, upsell, pm, brandA, brandB, brandC, team1, team2, leadA1, leadA2, leadB1, leadC1, clientA, clientB, saleA, saleB, invoiceA, invoiceB };
}

export async function cleanupScopeTestData(
  prisma: PrismaService,
  orgId: string,
): Promise<void> {
  // Delete in dependency order
  await prisma.invoice.deleteMany({ where: { sale: { organizationId: orgId } } });
  await prisma.sale.deleteMany({ where: { organizationId: orgId } });
  await prisma.client.deleteMany({ where: { organizationId: orgId } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.teamBrand.deleteMany({ where: { team: { organizationId: orgId } } });
  await prisma.teamMember.deleteMany({ where: { team: { organizationId: orgId } } });
  await prisma.team.deleteMany({ where: { organizationId: orgId } });
  await prisma.teamType.deleteMany({ where: { organizationId: orgId } });
  await prisma.brand.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
}
