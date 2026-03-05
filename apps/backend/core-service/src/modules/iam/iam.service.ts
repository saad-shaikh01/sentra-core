import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@sentra-core/prisma-client';
import { MailClientService } from '@sentra-core/mail-client';
import { Prisma } from '@prisma/client';
import {
  AppCode,
  DataScopeType,
  JwtPayload,
  UserRole,
} from '@sentra-core/types';
import { v4 as uuidv4 } from 'uuid';
import { CreateIamInvitationDto, InviteAppBundleDto, UpdateUserEntitlementsDto } from './dto';

const INVITE_REQUIRED_KEYS = ['app.user.invite', 'app.access.grant', 'app.role.assign'];

const DEFAULT_APP_REGISTRY: Array<{ code: AppCode; name: string; description: string }> = [
  {
    code: AppCode.SALES_DASHBOARD,
    name: 'Sales Dashboard',
    description: 'Sales pipeline, leads, and confidential commercial data',
  },
  {
    code: AppCode.PM_DASHBOARD,
    name: 'PM Dashboard',
    description: 'Project delivery operations and task execution',
  },
  {
    code: AppCode.HRMS,
    name: 'HRMS',
    description: 'Human resources management',
  },
  {
    code: AppCode.CLIENT_PORTAL,
    name: 'Client Portal',
    description: 'Customer-facing portal',
  },
  {
    code: AppCode.COMM_SERVICE,
    name: 'Comm Service',
    description: 'Messaging and communication services',
  },
];

const DEFAULT_PERMISSION_CATALOG: Record<AppCode, string[]> = {
  [AppCode.SALES_DASHBOARD]: [
    'app.user.invite',
    'app.access.grant',
    'app.role.assign',
    'sales.lead.read',
    'sales.lead.write',
    'sales.client.read',
    'sales.client.write',
    'sales.export.secure',
  ],
  [AppCode.PM_DASHBOARD]: [
    'app.user.invite',
    'app.access.grant',
    'app.role.assign',
    'pm.project.read',
    'pm.project.write',
    'pm.task.assign',
    'pm.task.execute',
    'pm.qc.review',
  ],
  [AppCode.HRMS]: ['app.user.invite', 'app.access.grant', 'app.role.assign'],
  [AppCode.CLIENT_PORTAL]: ['app.user.invite', 'app.access.grant', 'app.role.assign'],
  [AppCode.COMM_SERVICE]: ['app.user.invite', 'app.access.grant', 'app.role.assign'],
};

@Injectable()
export class IamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailClientService,
  ) {}

  private isFeatureEnabled(): boolean {
    const value = this.configService.get<string>('IAM_INVITE_V2', 'false').toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  }

  isInviteV2Enabled(): boolean {
    return this.isFeatureEnabled();
  }

  private assertFeatureEnabled(): void {
    if (!this.isFeatureEnabled()) {
      throw new NotFoundException('IAM invite flow is disabled');
    }
  }

  private getAppBaseUrl(appCode: AppCode): string | null {
    switch (appCode) {
      case AppCode.SALES_DASHBOARD:
        return this.configService.get<string>('SALES_DASHBOARD_URL') ?? 'http://localhost:4200';
      case AppCode.PM_DASHBOARD:
        return this.configService.get<string>('PM_DASHBOARD_URL') ?? 'http://localhost:4201';
      case AppCode.HRMS:
        return this.configService.get<string>('HRMS_DASHBOARD_URL') ?? null;
      case AppCode.CLIENT_PORTAL:
        return this.configService.get<string>('CLIENT_PORTAL_URL') ?? null;
      case AppCode.COMM_SERVICE:
        return this.configService.get<string>('COMM_SERVICE_URL') ?? null;
      default:
        return null;
    }
  }

  private buildInviteLink(token: string): string {
    const base =
      this.configService.get<string>('INVITE_ACCEPT_URL_BASE') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:4200';
    return `${base}/auth/accept-invite?token=${token}`;
  }

  private toAppCode(value: string): AppCode {
    return value as AppCode;
  }

  async ensureDefaultCatalog(tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;

    for (const appDef of DEFAULT_APP_REGISTRY) {
      const app = await db.appRegistry.upsert({
        where: { code: appDef.code as never },
        update: {
          name: appDef.name,
          description: appDef.description,
          baseUrl: this.getAppBaseUrl(appDef.code),
          isActive: true,
        },
        create: {
          code: appDef.code as never,
          name: appDef.name,
          description: appDef.description,
          baseUrl: this.getAppBaseUrl(appDef.code),
          isActive: true,
        },
      });

      const permissionKeys = DEFAULT_PERMISSION_CATALOG[appDef.code] ?? [];
      for (const key of permissionKeys) {
        await db.permissionCatalog.upsert({
          where: {
            appId_key: {
              appId: app.id,
              key,
            },
          },
          update: {
            isActive: true,
            label: key,
          },
          create: {
            appId: app.id,
            key,
            label: key,
            isActive: true,
          },
        });
      }
    }
  }

  private async resolveAppsByCodes(
    appCodes: AppCode[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<AppCode, { id: string; code: AppCode; name: string; baseUrl: string | null }>> {
    const db = tx ?? this.prisma;

    await this.ensureDefaultCatalog(db);

    const rows = await db.appRegistry.findMany({
      where: {
        code: {
          in: appCodes as unknown as string[],
        },
        isActive: true,
      },
      select: { id: true, code: true, name: true, baseUrl: true },
    });

    if (rows.length !== appCodes.length) {
      throw new BadRequestException('One or more apps are not available for invitation');
    }

    return new Map(rows.map((row) => [this.toAppCode(row.code as string), {
      id: row.id,
      code: this.toAppCode(row.code as string),
      name: row.name,
      baseUrl: row.baseUrl,
    }]));
  }

  private async getUserPermissionKeys(
    organizationId: string,
    userId: string,
    appId: string,
  ): Promise<Set<string>> {
    const assignments = await this.prisma.userAppRole.findMany({
      where: {
        organizationId,
        userId,
        appId,
      },
      include: {
        appRole: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { key: true },
                },
              },
            },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const p of assignment.appRole.permissions) {
        keys.add(p.permission.key);
      }
    }
    return keys;
  }

  private isOrgSuperAdmin(currentUser: JwtPayload): boolean {
    return currentUser.role === UserRole.OWNER || currentUser.role === UserRole.ADMIN;
  }

  private async assertCanManageApp(
    currentUser: JwtPayload,
    organizationId: string,
    appId: string,
  ): Promise<void> {
    if (this.isOrgSuperAdmin(currentUser)) {
      return;
    }

    const keys = await this.getUserPermissionKeys(organizationId, currentUser.sub, appId);
    const missing = INVITE_REQUIRED_KEYS.filter((required) => !keys.has(required));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permissions for app management: ${missing.join(', ')}`,
      );
    }
  }

  private normalizeBundles(bundles: InviteAppBundleDto[]): InviteAppBundleDto[] {
    if (!Array.isArray(bundles) || bundles.length === 0) {
      throw new BadRequestException('At least one app bundle is required');
    }

    const deduped = new Map<AppCode, InviteAppBundleDto>();
    for (const bundle of bundles) {
      deduped.set(bundle.appCode, bundle);
    }

    return [...deduped.values()];
  }

  private async assertRolesBelongToOrgApp(
    organizationId: string,
    appId: string,
    roleIds?: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!roleIds || roleIds.length === 0) return;

    const db = tx ?? this.prisma;
    const rows = await db.appRole.findMany({
      where: {
        id: { in: roleIds },
        organizationId,
        appId,
        isActive: true,
      },
      select: { id: true },
    });

    if (rows.length !== roleIds.length) {
      throw new BadRequestException('One or more roleIds are invalid for selected app');
    }
  }

  private serializeScopeValues(scopeValues?: Record<string, unknown>) {
    return scopeValues ? (scopeValues as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  private invitationToResponse(invitation: {
    id: string;
    email: string;
    role: string | null;
    status: string;
    expiresAt: Date;
    organizationId: string;
    invitedById: string;
    createdAt: Date;
    bundles: Array<{
      app: { code: string };
      roleIds: Prisma.JsonValue | null;
      scopeGrants: Prisma.JsonValue | null;
    }>;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      invitedById: invitation.invitedById,
      createdAt: invitation.createdAt,
      bundles: invitation.bundles.map((bundle) => ({
        appCode: bundle.app.code,
        roleIds: Array.isArray(bundle.roleIds) ? (bundle.roleIds as string[]) : [],
        scopeGrants: Array.isArray(bundle.scopeGrants)
          ? bundle.scopeGrants
          : [],
      })),
    };
  }

  async createInvitation(dto: CreateIamInvitationDto, currentUser: JwtPayload) {
    this.assertFeatureEnabled();

    const appBundles = this.normalizeBundles(dto.appBundles);
    const appMap = await this.resolveAppsByCodes(appBundles.map((b) => b.appCode));

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        organizationId: currentUser.orgId,
      },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('User is already a member of this organization');
    }

    const existingPending = await this.prisma.invitation.findFirst({
      where: {
        email: dto.email,
        organizationId: currentUser.orgId,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException('An invitation is already pending for this email');
    }

    for (const bundle of appBundles) {
      const app = appMap.get(bundle.appCode);
      if (!app) {
        throw new BadRequestException(`Unknown app bundle: ${bundle.appCode}`);
      }
      await this.assertCanManageApp(currentUser, currentUser.orgId, app.id);
      await this.assertRolesBelongToOrgApp(currentUser.orgId, app.id, bundle.roleIds);
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (dto.expiresInDays ?? 7));

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          email: dto.email,
          role: null,
          token,
          status: 'PENDING',
          expiresAt,
          organizationId: currentUser.orgId,
          invitedById: currentUser.sub,
        },
      });

      for (const bundle of appBundles) {
        const app = appMap.get(bundle.appCode)!;
        await tx.invitationBundle.create({
          data: {
            invitationId: created.id,
            appId: app.id,
            roleIds: (bundle.roleIds ?? []) as unknown as Prisma.InputJsonValue,
            scopeGrants: (bundle.scopeGrants ?? []) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return tx.invitation.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          bundles: {
            include: {
              app: { select: { code: true } },
            },
          },
        },
      });
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: currentUser.orgId },
      select: { name: true },
    });

    let emailDelivery: 'SENT' | 'FAILED' = 'SENT';
    let emailError: string | undefined;

    try {
      await this.mailService.sendMail({
        to: dto.email,
        subject: `You're Invited to ${organization?.name ?? 'Sentra'}`,
        template: 'INVITATION',
        context: {
          organizationName: organization?.name ?? 'Sentra',
          role: 'Multi-App Access',
          inviteLink: this.buildInviteLink(token),
        },
      });
    } catch (error) {
      emailDelivery = 'FAILED';
      emailError = error instanceof Error ? error.message : 'Email delivery failed';
    }

    return {
      ...this.invitationToResponse(invitation as never),
      inviteLink: this.buildInviteLink(token),
      emailDelivery,
      emailError,
    };
  }

  async listInvitations(currentUser: JwtPayload) {
    this.assertFeatureEnabled();

    const invitations = await this.prisma.invitation.findMany({
      where: {
        organizationId: currentUser.orgId,
      },
      include: {
        bundles: {
          include: {
            app: { select: { id: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (this.isOrgSuperAdmin(currentUser)) {
      return invitations.map((inv) => this.invitationToResponse(inv as never));
    }

    const manageableAppIds = new Set<string>();
    const appAssignments = await this.prisma.userAppRole.findMany({
      where: {
        organizationId: currentUser.orgId,
        userId: currentUser.sub,
      },
      select: { appId: true },
      distinct: ['appId'],
    });

    for (const assignment of appAssignments) {
      const keys = await this.getUserPermissionKeys(
        currentUser.orgId,
        currentUser.sub,
        assignment.appId,
      );
      const hasAllRequired = INVITE_REQUIRED_KEYS.every((required) => keys.has(required));
      if (hasAllRequired) {
        manageableAppIds.add(assignment.appId);
      }
    }

    const filtered = invitations.filter(
      (invitation) =>
        invitation.bundles.length > 0 &&
        invitation.bundles.every((bundle) => manageableAppIds.has(bundle.app.id)),
    );

    return filtered.map((inv) => this.invitationToResponse(inv as never));
  }

  private async assertCanManageInvitation(
    currentUser: JwtPayload,
    bundles: Array<{ app: { id: string } }>,
  ): Promise<void> {
    if (this.isOrgSuperAdmin(currentUser)) {
      return;
    }

    if (bundles.length === 0) {
      throw new ForbiddenException(
        'Cannot manage this invitation without organization admin permissions.',
      );
    }

    for (const bundle of bundles) {
      await this.assertCanManageApp(currentUser, currentUser.orgId, bundle.app.id);
    }
  }

  async resendInvitation(invitationId: string, currentUser: JwtPayload) {
    this.assertFeatureEnabled();

    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: currentUser.orgId,
      },
      include: {
        bundles: {
          include: {
            app: {
              select: { id: true, code: true },
            },
          },
        },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot resend. Invitation is ${invitation.status.toLowerCase()}`);
    }

    await this.assertCanManageInvitation(currentUser, invitation.bundles);

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        token,
        expiresAt,
      },
      include: {
        bundles: {
          include: {
            app: { select: { code: true } },
          },
        },
      },
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: currentUser.orgId },
      select: { name: true },
    });

    let emailDelivery: 'SENT' | 'FAILED' = 'SENT';
    let emailError: string | undefined;

    try {
      await this.mailService.sendMail({
        to: updated.email,
        subject: `Invitation Reminder - ${organization?.name ?? 'Sentra'}`,
        template: 'INVITATION',
        context: {
          organizationName: organization?.name ?? 'Sentra',
          role: 'Multi-App Access',
          inviteLink: this.buildInviteLink(token),
        },
      });
    } catch (error) {
      emailDelivery = 'FAILED';
      emailError = error instanceof Error ? error.message : 'Email delivery failed';
    }

    return {
      ...this.invitationToResponse(updated as never),
      inviteLink: this.buildInviteLink(token),
      emailDelivery,
      emailError,
    };
  }

  async cancelInvitation(invitationId: string, currentUser: JwtPayload) {
    this.assertFeatureEnabled();

    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: currentUser.orgId,
      },
      include: {
        bundles: {
          include: {
            app: { select: { id: true } },
          },
        },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot cancel. Invitation is ${invitation.status.toLowerCase()}`);
    }

    await this.assertCanManageInvitation(currentUser, invitation.bundles);

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Invitation cancelled successfully' };
  }

  private async setUserEntitlementsForBundle(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    appId: string,
    roleIds: string[] | undefined,
    scopeGrants: InviteAppBundleDto['scopeGrants'] | undefined,
    isDefault: boolean,
  ): Promise<void> {
    await tx.userAppAccess.upsert({
      where: {
        organizationId_userId_appId: {
          organizationId,
          userId,
          appId,
        },
      },
      update: {
        isEnabled: true,
        isDefault,
      },
      create: {
        organizationId,
        userId,
        appId,
        isEnabled: true,
        isDefault,
      },
    });

    if (roleIds && roleIds.length > 0) {
      await tx.userAppRole.deleteMany({
        where: {
          organizationId,
          userId,
          appId,
        },
      });

      await tx.userAppRole.createMany({
        data: roleIds.map((roleId, index) => ({
          organizationId,
          userId,
          appId,
          appRoleId: roleId,
          isPrimary: index === 0,
        })),
        skipDuplicates: true,
      });
    }

    if (scopeGrants) {
      await tx.userScopeGrant.deleteMany({
        where: {
          organizationId,
          userId,
          appId,
        },
      });

      if (scopeGrants.length > 0) {
        await tx.userScopeGrant.createMany({
          data: scopeGrants.map((scope) => ({
            organizationId,
            userId,
            appId,
            resourceKey: scope.resourceKey,
            scopeType: scope.scopeType as unknown as DataScopeType,
            scopeValues: this.serializeScopeValues(scope.scopeValues),
          })),
        });
      }
    }
  }

  async updateUserEntitlements(
    userId: string,
    dto: UpdateUserEntitlementsDto,
    currentUser: JwtPayload,
  ) {
    this.assertFeatureEnabled();

    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: currentUser.orgId,
      },
      select: { id: true },
    });
    if (!targetUser) throw new NotFoundException('User not found in organization');

    const appBundles = this.normalizeBundles(dto.appBundles);
    const appMap = await this.resolveAppsByCodes(appBundles.map((b) => b.appCode));

    for (const bundle of appBundles) {
      const app = appMap.get(bundle.appCode)!;
      await this.assertCanManageApp(currentUser, currentUser.orgId, app.id);
      await this.assertRolesBelongToOrgApp(currentUser.orgId, app.id, bundle.roleIds);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const bundle of appBundles) {
        const app = appMap.get(bundle.appCode)!;
        const isDefault = dto.defaultAppCode === bundle.appCode;

        await this.setUserEntitlementsForBundle(
          tx,
          currentUser.orgId,
          userId,
          app.id,
          bundle.roleIds,
          bundle.scopeGrants,
          isDefault,
        );
      }
    });

    return this.getUserAppAccess(currentUser.orgId, userId);
  }

  async getUserAppAccess(organizationId: string, userId: string) {
    if (!this.isFeatureEnabled()) {
      return [];
    }

    const rows = await this.prisma.userAppAccess.findMany({
      where: {
        organizationId,
        userId,
        isEnabled: true,
      },
      include: {
        app: {
          select: {
            code: true,
            name: true,
            baseUrl: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => ({
      appCode: row.app.code,
      appName: row.app.name,
      baseUrl: row.app.baseUrl,
      isDefault: row.isDefault,
    }));
  }

  async bootstrapOwnerEntitlements(organizationId: string, userId: string): Promise<void> {
    if (!this.isFeatureEnabled()) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ensureDefaultCatalog(tx);

      const appRows = await tx.appRegistry.findMany({
        where: {
          code: {
            in: [AppCode.SALES_DASHBOARD, AppCode.PM_DASHBOARD] as unknown as string[],
          },
        },
        select: { id: true, code: true },
      });
      const appIdByCode = new Map(appRows.map((row) => [this.toAppCode(row.code as string), row.id]));

      const ensureRoleWithAllPermissions = async (appCode: AppCode, slug: string, name: string) => {
        const appId = appIdByCode.get(appCode);
        if (!appId) throw new BadRequestException(`App catalog not found: ${appCode}`);

        const role = await tx.appRole.upsert({
          where: {
            organizationId_appId_slug: {
              organizationId,
              appId,
              slug,
            },
          },
          update: {
            name,
            isSystem: true,
            isActive: true,
          },
          create: {
            organizationId,
            appId,
            name,
            slug,
            isSystem: true,
            isActive: true,
            createdById: userId,
          },
        });

        const permissionKeys = DEFAULT_PERMISSION_CATALOG[appCode] ?? [];
        const permissionRows = await tx.permissionCatalog.findMany({
          where: {
            appId,
            key: {
              in: permissionKeys,
            },
          },
          select: { id: true },
        });

        await tx.appRolePermission.deleteMany({ where: { appRoleId: role.id } });
        if (permissionRows.length > 0) {
          await tx.appRolePermission.createMany({
            data: permissionRows.map((permission) => ({
              appRoleId: role.id,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          });
        }

        return { roleId: role.id, appId };
      };

      const salesAdmin = await ensureRoleWithAllPermissions(
        AppCode.SALES_DASHBOARD,
        'sales_admin',
        'Sales Admin',
      );
      const pmAdmin = await ensureRoleWithAllPermissions(
        AppCode.PM_DASHBOARD,
        'pm_admin',
        'PM Admin',
      );

      await this.setUserEntitlementsForBundle(
        tx,
        organizationId,
        userId,
        salesAdmin.appId,
        [salesAdmin.roleId],
        [],
        true,
      );
      await this.setUserEntitlementsForBundle(
        tx,
        organizationId,
        userId,
        pmAdmin.appId,
        [pmAdmin.roleId],
        [],
        false,
      );
    });
  }

  async applyInvitationBundlesToUser(
    organizationId: string,
    userId: string,
    bundles: Array<{
      app: { id: string; code: string };
      roleIds: Prisma.JsonValue | null;
      scopeGrants: Prisma.JsonValue | null;
    }>,
  ): Promise<void> {
    if (!this.isFeatureEnabled() || !bundles || bundles.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const bundle of bundles) {
        const roleIds = Array.isArray(bundle.roleIds)
          ? (bundle.roleIds as string[])
          : [];
        const scopeGrants = Array.isArray(bundle.scopeGrants)
          ? (bundle.scopeGrants as InviteAppBundleDto['scopeGrants'])
          : [];

        await this.setUserEntitlementsForBundle(
          tx,
          organizationId,
          userId,
          bundle.app.id,
          roleIds,
          scopeGrants,
          false,
        );
      }
    });
  }

  async getDefaultLegacyBundles(orgId: string, role: UserRole) {
    if (!this.isFeatureEnabled()) {
      return [];
    }

    await this.ensureDefaultCatalog();

    const appRows = await this.prisma.appRegistry.findMany({
      where: {
        code: {
          in: [AppCode.SALES_DASHBOARD, AppCode.PM_DASHBOARD] as unknown as string[],
        },
      },
      select: { id: true, code: true },
    });
    const appByCode = new Map(appRows.map((row) => [this.toAppCode(row.code as string), row.id]));

    const roleSlugByLegacyRole: Partial<Record<UserRole, { appCode: AppCode; slug: string }>> = {
      [UserRole.OWNER]: { appCode: AppCode.SALES_DASHBOARD, slug: 'sales_admin' },
      [UserRole.ADMIN]: { appCode: AppCode.SALES_DASHBOARD, slug: 'sales_admin' },
      [UserRole.SALES_MANAGER]: { appCode: AppCode.SALES_DASHBOARD, slug: 'sales_manager' },
      [UserRole.FRONTSELL_AGENT]: { appCode: AppCode.SALES_DASHBOARD, slug: 'frontsell_agent' },
      [UserRole.UPSELL_AGENT]: { appCode: AppCode.SALES_DASHBOARD, slug: 'upsell_agent' },
      [UserRole.PROJECT_MANAGER]: { appCode: AppCode.PM_DASHBOARD, slug: 'pm_lead' },
    };

    const target = roleSlugByLegacyRole[role];
    if (!target) return [];

    const appId = appByCode.get(target.appCode);
    if (!appId) return [];

    const appRole = await this.prisma.appRole.findFirst({
      where: {
        organizationId: orgId,
        appId,
        slug: target.slug,
        isActive: true,
      },
      select: { id: true },
    });

    return [
      {
        appId,
        roleIds: appRole ? [appRole.id] : [],
        scopeGrants: [],
      },
    ];
  }
}
