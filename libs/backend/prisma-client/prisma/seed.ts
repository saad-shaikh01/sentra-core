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
      onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
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

  const pmLead = await prisma.user.create({
    data: {
      name: 'Hira Malik',
      email: 'hira@madcom.com',
      password: hash('PmLead@123'),
      role: UserRole.PROJECT_MANAGER,
      jobTitle: 'PM Lead',
      organizationId: org.id,
    },
  });

  const pmMember = await prisma.user.create({
    data: {
      name: 'Umair Siddiqui',
      email: 'umair@madcom.com',
      password: hash('PmTeam@123'),
      role: UserRole.PROJECT_MANAGER,
      jobTitle: 'PM Team Member',
      organizationId: org.id,
    },
  });

  const users = [owner, sarah, alex, mike, pmLead, pmMember];
  console.log(`✅  Users (${users.length}): ${users.map((u) => u.email).join(', ')}`);

  // ── 2.1 IAM App Registry + Roles + Access ────────────────────────────────
  const salesApp = await prisma.appRegistry.create({
    data: {
      code: AppCode.SALES_DASHBOARD,
      name: 'Sales Dashboard',
      baseUrl: 'http://localhost:4200',
      description: 'Sales pipeline and confidential client data',
    },
  });

  const pmApp = await prisma.appRegistry.create({
    data: {
      code: AppCode.PM_DASHBOARD,
      name: 'PM Dashboard',
      baseUrl: 'http://localhost:4201',
      description: 'Project delivery and task execution',
    },
  });

  const salesPermissionKeys = [
    'app.user.invite',
    'app.access.grant',
    'app.role.assign',
    'sales.lead.read',
    'sales.lead.write',
    'sales.client.read',
    'sales.client.write',
    'sales.export.secure',
  ];
  const pmPermissionKeys = [
    'app.user.invite',
    'app.access.grant',
    'app.role.assign',
    'pm.project.read',
    'pm.project.write',
    'pm.task.assign',
    'pm.task.execute',
    'pm.qc.review',
  ];

  for (const key of salesPermissionKeys) {
    await prisma.permissionCatalog.create({
      data: {
        appId: salesApp.id,
        key,
        label: key,
      },
    });
  }
  for (const key of pmPermissionKeys) {
    await prisma.permissionCatalog.create({
      data: {
        appId: pmApp.id,
        key,
        label: key,
      },
    });
  }

  const salesPerms = await prisma.permissionCatalog.findMany({
    where: { appId: salesApp.id },
  });
  const pmPerms = await prisma.permissionCatalog.findMany({
    where: { appId: pmApp.id },
  });

  const salesAdminRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: salesApp.id,
      name: 'Sales Admin',
      slug: 'sales_admin',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const salesManagerRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: salesApp.id,
      name: 'Sales Manager',
      slug: 'sales_manager',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const frontsellRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: salesApp.id,
      name: 'Frontsell Agent',
      slug: 'frontsell_agent',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const upsellRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: salesApp.id,
      name: 'Upsell Agent',
      slug: 'upsell_agent',
      isSystem: true,
      createdById: owner.id,
    },
  });

  const pmAdminRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: pmApp.id,
      name: 'PM Admin',
      slug: 'pm_admin',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const pmLeadRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: pmApp.id,
      name: 'PM Lead',
      slug: 'pm_lead',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const pmTeamRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: pmApp.id,
      name: 'PM Team Member',
      slug: 'pm_team_member',
      isSystem: true,
      createdById: owner.id,
    },
  });
  const pmQcRole = await prisma.appRole.create({
    data: {
      organizationId: org.id,
      appId: pmApp.id,
      name: 'PM QC',
      slug: 'pm_qc',
      isSystem: true,
      createdById: owner.id,
    },
  });

  const byKey = (rows: { id: string; key: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.key, r.id]));
  const salesPermByKey = byKey(salesPerms);
  const pmPermByKey = byKey(pmPerms);

  const linkRolePerms = async (roleId: string, permIds: string[]) => {
    for (const permissionId of permIds) {
      await prisma.appRolePermission.create({
        data: { appRoleId: roleId, permissionId },
      });
    }
  };

  await linkRolePerms(salesAdminRole.id, salesPerms.map((p) => p.id));
  await linkRolePerms(salesManagerRole.id, [
    salesPermByKey['app.user.invite'],
    salesPermByKey['app.access.grant'],
    salesPermByKey['app.role.assign'],
    salesPermByKey['sales.lead.read'],
    salesPermByKey['sales.lead.write'],
    salesPermByKey['sales.client.read'],
    salesPermByKey['sales.client.write'],
  ]);
  await linkRolePerms(frontsellRole.id, [
    salesPermByKey['sales.lead.read'],
    salesPermByKey['sales.lead.write'],
    salesPermByKey['sales.client.read'],
  ]);
  await linkRolePerms(upsellRole.id, [
    salesPermByKey['sales.lead.read'],
    salesPermByKey['sales.client.read'],
    salesPermByKey['sales.client.write'],
  ]);

  await linkRolePerms(pmAdminRole.id, pmPerms.map((p) => p.id));
  await linkRolePerms(pmLeadRole.id, [
    pmPermByKey['app.user.invite'],
    pmPermByKey['app.access.grant'],
    pmPermByKey['app.role.assign'],
    pmPermByKey['pm.project.read'],
    pmPermByKey['pm.project.write'],
    pmPermByKey['pm.task.assign'],
    pmPermByKey['pm.task.execute'],
  ]);
  await linkRolePerms(pmTeamRole.id, [
    pmPermByKey['pm.project.read'],
    pmPermByKey['pm.task.execute'],
  ]);
  await linkRolePerms(pmQcRole.id, [
    pmPermByKey['pm.project.read'],
    pmPermByKey['pm.qc.review'],
  ]);

  const grantAppAccess = async (
    userId: string,
    appId: string,
    appRoleId: string,
    isDefault = false,
  ) => {
    await prisma.userAppAccess.create({
      data: {
        organizationId: org.id,
        userId,
        appId,
        isEnabled: true,
        isDefault,
      },
    });
    await prisma.userAppRole.create({
      data: {
        organizationId: org.id,
        userId,
        appId,
        appRoleId,
        isPrimary: true,
      },
    });
  };

  await grantAppAccess(owner.id, salesApp.id, salesAdminRole.id, true);
  await grantAppAccess(owner.id, pmApp.id, pmAdminRole.id, false);
  await grantAppAccess(sarah.id, salesApp.id, salesManagerRole.id, true);
  await grantAppAccess(alex.id, salesApp.id, frontsellRole.id, true);
  await grantAppAccess(mike.id, salesApp.id, upsellRole.id, true);
  await grantAppAccess(pmLead.id, pmApp.id, pmLeadRole.id, true);
  await grantAppAccess(pmMember.id, pmApp.id, pmTeamRole.id, true);

  await prisma.userScopeGrant.createMany({
    data: [
      {
        organizationId: org.id,
        userId: sarah.id,
        appId: salesApp.id,
        resourceKey: 'sales.leads',
        scopeType: DataScopeType.TEAM,
      },
      {
        organizationId: org.id,
        userId: alex.id,
        appId: salesApp.id,
        resourceKey: 'sales.leads',
        scopeType: DataScopeType.OWN,
      },
      {
        organizationId: org.id,
        userId: pmLead.id,
        appId: pmApp.id,
        resourceKey: 'pm.tasks',
        scopeType: DataScopeType.TEAM,
      },
      {
        organizationId: org.id,
        userId: pmMember.id,
        appId: pmApp.id,
        resourceKey: 'pm.tasks',
        scopeType: DataScopeType.OWN,
      },
    ],
  });

  console.log('✅  IAM: app registry, permissions, app roles, user access + scopes');

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
