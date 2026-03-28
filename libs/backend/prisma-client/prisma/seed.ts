/**
 * Sentra Core - Database Seed
 * Run: npx prisma db seed --schema=libs/backend/prisma-client/prisma/schema.prisma
 */

import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  AppCode,
  PlanType,
  OrganizationOnboardingMode,
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

async function main() {
  console.log('Seeding Sentra Core database...\n');

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
  // AppRegistry intentionally NOT deleted - runRbacSeed uses upsert

  console.log('Cleanup complete.\n');

  console.log('Seeding RBAC catalog...');
  await runRbacSeed(prisma);
  console.log('RBAC seeded.\n');

  console.log('Seeding HRMS team types...');
  await runHrmsTeamsSeed(prisma);
  console.log('HRMS team types seeded.\n');

  const org = await prisma.organization.create({
    data: {
      name: 'Sentra Core Systems',
      subscription: 'PRO',
      planType: PlanType.PRO,
      onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
    },
  });
  console.log(`Organization: ${org.name} (${org.id})`);

  // Damian was listed twice in resp.md, but User.email is unique, so he is seeded once as Sales Manager.
  const seedUsers: SeedUser[] = [
    {
      name: 'Admin User',
      email: 'shakirmadcom@gmail.com',
      password: 'Sh-2212112@@',
      role: UserRole.OWNER,
      jobTitle: 'System Owner',
    },
    {
      name: 'Damian',
      email: 'damian@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.SALES_MANAGER,
      jobTitle: 'Sales Manager',
    },
    {
      name: 'Ethan',
      email: 'ethan@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.UPSELL_AGENT,
      jobTitle: 'Upsell Specialist',
    },
    {
      name: 'Samantha',
      email: 'samantha@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.UPSELL_AGENT,
      jobTitle: 'Upsell Specialist',
    },
    {
      name: 'Jay',
      email: 'jay@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Adrian',
      email: 'adrian@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Jake',
      email: 'jake@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Denzil',
      email: 'denzil@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Becky',
      email: 'becky@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Logan',
      email: 'logan@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.FRONTSELL_AGENT,
      jobTitle: 'Frontsell Agent',
    },
    {
      name: 'Mikhail',
      email: 'mikhail@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
      role: UserRole.PROJECT_MANAGER,
      jobTitle: 'Project Lead',
    },
    {
      name: 'M Adonis',
      email: 'm.adonis@kapublishingsolutions.com',
      password: 'Ka_Psh@123!!',
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

  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const requireUser = (email: string) => {
    const user = userByEmail.get(email);
    if (!user) {
      throw new Error(`Missing seeded user: ${email}`);
    }
    return user;
  };

  const owner = requireUser('shakirmadcom@gmail.com');
  const salesManagers = ['damian@kapublishingsolutions.com'].map(requireUser);
  const upsellAgents = [
    'ethan@kapublishingsolutions.com',
    'samantha@kapublishingsolutions.com',
  ].map(requireUser);
  const frontsellAgents = [
    'jay@kapublishingsolutions.com',
    'adrian@kapublishingsolutions.com',
    'jake@kapublishingsolutions.com',
    'denzil@kapublishingsolutions.com',
    'becky@kapublishingsolutions.com',
    'logan@kapublishingsolutions.com',
  ].map(requireUser);
  const projectManagers = [
    'mikhail@kapublishingsolutions.com',
    'm.adonis@kapublishingsolutions.com',
  ].map(requireUser);

  console.log(`Users: ${seedUsers.length} accounts created.`);

  const salesApp = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.SALES_DASHBOARD } });
  const pmApp = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.PM_DASHBOARD } });
  const hrmsApp = await prisma.appRegistry.findUniqueOrThrow({ where: { code: AppCode.HRMS } });

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

  await grantAccess(owner.id, salesApp.id, true);
  await grantAccess(owner.id, pmApp.id);
  await grantAccess(owner.id, hrmsApp.id);
  await assignRole(owner.id, salesApp.id, 'sales_admin');
  await assignRole(owner.id, pmApp.id, 'pm_admin');
  await assignRole(owner.id, hrmsApp.id, 'hrms_admin');

  for (const manager of salesManagers) {
    await grantAccess(manager.id, salesApp.id, true);
    await grantAccess(manager.id, pmApp.id);
    await assignRole(manager.id, salesApp.id, 'sales_manager');
    await assignRole(manager.id, pmApp.id, 'pm_project_manager');
  }

  for (const agent of frontsellAgents) {
    await grantAccess(agent.id, salesApp.id, true);
    await assignRole(agent.id, salesApp.id, 'frontsell_agent');
  }

  for (const agent of upsellAgents) {
    await grantAccess(agent.id, salesApp.id, true);
    await assignRole(agent.id, salesApp.id, 'upsell_agent');
  }

  for (const pm of projectManagers) {
    await grantAccess(pm.id, pmApp.id, true);
    await grantAccess(pm.id, salesApp.id);
    await assignRole(pm.id, pmApp.id, 'pm_project_manager');
  }

  console.log('App access granted and system roles assigned.\n');

  const pulpHouse = await prisma.brand.create({
    data: {
      name: 'The Pulp House Publishing',
      domain: 'thepulphousepublishing.com',
      logoUrl: 'sentra/pulphouse-logo.png',
      primaryColor: '#6366F1',
      secondaryColor: '#4F46E5',
      organizationId: org.id,
    },
  });

  console.log(`Brand: ${pulpHouse.name} created.`);

  // await prisma.salesTeam.create({
  //   data: {
  //     name: 'North America Frontsell',
  //     description: 'Acquisition team for US/Canada region',
  //     organizationId: org.id,
  //   },
  // });

  // await prisma.productPackage.create({
  //   data: {
  //     name: 'Essential Ebook',
  //     description: 'Formatting + Cover Design',
  //     brandId: pulpHouse.id,
  //     organizationId: org.id,
  //     items: {
  //       create: [
  //         { name: 'Professional Formatting', unitPrice: 299 },
  //         { name: 'Standard Cover Art', unitPrice: 200 },
  //       ],
  //     },
  //   },
  // });

  // Product packages intentionally not seeded.
  // Leads and sales data remain disabled as before.

  console.log('TEST ACCOUNTS');
  console.log('   shakirmadcom@gmail.com              / Sh-2212112@@   -> OWNER           | Sales Admin + PM Admin + HRMS Admin');
  console.log('   damian@kapublishingsolutions.com    / Ka_Psh@123!!   -> SALES_MANAGER   | Sales Manager + PM Project Manager');
  console.log('   ethan@kapublishingsolutions.com     / Ka_Psh@123!!   -> UPSELL_AGENT    | Upsell Agent role');
  console.log('   samantha@kapublishingsolutions.com  / Ka_Psh@123!!   -> UPSELL_AGENT    | Upsell Agent role');
  console.log('   jay@kapublishingsolutions.com       / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   adrian@kapublishingsolutions.com    / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   jake@kapublishingsolutions.com      / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   denzil@kapublishingsolutions.com    / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   becky@kapublishingsolutions.com     / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   logan@kapublishingsolutions.com     / Ka_Psh@123!!   -> FRONTSELL_AGENT | Frontsell Agent role');
  console.log('   mikhail@kapublishingsolutions.com   / Ka_Psh@123!!   -> PROJECT_MANAGER | PM Project Manager role');
  console.log('   m.adonis@kapublishingsolutions.com  / Ka_Psh@123!!   -> PROJECT_MANAGER | PM Project Manager role');
  console.log('\nSeed complete.\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
