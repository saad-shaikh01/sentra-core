/**
 * Sentra Core — Database Seed
 * Run: npx prisma db seed --schema=libs/backend/prisma-client/prisma/schema.prisma
 */

import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  AppCode,
  PlanType,
  OrganizationOnboardingMode,
  LeadStatus,
  SaleStatus,
  PaymentPlanType,
  InvoiceStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { runRbacSeed } from './seeds/rbac.seed';
import { runHrmsTeamsSeed } from './seeds/hrms-teams.seed';

const prisma = new PrismaClient();

type SeedUser = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  jobTitle: string;
};

type SeededUser = {
  id: string;
  email: string;
};

function hash(plain: string) {
  return bcrypt.hashSync(plain, 10);
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

async function main() {
  console.log('🌱  Seeding Sentra Core database...\n');

  // ── 0. CLEANUP ───────────────────────────────────────────────────────────
  console.log('🧹  Cleaning up existing data...');

  // RBAC junction tables first (before roles/permissions)
  await prisma.appRolePermission.deleteMany();
  await prisma.userAppRole.deleteMany();
  await prisma.userAppAccess.deleteMany();
  await prisma.userScopeGrant.deleteMany();

  // Invitation data
  await prisma.userInvitation.deleteMany();
  await prisma.invitationBundle.deleteMany();
  await prisma.invitation.deleteMany();

  // HRMS teams
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.teamType.deleteMany();

  // Sales data
  await prisma.invoice.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.clientActivity.deleteMany();
  await prisma.client.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.salesTeamManager.deleteMany();
  await prisma.salesTeamMember.deleteMany();
  await prisma.salesTeam.deleteMany();
  await prisma.productPackage.deleteMany();
  await prisma.brandAccess.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.department.deleteMany();

  // Users & org (after all FK-dependent rows)
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // System RBAC rows (no org FK, safe after users are gone)
  await prisma.appRole.deleteMany();
  await prisma.permissionCatalog.deleteMany();
  // AppRegistry intentionally NOT deleted — runRbacSeed uses upsert

  console.log('✨  Cleanup complete.\n');

  // ── 1. RBAC: apps, permissions, system roles ─────────────────────────────
  console.log('🔐  Seeding RBAC catalog...');
  await runRbacSeed(prisma);
  console.log('✅  RBAC: AppRegistry, PermissionCatalog, system AppRoles seeded.\n');

  // ── 2. HRMS: system team types ────────────────────────────────────────────
  console.log('👥  Seeding HRMS team types...');
  await runHrmsTeamsSeed(prisma);
  console.log('✅  HRMS: system TeamTypes seeded.\n');

  // ── 3. Organization ───────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'Sentra Global Corp',
      subscription: 'PRO',
      planType: PlanType.PRO,
      onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
    },
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── 4. Users ──────────────────────────────────────────────────────────────
  const seedUsers: SeedUser[] = [
    {
      name: 'Admin User',
      email: 'admin@sentra.com',
      password: 'Admin@123',
      role: UserRole.OWNER,
      jobTitle: 'System Owner',
    },
    {
      name: 'Manager Sarah',
      email: 'sarah@sentra.com',
      password: 'Admin@123',
      role: UserRole.SALES_MANAGER,
      jobTitle: 'Sales Manager',
    },
    {
      name: 'Agent Alex',
      email: 'alex@sentra.com',
      password: 'Agent@123',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Agent Mike',
      email: 'mike@sentra.com',
      password: 'Agent@123',
      role: UserRole.UPSELL_AGENT,
      jobTitle: 'Upsell Specialist',
    },
    {
      name: 'PM Hira',
      email: 'hira@sentra.com',
      password: 'PmLead@123',
      role: UserRole.PROJECT_MANAGER,
      jobTitle: 'Project Lead',
    },
  ];

  const users: SeededUser[] = [];
  for (const seedUser of seedUsers) {
    users.push(
      await prisma.user.create({
        data: {
          name: seedUser.name,
          email: seedUser.email,
          password: hash(seedUser.password),
          role: seedUser.role,
          jobTitle: seedUser.jobTitle,
          isActive: true,
          organizationId: org.id,
        },
      }),
    );
  }

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const owner    = userByEmail.get('admin@sentra.com')!;
  const manager  = userByEmail.get('sarah@sentra.com')!;
  const agentFront = userByEmail.get('alex@sentra.com')!;
  const agentUp    = userByEmail.get('mike@sentra.com')!;
  const pm         = userByEmail.get('hira@sentra.com')!;

  console.log(`✅  Users: ${seedUsers.length} accounts created.`);

  // ── 5. App Access + Role Assignments ─────────────────────────────────────
  // Fetch apps already seeded by runRbacSeed
  const salesApp = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.SALES_DASHBOARD } });
  const pmApp    = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.PM_DASHBOARD } });
  const hrmsApp  = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.HRMS } });

  // Helpers
  const grantAccess = async (userId: string, appId: string, isDefault = false) => {
    await prisma.userAppAccess.create({
      data: { organizationId: org.id, userId, appId, isEnabled: true, isDefault },
    });
  };

  const assignRole = async (userId: string, appId: string, slug: string) => {
    const role = await prisma.appRole.findFirstOrThrow({
      where: { organizationId: null, appId, slug },
    });
    await prisma.userAppRole.create({
      data: {
        organizationId: org.id,
        userId,
        appId,
        appRoleId: role.id,
        isPrimary: true,
      },
    });
  };

  // Owner: Sales (default) + PM + HRMS → all admin roles
  await grantAccess(owner.id, salesApp.id, true);
  await grantAccess(owner.id, pmApp.id);
  await grantAccess(owner.id, hrmsApp.id);
  await assignRole(owner.id, salesApp.id, 'sales_admin');
  await assignRole(owner.id, pmApp.id, 'pm_admin');
  await assignRole(owner.id, hrmsApp.id, 'hrms_admin');

  // Manager: Sales (default) + PM
  await grantAccess(manager.id, salesApp.id, true);
  await grantAccess(manager.id, pmApp.id);
  await assignRole(manager.id, salesApp.id, 'sales_manager');
  await assignRole(manager.id, pmApp.id, 'pm_project_manager');

  // Frontsell Agent: Sales only
  await grantAccess(agentFront.id, salesApp.id, true);
  await assignRole(agentFront.id, salesApp.id, 'frontsell_agent');

  // Upsell Agent: Sales only
  await grantAccess(agentUp.id, salesApp.id, true);
  await assignRole(agentUp.id, salesApp.id, 'upsell_agent');

  // PM: PM (default) + Sales (for cross-module testing)
  await grantAccess(pm.id, pmApp.id, true);
  await grantAccess(pm.id, salesApp.id);
  await assignRole(pm.id, pmApp.id, 'pm_project_manager');

  console.log('✅  App Access: granted and system roles assigned.\n');

  // ── 6. Brands ─────────────────────────────────────────────────────────────
  const pulpHouse = await prisma.brand.create({
    data: {
      name: 'The Pulp House',
      domain: 'thepulphouse.com',
      logoUrl: 'https://cdn.bunny.net/sentra/pulphouse-logo.png',
      primaryColor: '#6366F1',
      secondaryColor: '#4F46E5',
      organizationId: org.id,
    },
  });

  const urbanQuill = await prisma.brand.create({
    data: {
      name: 'Urban Quill',
      domain: 'urbanquill.com',
      logoUrl: 'https://cdn.bunny.net/sentra/urbanquill-logo.png',
      primaryColor: '#F59E0B',
      secondaryColor: '#D97706',
      organizationId: org.id,
    },
  });

  console.log('✅  Brands: 2 brands created.');

  // ── 7. Sales Teams (legacy SalesTeam model) ───────────────────────────────
  await prisma.salesTeam.create({
    data: {
      name: 'North America Frontsell',
      description: 'Acquisition team for US/Canada region',
      organizationId: org.id,
      managers: { create: [{ userId: owner.id }, { userId: manager.id }] },
      members:  { create: [{ userId: agentFront.id }] },
    },
  });

  console.log('✅  Sales Teams: legacy team structure created.');

  // ── 8. Product Catalog ────────────────────────────────────────────────────
  await prisma.productPackage.create({
    data: {
      name: 'Essential Ebook',
      description: 'Formatting + Cover Design',
      brandId: pulpHouse.id,
      organizationId: org.id,
      items: {
        create: [
          { name: 'Professional Formatting', unitPrice: 299 },
          { name: 'Standard Cover Art', unitPrice: 200 },
        ],
      },
    },
  });

  await prisma.productPackage.create({
    data: {
      name: 'Custom Marketing Bundle',
      description: 'Tailored for high-end authors',
      brandId: urbanQuill.id,
      organizationId: org.id,
      items: {
        create: [
          { name: 'Social Media Management', unitPrice: 500 },
          { name: 'Premium Press Release', unitPrice: 300 },
        ],
      },
    },
  });

  console.log('✅  Packages: product catalog created.');

  // ── 9. Leads ──────────────────────────────────────────────────────────────
  const activeLead = await prisma.lead.create({
    data: {
      title: 'Interested in Ghostwriting',
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1-555-9000',
      website: 'https://johndoe.com',
      status: LeadStatus.FOLLOW_UP,
      leadType: 'INBOUND',
      source: 'PPC',
      leadDate: daysAgo(2),
      brandId: pulpHouse.id,
      organizationId: org.id,
      assignedToId: agentFront.id,
      followUpDate: daysFromNow(2),
      data: { clientGoal: 'Publish by Q4', budget: 5000 },
    },
  });

  const convertedLead = await prisma.lead.create({
    data: {
      title: 'Inquiry - Full Publishing',
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      phone: '+1-555-8000',
      status: LeadStatus.WON,
      leadType: 'REFERRAL',
      source: 'COLD_REFERRAL',
      leadDate: daysAgo(10),
      brandId: urbanQuill.id,
      organizationId: org.id,
      assignedToId: agentUp.id,
    },
  });

  // Suppress unused var warning
  void activeLead;

  console.log('✅  Leads: 2 leads created.');

  // ── 10. Clients & Sales ───────────────────────────────────────────────────
  const client = await prisma.client.create({
    data: {
      email: 'john.author@example.com',
      contactName: 'John Doe',
      brandId: urbanQuill.id,
      organizationId: org.id,
    },
  });

  await prisma.lead.update({
    where: { id: convertedLead.id },
    data: { convertedClientId: client.id },
  });

  const sale = await prisma.sale.create({
    data: {
      totalAmount: 1200,
      currency: 'USD',
      status: SaleStatus.ACTIVE,
      paymentPlan: PaymentPlanType.INSTALLMENTS,
      installmentCount: 3,
      clientId: client.id,
      brandId: urbanQuill.id,
      organizationId: org.id,
      description: '3-month installment plan for full publishing bundle',
      items: { create: [{ name: 'Full Publishing Bundle', quantity: 1, unitPrice: 1200 }] },
    },
  });

  await prisma.invoice.createMany({
    data: [
      { invoiceNumber: 'INV-SEED-001', amount: 400, dueDate: daysAgo(1),     status: InvoiceStatus.PAID,   saleId: sale.id },
      { invoiceNumber: 'INV-SEED-002', amount: 400, dueDate: daysFromNow(29), status: InvoiceStatus.UNPAID, saleId: sale.id },
      { invoiceNumber: 'INV-SEED-003', amount: 400, dueDate: daysFromNow(59), status: InvoiceStatus.UNPAID, saleId: sale.id },
    ],
  });

  console.log('✅  Sales: client, sale, and installment invoices created.\n');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('🔐  TEST ACCOUNTS');
  console.log('   admin@sentra.com  / Admin@123   → OWNER  | Sales Admin + PM Admin + HRMS Admin');
  console.log('   sarah@sentra.com  / Admin@123   → SALES_MANAGER | Sales Manager + PM Project Manager');
  console.log('   alex@sentra.com   / Agent@123   → FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   mike@sentra.com   / Agent@123   → UPSELL_AGENT    | Upsell Agent role');
  console.log('   hira@sentra.com   / PmLead@123  → PROJECT_MANAGER | PM Project Manager role');
  console.log('\n🚀  Seed complete! Happy smoke testing.\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
