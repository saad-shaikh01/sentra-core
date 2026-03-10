/**
 * Sentra Core — Database Seed
 * Run: npx prisma db seed --schema=libs/backend/prisma-client/prisma/schema.prisma
 */

import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  AppCode,
  DataScopeType,
  OrganizationOnboardingMode,
  LeadStatus,
  SaleStatus,
  PaymentPlanType,
  InvoiceStatus,
  PmServiceType,
  PmProjectType,
  PmProjectStatus,
  PmProjectPriority,
  PmDepartmentCode,
  PmClientReviewMode,
  PmDependencyType,
  PmStageStatus,
  PmTaskStatus,
  PmTaskPriority,
  PmAssignmentType,
  PmSubmissionStatus,
  PmDeliverableType,
  PmApprovalTargetType,
  PmApprovalRequestStatus,
  PmThreadScopeType,
  PmThreadVisibility,
  PmFileAssetType,
  PmFileScopeType,
  PmFileLinkType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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

function hoursAgo(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

async function main() {
  console.log('🌱  Seeding Sentra Core database (Production Readiness Edition)...\n');

  // ── 0. CLEANUP ───────────────────────────────────────────────────────────
  // We delete in reverse order of dependencies
  console.log('🧹  Cleaning up existing data...');
  await prisma.invoice.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.client.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.salesTeamManager.deleteMany();
  await prisma.salesTeamMember.deleteMany();
  await prisma.salesTeam.deleteMany();
  await prisma.productPackage.deleteMany();
  await prisma.userAppRole.deleteMany();
  await prisma.userAppAccess.deleteMany();
  await prisma.userScopeGrant.deleteMany();
  await prisma.brandAccess.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  // AppRegistry is usually static, but we can leave it or upsert it
  console.log('✨  Cleanup complete.');

  // ── 1. Organization ──────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'Sentra Global Corp',
      subscription: 'PRO',
      onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
    },
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── 2. Users (all roles) ────────────────────────────────────────────────
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
          organizationId: org.id,
        },
      }),
    );
  }

  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const owner = userByEmail.get('admin@sentra.com')!;
  const manager = userByEmail.get('sarah@sentra.com')!;
  const agentFront = userByEmail.get('alex@sentra.com')!;
  const agentUp = userByEmail.get('mike@sentra.com')!;
  const pm = userByEmail.get('hira@sentra.com')!;

  // ── 3. App Registry & Access ─────────────────────────────────────────────
  const salesApp = await prisma.appRegistry.upsert({
    where: { code: AppCode.SALES_DASHBOARD },
    update: {},
    create: {
      code: AppCode.SALES_DASHBOARD,
      name: 'Sales Dashboard',
      baseUrl: 'http://localhost:4200',
      description: 'Lead management and revenue tracking',
    },
  });

  const pmApp = await prisma.appRegistry.upsert({
    where: { code: AppCode.PM_DASHBOARD },
    update: {},
    create: {
      code: AppCode.PM_DASHBOARD,
      name: 'PM Dashboard',
      baseUrl: 'http://localhost:4201',
      description: 'Production and delivery tracking',
    },
  });

  // Grant access to users (Multi-app access for testing switcher)
  const grantAccess = async (userId: string, appId: string, isDefault = false) => {
    await prisma.userAppAccess.create({
      data: {
        organizationId: org.id,
        userId,
        appId,
        isEnabled: true,
        isDefault,
      },
    });
  };

  // Owner gets both
  await grantAccess(owner.id, salesApp.id, true);
  await grantAccess(owner.id, pmApp.id, false);

  // Manager gets both
  await grantAccess(manager.id, salesApp.id, true);
  await grantAccess(manager.id, pmApp.id, false);

  // Agents get Sales only
  await grantAccess(agentFront.id, salesApp.id, true);
  await grantAccess(agentUp.id, salesApp.id, true);

  // PM gets PM by default and Sales for cross-module verification
  await grantAccess(pm.id, pmApp.id, true);
  await grantAccess(pm.id, salesApp.id, false);

  console.log('✅  App Access: Gateway and Switcher data ready.');

  // ── 4. Brands (Advanced Identities) ──────────────────────────────────────
  const pulpHouse = await prisma.brand.create({
    data: {
      name: 'The Pulp House',
      domain: 'thepulphouse.com',
      logoUrl: 'https://cdn.bunny.net/sentra/pulphouse-logo.png',
      primaryColor: '#6366F1', // Indigo
      secondaryColor: '#4F46E5',
      organizationId: org.id,
    },
  });

  const urbanQuill = await prisma.brand.create({
    data: {
      name: 'Urban Quill',
      domain: 'urbanquill.com',
      logoUrl: 'https://cdn.bunny.net/sentra/urbanquill-logo.png',
      primaryColor: '#F59E0B', // Amber
      secondaryColor: '#D97706',
      organizationId: org.id,
    },
  });

  console.log('✅  Brands: Multi-brand dynamic identity data ready.');

  // ── 5. Sales Teams (Multi-Manager Support) ───────────────────────────────
  const frontsellTeam = await prisma.salesTeam.create({
    data: {
      name: 'North America Frontsell',
      description: 'Acquisition team for US/Canada region',
      organizationId: org.id,
      managers: {
        create: [
          { userId: owner.id },
          { userId: manager.id }
        ]
      },
      members: {
        create: [
          { userId: agentFront.id }
        ]
      }
    }
  });

  console.log('✅  Teams: Multi-manager team structure ready.');

  // ── 6. Product Catalog ───────────────────────────────────────────────────
  const basicPkg = await prisma.productPackage.create({
    data: {
      name: 'Essential Ebook',
      description: 'Formatting + Cover Design',
      brandId: pulpHouse.id,
      organizationId: org.id,
      items: {
        create: [
          { name: 'Professional Formatting', unitPrice: 299 },
          { name: 'Standard Cover Art', unitPrice: 200 }
        ]
      }
    }
  });

  const customPkg = await prisma.productPackage.create({
    data: {
      name: 'Custom Marketing Bundle',
      description: 'Tailored for high-end authors',
      brandId: urbanQuill.id,
      organizationId: org.id,
      items: {
        create: [
          { name: 'Social Media Management', unitPrice: 500 },
          { name: 'Premium Press Release', unitPrice: 300 }
        ]
      }
    }
  });

  console.log('✅  Packages: Standardized service catalog ready.');

  // ── 7. Leads (Advanced Statuses) ─────────────────────────────────────────
  const activeLead = await prisma.lead.create({
    data: {
      title: 'Interested in Ghostwriting',
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1-555-9000',
      website: 'https://johndoe.com',
      status: LeadStatus.FOLLOW_UP,
      source: 'PPC',
      brandId: pulpHouse.id,
      organizationId: org.id,
      assignedToId: agentFront.id,
      followUpDate: daysFromNow(2),
      data: { clientGoal: 'Publish by Q4', budget: 5000 }
    }
  });

  const convertedLead = await prisma.lead.create({
    data: {
      title: 'Inquiry - Full Publishing',
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      phone: '+1-555-8000',
      status: LeadStatus.CLOSED,
      source: 'Direct',
      brandId: urbanQuill.id,
      organizationId: org.id,
      assignedToId: agentUp.id,
      createdAt: daysAgo(10)
    }
  });

  console.log('✅  Leads: Follow-up and activity tracking ready.');

  // ── 8. Clients & Advanced Sales (Installments) ───────────────────────────
  const client = await prisma.client.create({
    data: {
      email: 'john.author@example.com',
      password: hash('Client@123'),
      companyName: 'John Author LLC',
      contactName: 'John Doe',
      brandId: urbanQuill.id,
      organizationId: org.id,
    }
  });

  // Link lead to client
  await prisma.lead.update({
    where: { id: convertedLead.id },
    data: { convertedClientId: client.id }
  });

  // Create Sale with Installments
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
      items: {
        create: [
          { name: 'Full Publishing Bundle', quantity: 1, unitPrice: 1200 }
        ]
      }
    }
  });

  // Seed Invoices for the installment plan
  await prisma.invoice.createMany({
    data: [
      {
        invoiceNumber: `INV-SEED-001`,
        amount: 400,
        dueDate: daysAgo(1),
        status: InvoiceStatus.PAID,
        saleId: sale.id
      },
      {
        invoiceNumber: `INV-SEED-002`,
        amount: 400,
        dueDate: daysFromNow(29),
        status: InvoiceStatus.UNPAID,
        saleId: sale.id
      },
      {
        invoiceNumber: `INV-SEED-003`,
        amount: 400,
        dueDate: daysFromNow(59),
        status: InvoiceStatus.UNPAID,
        saleId: sale.id
      }
    ]
  });

  console.log('✅  Sales: Advanced installment plan and auto-invoices ready.');

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\n🔐  LOCAL TESTING ACCOUNTS');
  console.log('   - Owner: admin@sentra.com / Admin@123 (Full Access)');
  console.log('   - Manager: sarah@sentra.com / Admin@123 (Team Access)');
  console.log('   - Agent: alex@sentra.com / Agent@123 (Self Access)');
  console.log('\n🚀  Seed complete! Happy testing.\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
