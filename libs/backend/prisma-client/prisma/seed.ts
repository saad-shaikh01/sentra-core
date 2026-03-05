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
  console.log('🌱  Seeding Sentra Core database...\n');

  // ── 1. Organization ──────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: 'Madcom Digital',
      subscription: 'PRO',
      onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
    },
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── 2. Users (all roles) ────────────────────────────────────────────────
  const seedUsers: SeedUser[] = [
    {
      name: 'Adam Hassan',
      email: 'admin@madcom.com',
      password: 'Admin@123',
      role: UserRole.OWNER,
      jobTitle: 'CEO',
    },
    {
      name: 'Nadia Ali',
      email: 'nadia@madcom.com',
      password: 'Admin@123',
      role: UserRole.ADMIN,
      jobTitle: 'Operations Admin',
    },
    {
      name: 'Sarah Khan',
      email: 'sarah@madcom.com',
      password: 'Agent@123',
      role: UserRole.SALES_MANAGER,
      jobTitle: 'Sales Manager',
    },
    {
      name: 'Alex Rivera',
      email: 'alex@madcom.com',
      password: 'Agent@123',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Mike Thomas',
      email: 'mike@madcom.com',
      password: 'Agent@123',
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

  // ── 3. Brands ────────────────────────────────────────────────────────────
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

  const velocityBooks = await prisma.brand.create({
    data: {
      name: 'Velocity Books',
      domain: 'velocitybooks.com',
      logoUrl: 'https://placehold.co/120x40/10b981/fff?text=VelocityBooks',
      organizationId: org.id,
    },
  });

  await prisma.brandAccess.createMany({
    data: [
      { userId: admin.id, brandId: pulpHouse.id, role: 'ADMIN' },
      { userId: admin.id, brandId: urbanQuill.id, role: 'ADMIN' },
      { userId: pmLeadPublishing.id, brandId: pulpHouse.id, role: 'EDITOR' },
      { userId: pmLeadDesign.id, brandId: pulpHouse.id, role: 'EDITOR' },
      { userId: pmEditor.id, brandId: pulpHouse.id, role: 'EDITOR' },
      { userId: pmDesigner.id, brandId: pulpHouse.id, role: 'EDITOR' },
      { userId: pmQc.id, brandId: pulpHouse.id, role: 'EDITOR' },
    ],
    skipDuplicates: true,
  });

  console.log('✅  Brands: 3 + brand access linked');

  // ── 4. Clients ───────────────────────────────────────────────────────────
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

  const bluewaveClient = await prisma.client.create({
    data: {
      companyName: 'BlueWave Labs',
      contactName: 'Emily Watson',
      email: 'emily@bluewave.ai',
      password: hash('Client@123'),
      phone: '+1-555-0202',
      brandId: urbanQuill.id,
      organizationId: org.id,
    },
  });

  console.log('✅  Clients: NovaTech Solutions, BlueWave Labs');

  // ── 5. Sales ─────────────────────────────────────────────────────────────
  await prisma.sale.createMany({
    data: [
      {
        totalAmount: 4500,
        currency: 'USD',
        status: SaleStatus.ACTIVE,
        description: 'Full-service retainer — Q1',
        clientId: novatechClient.id,
        brandId: pulpHouse.id,
        organizationId: org.id,
        createdAt: daysAgo(30),
      },
      {
        totalAmount: 2200,
        currency: 'USD',
        status: SaleStatus.ACTIVE,
        description: 'Quarterly campaign setup',
        clientId: bluewaveClient.id,
        brandId: urbanQuill.id,
        organizationId: org.id,
        createdAt: daysAgo(14),
      },
    ],
  });
  console.log('✅  Sales: 2 active records');

  // ── 6. PM Templates ──────────────────────────────────────────────────────
  console.log('\n🏗️  Seeding PM templates...');

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

  const publishingBlueprint = [
    {
      name: 'Manuscript Review',
      departmentCode: PmDepartmentCode.EDITING,
      sortOrder: 1,
      defaultSlaHours: 72,
      clientReviewMode: PmClientReviewMode.NONE,
      requiresStageApproval: false,
      requiresQcByDefault: true,
      tasks: ['Structural edit', 'Language proofread'],
    },
    {
      name: 'Cover Design',
      departmentCode: PmDepartmentCode.DESIGN,
      sortOrder: 2,
      defaultSlaHours: 120,
      clientReviewMode: PmClientReviewMode.REQUIRED,
      requiresStageApproval: false,
      requiresQcByDefault: false,
      tasks: ['Cover concept', 'Cover revisions'],
    },
    {
      name: 'Interior Formatting',
      departmentCode: PmDepartmentCode.EDITING,
      sortOrder: 3,
      defaultSlaHours: 96,
      clientReviewMode: PmClientReviewMode.NONE,
      requiresStageApproval: false,
      requiresQcByDefault: false,
      tasks: ['Layout formatting', 'Pagination QA'],
    },
    {
      name: 'Final QC',
      departmentCode: PmDepartmentCode.QC,
      sortOrder: 4,
      defaultSlaHours: 48,
      clientReviewMode: PmClientReviewMode.NONE,
      requiresStageApproval: true,
      requiresQcByDefault: true,
      tasks: ['QC checklist', 'Final approval prep'],
    },
    {
      name: 'Publishing & Distribution',
      departmentCode: PmDepartmentCode.OPERATIONS,
      sortOrder: 5,
      defaultSlaHours: 168,
      clientReviewMode: PmClientReviewMode.NONE,
      requiresStageApproval: false,
      requiresQcByDefault: false,
      tasks: ['Platform publishing', 'Distribution rollout'],
    },
  ];

  const templateStages: Awaited<ReturnType<typeof prisma.pmTemplateStage.create>>[] = [];
  for (const stage of publishingBlueprint) {
    const createdStage = await prisma.pmTemplateStage.create({
      data: {
        templateId: publishingTemplate.id,
        name: stage.name,
        departmentCode: stage.departmentCode,
        sortOrder: stage.sortOrder,
        defaultSlaHours: stage.defaultSlaHours,
        clientReviewMode: stage.clientReviewMode,
        requiresStageApproval: stage.requiresStageApproval,
        requiresQcByDefault: stage.requiresQcByDefault,
      },
    });
    templateStages.push(createdStage);

    for (const [taskOrder, taskName] of stage.tasks.entries()) {
      await prisma.pmTemplateTask.create({
        data: {
          templateStageId: createdStage.id,
          name: taskName,
          sortOrder: taskOrder + 1,
          requiresQc: stage.requiresQcByDefault,
        },
      });
    }
  }

  for (let i = 1; i < templateStages.length; i++) {
    await prisma.pmTemplateStageDependency.create({
      data: {
        templateStageId: templateStages[i].id,
        dependsOnTemplateStageId: templateStages[i - 1].id,
        dependencyType: PmDependencyType.FINISH_TO_START,
      },
    });
  }
  console.log('✅  PM Template: Standard Book Publishing (+ stages + tasks + dependencies)');

  // ── 7. PM Engagements + Projects ────────────────────────────────────────
  console.log('\n🚀  Seeding PM execution data...');

  const clientEngagement = await prisma.pmEngagement.create({
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

  const internalEngagement = await prisma.pmEngagement.create({
    data: {
      organizationId: org.id,
      ownerType: 'INTERNAL_BRAND',
      ownerBrandId: velocityBooks.id,
      primaryBrandId: velocityBooks.id,
      name: 'Internal Process Upgrade',
      status: 'DRAFT',
      createdById: admin.id,
    },
  });

  const activeProject = await prisma.pmProject.create({
    data: {
      organizationId: org.id,
      engagementId: clientEngagement.id,
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

  const sandboxProject = await prisma.pmProject.create({
    data: {
      organizationId: org.id,
      engagementId: internalEngagement.id,
      brandId: velocityBooks.id,
      projectType: PmProjectType.INTERNAL,
      serviceType: PmServiceType.GENERAL,
      name: 'PM Sandbox - Fresh Build',
      status: PmProjectStatus.DRAFT,
      priority: PmProjectPriority.MEDIUM,
      deliveryDueAt: daysFromNow(30),
      createdById: admin.id,
    },
  });

  const stageStatusByOrder: PmStageStatus[] = [
    PmStageStatus.ACTIVE,
    PmStageStatus.READY,
    PmStageStatus.PENDING,
    PmStageStatus.PENDING,
    PmStageStatus.PENDING,
  ];
  const stageLeadByOrder = [
    pmLeadPublishing.id,
    pmLeadDesign.id,
    pmLeadPublishing.id,
    pmQc.id,
    pmLeadPublishing.id,
  ];

  const projectStages: Awaited<ReturnType<typeof prisma.pmProjectStage.create>>[] = [];
  for (const [index, templateStage] of templateStages.entries()) {
    const createdStage = await prisma.pmProjectStage.create({
      data: {
        organizationId: org.id,
        projectId: activeProject.id,
        templateStageId: templateStage.id,
        name: templateStage.name,
        description: `${templateStage.name} execution lane`,
        departmentCode: templateStage.departmentCode,
        status: stageStatusByOrder[index] ?? PmStageStatus.PENDING,
        sortOrder: index,
        ownerLeadId: stageLeadByOrder[index] ?? pmLeadPublishing.id,
        clientReviewMode: templateStage.clientReviewMode,
        requiresStageApproval: templateStage.requiresStageApproval,
        requiresQcByDefault: templateStage.requiresQcByDefault,
        dueAt: daysFromNow(7 + index * 5),
        startedAt: index === 0 ? daysAgo(2) : null,
      },
    });
    projectStages.push(createdStage);
  }

  for (let i = 1; i < projectStages.length; i++) {
    await prisma.pmStageDependency.create({
      data: {
        projectId: activeProject.id,
        projectStageId: projectStages[i].id,
        dependsOnProjectStageId: projectStages[i - 1].id,
        dependencyType: PmDependencyType.FINISH_TO_START,
      },
    });
  }

  const getStage = (name: string) => {
    const stage = projectStages.find((s) => s.name === name);
    if (!stage) {
      throw new Error(`Missing stage in seed: ${name}`);
    }
    return stage;
  };

  const createTaskWithAssignment = async (input: {
    stageId: string;
    name: string;
    description: string;
    status: PmTaskStatus;
    priority: PmTaskPriority;
    sortOrder: number;
    ownerLeadId: string;
    assigneeId?: string;
    dueInDays: number;
    requiresQc?: boolean;
  }) => {
    const task = await prisma.pmTask.create({
      data: {
        organizationId: org.id,
        projectId: activeProject.id,
        projectStageId: input.stageId,
        name: input.name,
        description: input.description,
        status: input.status,
        priority: input.priority,
        sortOrder: input.sortOrder,
        ownerLeadId: input.ownerLeadId,
        assigneeId: input.assigneeId ?? null,
        requiresQc: input.requiresQc ?? false,
        dueAt: daysFromNow(input.dueInDays),
        startedAt: input.status === PmTaskStatus.IN_PROGRESS ? hoursAgo(12) : null,
        createdById: pmLeadPublishing.id,
        updatedById: pmLeadPublishing.id,
      },
    });

    if (input.assigneeId) {
      await prisma.pmTaskAssignment.create({
        data: {
          taskId: task.id,
          assignedById: input.ownerLeadId,
          assignedToId: input.assigneeId,
          assignmentType: PmAssignmentType.MANUAL,
          isCurrent: true,
          startedAt: hoursAgo(24),
          notes: 'Assigned during seed setup for PM testing',
        },
      });
    }

    return task;
  };

  const manuscriptEditTask = await createTaskWithAssignment({
    stageId: getStage('Manuscript Review').id,
    name: 'Structural edit draft',
    description: 'Review manuscript structure and mark major revisions.',
    status: PmTaskStatus.IN_PROGRESS,
    priority: PmTaskPriority.HIGH,
    sortOrder: 0,
    ownerLeadId: pmLeadPublishing.id,
    assigneeId: pmEditor.id,
    dueInDays: 2,
    requiresQc: true,
  });

  const proofreadTask = await createTaskWithAssignment({
    stageId: getStage('Manuscript Review').id,
    name: 'Language proofread',
    description: 'Perform grammar and style pass for submission readiness.',
    status: PmTaskStatus.READY,
    priority: PmTaskPriority.MEDIUM,
    sortOrder: 1,
    ownerLeadId: pmLeadPublishing.id,
    assigneeId: pmEditor.id,
    dueInDays: 3,
    requiresQc: true,
  });

  await createTaskWithAssignment({
    stageId: getStage('Cover Design').id,
    name: 'Cover concept v1',
    description: 'Create and share first cover concept options.',
    status: PmTaskStatus.READY,
    priority: PmTaskPriority.HIGH,
    sortOrder: 0,
    ownerLeadId: pmLeadDesign.id,
    assigneeId: pmDesigner.id,
    dueInDays: 5,
  });

  await createTaskWithAssignment({
    stageId: getStage('Cover Design').id,
    name: 'Cover feedback incorporation',
    description: 'Apply stakeholder feedback to selected concept.',
    status: PmTaskStatus.PENDING,
    priority: PmTaskPriority.MEDIUM,
    sortOrder: 1,
    ownerLeadId: pmLeadDesign.id,
    dueInDays: 7,
  });

  await createTaskWithAssignment({
    stageId: getStage('Interior Formatting').id,
    name: 'Layout formatting pass',
    description: 'Apply final trim size and chapter layout.',
    status: PmTaskStatus.PENDING,
    priority: PmTaskPriority.MEDIUM,
    sortOrder: 0,
    ownerLeadId: pmLeadPublishing.id,
    dueInDays: 10,
  });

  await createTaskWithAssignment({
    stageId: getStage('Final QC').id,
    name: 'Pre-publish QC checklist',
    description: 'Run submission against full QC checklist.',
    status: PmTaskStatus.READY,
    priority: PmTaskPriority.HIGH,
    sortOrder: 0,
    ownerLeadId: pmQc.id,
    assigneeId: pmQc.id,
    dueInDays: 12,
    requiresQc: true,
  });

  await prisma.pmTaskWorklog.createMany({
    data: [
      {
        taskId: manuscriptEditTask.id,
        userId: pmEditor.id,
        startedAt: hoursAgo(10),
        endedAt: hoursAgo(8),
        durationMinutes: 120,
        notes: 'Completed chapter-1 to chapter-4 structural review.',
      },
      {
        taskId: manuscriptEditTask.id,
        userId: pmEditor.id,
        startedAt: hoursAgo(5),
        endedAt: hoursAgo(4),
        durationMinutes: 60,
        notes: 'Prepared revision comments for author.',
      },
    ],
  });

  await prisma.pmTask.update({
    where: { id: proofreadTask.id },
    data: {
      status: PmTaskStatus.SUBMITTED,
      submittedAt: hoursAgo(3),
      updatedById: pmEditor.id,
    },
  });

  const submittedProofread = await prisma.pmTaskSubmission.create({
    data: {
      taskId: proofreadTask.id,
      submittedById: pmEditor.id,
      submissionNumber: 1,
      status: PmSubmissionStatus.SUBMITTED,
      notes: 'Proofread completed with tracked changes.',
      submittedAt: hoursAgo(3),
    },
  });

  await prisma.pmSelfQcResponse.createMany({
    data: [
      {
        taskSubmissionId: submittedProofread.id,
        labelSnapshot: 'Spell check complete',
        isChecked: true,
      },
      {
        taskSubmissionId: submittedProofread.id,
        labelSnapshot: 'Formatting consistency',
        isChecked: true,
      },
    ],
  });

  const deliverable = await prisma.pmDeliverablePackage.create({
    data: {
      projectId: activeProject.id,
      name: 'Initial Editorial Delivery',
      description: 'First complete editorial package for client review.',
      deliveryType: PmDeliverableType.CLIENT,
      createdById: pmLeadPublishing.id,
    },
  });

  await prisma.pmDeliverableItem.create({
    data: {
      deliverablePackageId: deliverable.id,
      taskSubmissionId: submittedProofread.id,
      sortOrder: 0,
      label: 'Proofread manuscript v1',
    },
  });

  await prisma.pmApprovalRequest.create({
    data: {
      projectId: activeProject.id,
      deliverablePackageId: deliverable.id,
      approvalTargetType: PmApprovalTargetType.CLIENT,
      approvalTargetEmail: novatechClient.email,
      status: PmApprovalRequestStatus.PENDING,
      sentById: pmLeadPublishing.id,
      sentAt: hoursAgo(2),
      dueAt: daysFromNow(3),
    },
  });

  const projectThread = await prisma.pmConversationThread.create({
    data: {
      organizationId: org.id,
      projectId: activeProject.id,
      scopeType: PmThreadScopeType.PROJECT,
      scopeId: activeProject.id,
      visibility: PmThreadVisibility.INTERNAL,
      createdById: pmLeadPublishing.id,
    },
  });

  await prisma.pmThreadParticipant.createMany({
    data: [
      { threadId: projectThread.id, userId: owner.id },
      { threadId: projectThread.id, userId: pmLeadPublishing.id },
      { threadId: projectThread.id, userId: pmLeadDesign.id },
      { threadId: projectThread.id, userId: pmEditor.id },
      { threadId: projectThread.id, userId: pmDesigner.id },
      { threadId: projectThread.id, userId: pmQc.id },
    ],
    skipDuplicates: true,
  });

  await prisma.pmMessage.create({
    data: {
      threadId: projectThread.id,
      authorId: pmLeadPublishing.id,
      body: 'Kickoff complete. Manuscript stage is active and assignments are done.',
    },
  });

  const taskThread = await prisma.pmConversationThread.create({
    data: {
      organizationId: org.id,
      projectId: activeProject.id,
      scopeType: PmThreadScopeType.TASK,
      scopeId: manuscriptEditTask.id,
      visibility: PmThreadVisibility.INTERNAL,
      createdById: pmEditor.id,
    },
  });

  await prisma.pmThreadParticipant.createMany({
    data: [
      { threadId: taskThread.id, userId: pmEditor.id },
      { threadId: taskThread.id, userId: pmLeadPublishing.id },
      { threadId: taskThread.id, userId: pmLeadDesign.id },
    ],
    skipDuplicates: true,
  });

  const taskMessage = await prisma.pmMessage.create({
    data: {
      threadId: taskThread.id,
      authorId: pmEditor.id,
      body: 'Draft edit complete for first batch. @lead please review notes.',
    },
  });

  await prisma.pmMessageMention.create({
    data: {
      messageId: taskMessage.id,
      mentionedUserId: pmLeadPublishing.id,
    },
  });

  const workingAsset = await prisma.pmFileAsset.create({
    data: {
      organizationId: org.id,
      projectId: activeProject.id,
      assetType: PmFileAssetType.WORKING,
      name: 'manuscript-v1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdById: pmEditor.id,
    },
  });

  const workingVersion = await prisma.pmFileVersion.create({
    data: {
      fileAssetId: workingAsset.id,
      versionNumber: 1,
      storageKey: `seed/org-${org.id}/projects/${activeProject.id}/manuscript-v1.docx`,
      originalFilename: 'manuscript-v1.docx',
      sizeBytes: 238000,
      checksum: 'seed-checksum-manuscript-v1',
      uploadedById: pmEditor.id,
      isLatest: true,
      isApproved: false,
      isPublished: false,
    },
  });

  await prisma.pmFileLink.create({
    data: {
      fileAssetId: workingAsset.id,
      fileVersionId: workingVersion.id,
      scopeType: PmFileScopeType.TASK,
      scopeId: manuscriptEditTask.id,
      linkType: PmFileLinkType.REFERENCE,
      createdById: pmEditor.id,
    },
  });

  console.log(`✅  PM Engagements: 2`);
  console.log(`✅  PM Projects: ${activeProject.name} (active) + ${sandboxProject.name} (draft)`);
  console.log('✅  PM Execution: stages, tasks, assignments, worklogs, submission, deliverable, approval');
  console.log('✅  PM Collaboration: project/task threads, mentions, task file link');

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\n🔐  Test users (passwords for local testing)');
  for (const user of seedUsers) {
    console.log(`   - ${user.role.padEnd(15)} ${user.email} / ${user.password}`);
  }

  console.log('\n🧪  Quick PM flow data ready');
  console.log(`   - Active project: ${activeProject.name}`);
  console.log('   - Stage/task assignment paths are pre-seeded');
  console.log(`   - Draft sandbox project: ${sandboxProject.name} (good for manual stage/task creation tests)`);
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
