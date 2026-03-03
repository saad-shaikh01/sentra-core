/**
 * Sentra Core — Database Seed
 * Run: npx prisma db seed --schema=libs/backend/prisma-client/prisma/schema.prisma
 */

import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  LeadStatus,
  SaleStatus,
  InvoiceStatus,
  LeadActivityType,
  TransactionStatus,
  TransactionType,
  PmServiceType,
  PmProjectType,
  PmProjectStatus,
  PmProjectPriority,
  PmDepartmentCode,
  PmClientReviewMode,
  PmDependencyType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding Sentra Core database…\n');

  // ── 1. Organization ────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'Madcom Digital',
      subscription: 'PRO',
    },
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── 2. Users ───────────────────────────────────────────────────────────────
  const owner = await prisma.user.create({
    data: {
      name: 'Adam Hassan',
      email: 'admin@madcom.com',
      password: hash('Admin@123'),
      role: UserRole.OWNER,
      jobTitle: 'CEO',
      organizationId: org.id,
    },
  });

  const sarah = await prisma.user.create({
    data: {
      name: 'Sarah Khan',
      email: 'sarah@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.SALES_MANAGER,
      jobTitle: 'Sales Manager',
      organizationId: org.id,
    },
  });

  const alex = await prisma.user.create({
    data: {
      name: 'Alex Rivera',
      email: 'alex@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Sales Agent',
      organizationId: org.id,
    },
  });

  const mike = await prisma.user.create({
    data: {
      name: 'Mike Thomas',
      email: 'mike@madcom.com',
      password: hash('Agent@123'),
      role: UserRole.UPSELL_AGENT,
      jobTitle: 'Upsell Specialist',
      organizationId: org.id,
    },
  });

  const users = [owner, sarah, alex, mike];
  console.log(`✅  Users (${users.length}): ${users.map((u) => u.email).join(', ')}`);

  // ── 3. Brands ──────────────────────────────────────────────────────────────
  const pulpHouse = await prisma.brand.create({
    data: {
      name: 'The Pulp House',
      domain: 'thepulphouse.com',
      logoUrl: 'https://placehold.co/120x40/6366f1/fff?text=PulpHouse',
      organizationId: org.id,
    },
  });

  const urbanQuill = await prisma.brand.create({
    data: {
      name: 'Urban Quill',
      domain: 'urbanquill.com',
      logoUrl: 'https://placehold.co/120x40/f59e0b/fff?text=UrbanQuill',
      organizationId: org.id,
    },
  });

  const brands = [pulpHouse, urbanQuill];
  console.log(`✅  Brands (${brands.length}): ${brands.map((b) => b.name).join(', ')}`);

  // ── 4. Clients ─────────────────────────────────────────────────────────────
  const novatechClient = await prisma.client.create({
    data: {
      companyName: 'NovaTech Solutions',
      contactName: 'James Carter',
      email: 'james@novatech.io',
      password: hash('Client@123'),
      phone: '+1-555-0101',
      brandId: pulpHouse.id,
      organizationId: org.id,
    },
  });
  console.log(`✅  Clients: ${novatechClient.companyName}`);

  // ── 5. Sales ───────────────────────────────────────────────────────────────
  const sale1 = await prisma.sale.create({
    data: {
      totalAmount: 4500,
      currency: 'USD',
      status: SaleStatus.ACTIVE,
      description: 'Full-service retainer — Q1',
      clientId: novatechClient.id,
      brandId: pulpHouse.id,
      organizationId: org.id,
      createdAt: daysAgo(30),
    },
  });
  console.log(`✅  Sales: 1 record`);

  // ── 6. PM Service Templates ───────────────────────────────────────────────
  console.log('\n🏗️  Seeding PM Templates…');

  const publishingTemplate = await prisma.pmServiceTemplate.create({
    data: {
      organizationId: org.id,
      name: 'Standard Book Publishing',
      serviceType: PmServiceType.PUBLISHING,
      description: 'End-to-end publishing workflow from manuscript to print.',
      isDefault: true,
      createdById: owner.id,
    },
  });

  const pubStages = [
    { name: 'Manuscript Review', dept: PmDepartmentCode.EDITING, order: 1, sla: 72 },
    { name: 'Cover Design', dept: PmDepartmentCode.DESIGN, order: 2, sla: 120, review: PmClientReviewMode.REQUIRED },
    { name: 'Interior Formatting', dept: PmDepartmentCode.EDITING, order: 3, sla: 96 },
    { name: 'Final QC', dept: PmDepartmentCode.QC, order: 4, sla: 48, approval: true },
    { name: 'Publishing & Distribution', dept: PmDepartmentCode.OPERATIONS, order: 5, sla: 168 },
  ];

  const pubStageRecords = [];
  for (const s of pubStages) {
    const stage = await prisma.pmTemplateStage.create({
      data: {
        templateId: publishingTemplate.id,
        name: s.name,
        departmentCode: s.dept,
        sortOrder: s.order,
        defaultSlaHours: s.sla,
        clientReviewMode: s.review ?? PmClientReviewMode.NONE,
        requiresStageApproval: s.approval ?? false,
      },
    });
    pubStageRecords.push(stage);

    await prisma.pmTemplateTask.create({
      data: {
        templateStageId: stage.id,
        name: `${s.name} - Initial Draft`,
        sortOrder: 1,
        requiresQc: true,
      },
    });
  }

  // Dependency: Design depends on Editing
  await prisma.pmTemplateStageDependency.create({
    data: {
      templateStageId: pubStageRecords[1].id,
      dependsOnTemplateStageId: pubStageRecords[0].id,
      dependencyType: PmDependencyType.FINISH_TO_START,
    },
  });

  console.log('✅  PM Templates: Publishing');

  // ── 7. PM Engagements + Projects ──────────────────────────────────────────
  console.log('\n🚀  Seeding PM Execution Layer…');

  const engagement = await prisma.pmEngagement.create({
    data: {
      organizationId: org.id,
      ownerType: 'CLIENT',
      clientId: novatechClient.id,
      primaryBrandId: pulpHouse.id,
      name: 'Q1 Content Strategy',
      status: 'ACTIVE',
      createdById: owner.id,
    },
  });

  const project = await prisma.pmProject.create({
    data: {
      organizationId: org.id,
      engagementId: engagement.id,
      brandId: pulpHouse.id,
      clientId: novatechClient.id,
      templateId: publishingTemplate.id,
      projectType: PmProjectType.EXTERNAL,
      serviceType: PmServiceType.PUBLISHING,
      name: 'Wasabi Case Study Publication',
      status: PmProjectStatus.ACTIVE,
      priority: PmProjectPriority.HIGH,
      deliveryDueAt: daysFromNow(45),
      createdById: owner.id,
    },
  });

  console.log(`✅  PM Project: ${project.name}`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n🎉  Seed complete!\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
