import 'dotenv/config';
import { AppCode, PrismaClient } from '@prisma/client';

type PrismaLike = Pick<
  PrismaClient,
  'appRegistry' | 'permissionCatalog' | 'appRole' | 'appRolePermission' | '$transaction' | '$disconnect'
>;

type SeedPermission = {
  appCode: AppCode;
  code: string;
  label: string;
  description?: string;
};

type SeedRole = {
  appCode: AppCode;
  slug: string;
  name: string;
  description?: string;
  permissions: string[];
};

const APP_REGISTRY = [
  {
    code: AppCode.SALES_DASHBOARD,
    name: 'Sales Dashboard',
    description: 'Sales pipeline, leads, and commercial operations',
    baseUrl: process.env['SALES_DASHBOARD_URL'] ?? 'http://localhost:4200',
  },
  {
    code: AppCode.PM_DASHBOARD,
    name: 'PM Dashboard',
    description: 'Project management and delivery operations',
    baseUrl: process.env['PM_DASHBOARD_URL'] ?? 'http://localhost:4201',
  },
  {
    code: AppCode.HRMS,
    name: 'HRMS',
    description: 'Human resource management',
    baseUrl: process.env['HRMS_DASHBOARD_URL'] ?? null,
  },
  {
    code: AppCode.CLIENT_PORTAL,
    name: 'Admin',
    description: 'Administrative access and client-facing controls',
    baseUrl: process.env['CLIENT_PORTAL_URL'] ?? null,
  },
  {
    code: AppCode.COMM_SERVICE,
    name: 'Comm Service',
    description: 'Messaging and communication services',
    baseUrl: process.env['COMM_SERVICE_URL'] ?? null,
  },
] as const;

export const RBAC_PERMISSIONS: SeedPermission[] = [
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:view_own', label: 'View Own Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:view_team', label: 'View Team Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:view_all', label: 'View All Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:create', label: 'Create Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:edit_own', label: 'Edit Own Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:edit_all', label: 'Edit All Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:delete', label: 'Delete Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:assign', label: 'Assign Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:leads:export', label: 'Export Leads' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:view_own', label: 'View Own Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:view_all', label: 'View All Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:create', label: 'Create Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:edit_own', label: 'Edit Own Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:edit_all', label: 'Edit All Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:delete', label: 'Delete Sales' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:refund', label: 'Process Refunds' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:sales:chargeback', label: 'Handle Chargebacks' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:reports:view', label: 'View Reports' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:reports:export', label: 'Export Reports' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:teams:view', label: 'View Teams' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:teams:manage', label: 'Manage Teams' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:settings:view', label: 'View Settings' },
  { appCode: AppCode.SALES_DASHBOARD, code: 'sales:settings:manage', label: 'Manage Settings' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:projects:view_assigned', label: 'View Assigned Projects' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:projects:view_all', label: 'View All Projects' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:projects:create', label: 'Create Projects' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:projects:edit', label: 'Edit Projects' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:projects:delete', label: 'Delete Projects' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:view_own', label: 'View Own Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:view_all', label: 'View All Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:create', label: 'Create Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:edit_own', label: 'Edit Own Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:edit_all', label: 'Edit All Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:tasks:assign', label: 'Assign Tasks' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:departments:manage', label: 'Manage Departments' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:reports:view', label: 'View PM Reports' },
  { appCode: AppCode.PM_DASHBOARD, code: 'pm:settings:manage', label: 'Manage PM Settings' },
  { appCode: AppCode.HRMS, code: 'hrms:users:view', label: 'View Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:create', label: 'Create Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:edit', label: 'Edit Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:suspend', label: 'Suspend Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:deactivate', label: 'Deactivate Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:invite', label: 'Invite Employees' },
  { appCode: AppCode.HRMS, code: 'hrms:users:manage_access', label: 'Manage Employee App Access' },
  { appCode: AppCode.HRMS, code: 'hrms:users:manage_sessions', label: 'Manage User Sessions' },
  { appCode: AppCode.HRMS, code: 'hrms:roles:view', label: 'View Roles' },
  { appCode: AppCode.HRMS, code: 'hrms:roles:manage', label: 'Manage Roles' },
  { appCode: AppCode.HRMS, code: 'hrms:app_access:manage', label: 'Manage App Access' },
  { appCode: AppCode.HRMS, code: 'hrms:teams:view', label: 'View Teams' },
  { appCode: AppCode.HRMS, code: 'hrms:teams:manage', label: 'Manage Teams' },
  { appCode: AppCode.HRMS, code: 'hrms:departments:manage', label: 'Manage Departments' },
  { appCode: AppCode.HRMS, code: 'hrms:invitations:send', label: 'Send Invitations' },
];

export const RBAC_SYSTEM_ROLES: SeedRole[] = [
  {
    appCode: AppCode.SALES_DASHBOARD,
    slug: 'sales_admin',
    name: 'Sales Admin',
    permissions: [
      'sales:leads:view_all',
      'sales:leads:create',
      'sales:leads:edit_all',
      'sales:leads:delete',
      'sales:leads:assign',
      'sales:leads:export',
      'sales:sales:view_all',
      'sales:sales:create',
      'sales:sales:edit_all',
      'sales:sales:delete',
      'sales:sales:refund',
      'sales:sales:chargeback',
      'sales:reports:view',
      'sales:reports:export',
      'sales:teams:view',
      'sales:teams:manage',
      'sales:settings:view',
      'sales:settings:manage',
    ],
  },
  {
    appCode: AppCode.SALES_DASHBOARD,
    slug: 'sales_manager',
    name: 'Sales Manager',
    permissions: [
      'sales:leads:view_all',
      'sales:leads:edit_all',
      'sales:leads:assign',
      'sales:leads:export',
      'sales:sales:view_all',
      'sales:sales:edit_all',
      'sales:reports:view',
      'sales:reports:export',
      'sales:teams:view',
      'sales:settings:view',
    ],
  },
  {
    appCode: AppCode.SALES_DASHBOARD,
    slug: 'frontsell_agent',
    name: 'Frontsell Agent',
    permissions: [
      'sales:leads:view_own',
      'sales:leads:create',
      'sales:leads:edit_own',
      'sales:sales:view_own',
      'sales:sales:create',
      'sales:sales:edit_own',
    ],
  },
  {
    appCode: AppCode.SALES_DASHBOARD,
    slug: 'upsell_agent',
    name: 'Upsell Agent',
    permissions: [
      'sales:leads:view_own',
      'sales:sales:view_own',
      'sales:sales:create',
      'sales:sales:edit_own',
    ],
  },
  {
    appCode: AppCode.PM_DASHBOARD,
    slug: 'pm_admin',
    name: 'PM Admin',
    permissions: [
      'pm:projects:view_all',
      'pm:projects:create',
      'pm:projects:edit',
      'pm:projects:delete',
      'pm:tasks:view_all',
      'pm:tasks:create',
      'pm:tasks:edit_all',
      'pm:tasks:assign',
      'pm:departments:manage',
      'pm:reports:view',
      'pm:settings:manage',
    ],
  },
  {
    appCode: AppCode.PM_DASHBOARD,
    slug: 'pm_project_manager',
    name: 'Project Manager',
    permissions: [
      'pm:projects:view_all',
      'pm:projects:create',
      'pm:projects:edit',
      'pm:tasks:view_all',
      'pm:tasks:create',
      'pm:tasks:edit_all',
      'pm:tasks:assign',
      'pm:reports:view',
    ],
  },
  {
    appCode: AppCode.PM_DASHBOARD,
    slug: 'pm_team_lead',
    name: 'Team Lead',
    permissions: [
      'pm:projects:view_assigned',
      'pm:tasks:view_all',
      'pm:tasks:create',
      'pm:tasks:edit_all',
      'pm:tasks:assign',
    ],
  },
  {
    appCode: AppCode.PM_DASHBOARD,
    slug: 'pm_team_member',
    name: 'Team Member',
    permissions: ['pm:projects:view_assigned', 'pm:tasks:view_own', 'pm:tasks:edit_own'],
  },
  {
    appCode: AppCode.HRMS,
    slug: 'hrms_admin',
    name: 'HRMS Admin',
    permissions: [
      'hrms:users:view',
      'hrms:users:create',
      'hrms:users:edit',
      'hrms:users:suspend',
      'hrms:users:deactivate',
      'hrms:users:invite',
      'hrms:users:manage_access',
      'hrms:users:manage_sessions',
      'hrms:roles:view',
      'hrms:roles:manage',
      'hrms:app_access:manage',
      'hrms:teams:view',
      'hrms:teams:manage',
      'hrms:departments:manage',
      'hrms:invitations:send',
    ],
  },
  {
    appCode: AppCode.HRMS,
    slug: 'hrms_manager',
    name: 'HR Manager',
    permissions: [
      'hrms:users:view',
      'hrms:users:create',
      'hrms:users:edit',
      'hrms:users:suspend',
      'hrms:users:invite',
      'hrms:roles:view',
      'hrms:users:manage_access',
      'hrms:teams:view',
      'hrms:teams:manage',
      'hrms:departments:manage',
      'hrms:invitations:send',
    ],
  },
];

export async function runRbacSeed(prisma: PrismaLike): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const appIds = new Map<AppCode, string>();

    for (const appDef of APP_REGISTRY) {
      const app = await tx.appRegistry.upsert({
        where: { code: appDef.code },
        update: {
          name: appDef.name,
          description: appDef.description,
          baseUrl: appDef.baseUrl,
          isActive: true,
        },
        create: {
          code: appDef.code,
          name: appDef.name,
          description: appDef.description,
          baseUrl: appDef.baseUrl,
          isActive: true,
        },
      });

      appIds.set(appDef.code, app.id);
    }

    for (const permission of RBAC_PERMISSIONS) {
      const appId = appIds.get(permission.appCode);
      if (!appId) {
        throw new Error(`App registry missing for ${permission.appCode}`);
      }

      await tx.permissionCatalog.upsert({
        where: {
          appId_key: {
            appId,
            key: permission.code,
          },
        },
        update: {
          label: permission.label,
          description: permission.description ?? null,
          isActive: true,
        },
        create: {
          appId,
          key: permission.code,
          label: permission.label,
          description: permission.description ?? null,
          isActive: true,
        },
      });
    }

    for (const role of RBAC_SYSTEM_ROLES) {
      const appId = appIds.get(role.appCode);
      if (!appId) {
        throw new Error(`App registry missing for ${role.appCode}`);
      }

      const existingRole = await tx.appRole.findFirst({
        where: {
          organizationId: null,
          appId,
          slug: role.slug,
        },
        select: { id: true },
      });

      const appRole = existingRole
        ? await tx.appRole.update({
            where: { id: existingRole.id },
            data: {
              name: role.name,
              slug: role.slug,
              description: role.description ?? null,
              isSystem: true,
              isActive: true,
            },
          })
        : await tx.appRole.create({
            data: {
              organizationId: null,
              appId,
              name: role.name,
              slug: role.slug,
              description: role.description ?? null,
              isSystem: true,
              isActive: true,
            },
          });

      const permissionRows = await tx.permissionCatalog.findMany({
        where: {
          appId,
          key: {
            in: role.permissions,
          },
        },
        select: { id: true, key: true },
      });

      if (permissionRows.length !== role.permissions.length) {
        const found = new Set(permissionRows.map((permission) => permission.key));
        const missing = role.permissions.filter((permission) => !found.has(permission));
        throw new Error(`Missing permission catalog rows for role ${role.slug}: ${missing.join(', ')}`);
      }

      await tx.appRolePermission.deleteMany({
        where: { appRoleId: appRole.id },
      });

      if (permissionRows.length > 0) {
        await tx.appRolePermission.createMany({
          data: permissionRows.map((permission) => ({
            appRoleId: appRole.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
    }
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    await runRbacSeed(prisma);
    console.log('RBAC seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error('RBAC seed failed:', error);
    process.exit(1);
  });
}
