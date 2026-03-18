import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppCode, PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { HrmsCacheService } from '../../common';

const APP_CODE_ALIASES: Record<string, AppCode> = {
  SALES: AppCode.SALES_DASHBOARD,
  SALES_DASHBOARD: AppCode.SALES_DASHBOARD,
  PM: AppCode.PM_DASHBOARD,
  PM_DASHBOARD: AppCode.PM_DASHBOARD,
  HRMS: AppCode.HRMS,
  ADMIN: AppCode.CLIENT_PORTAL,
  CLIENT_PORTAL: AppCode.CLIENT_PORTAL,
  COMM: AppCode.COMM_SERVICE,
  COMM_SERVICE: AppCode.COMM_SERVICE,
};

const APP_CODE_LABELS: Record<AppCode, string> = {
  [AppCode.SALES_DASHBOARD]: 'SALES',
  [AppCode.PM_DASHBOARD]: 'PM',
  [AppCode.HRMS]: 'HRMS',
  [AppCode.CLIENT_PORTAL]: 'ADMIN',
  [AppCode.COMM_SERVICE]: 'COMM',
};

type AccessAppRecord = {
  id: string;
  code: AppCode;
  name: string;
};

type EmployeeRecord = {
  id: string;
  status: UserStatus;
};

@Injectable()
export class AccessManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: HrmsCacheService,
  ) {}

  async getAccessSummary(userId: string, organizationId: string) {
    await this.findEmployee(userId, organizationId);

    const [accessRows, roleAssignments] = await Promise.all([
      this.prisma.userAppAccess.findMany({
        where: {
          organizationId,
          userId,
          isEnabled: true,
        },
        include: {
          app: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userAppRole.findMany({
        where: {
          organizationId,
          userId,
        },
        include: {
          appRole: {
            include: {
              permissions: {
                include: {
                  permission: {
                    select: {
                      key: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ assignedAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const grantorIds = [...new Set(accessRows.map((access) => access.grantedBy).filter(Boolean))];
    const grantors = grantorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: grantorIds },
          },
          select: {
            id: true,
            email: true,
          },
        })
      : [];
    const grantorEmailById = new Map(grantors.map((grantor) => [grantor.id, grantor.email]));

    const rolesByAppId = new Map<
      string,
      Array<{
        userAppRoleId: string;
        roleId: string;
        roleName: string;
        roleSlug: string;
        isSystem: boolean;
        assignedAt: string;
      }>
    >();
    const permissionKeysByAppId = new Map<string, Set<string>>();

    for (const assignment of roleAssignments) {
      const appId = assignment.appId;
      const currentRoles = rolesByAppId.get(appId) ?? [];
      currentRoles.push({
        userAppRoleId: assignment.id,
        roleId: assignment.appRoleId,
        roleName: assignment.appRole.name,
        roleSlug: assignment.appRole.slug,
        isSystem: assignment.appRole.isSystem,
        assignedAt: assignment.assignedAt.toISOString(),
      });
      rolesByAppId.set(appId, currentRoles);

      const permissionKeys = permissionKeysByAppId.get(appId) ?? new Set<string>();
      for (const permission of assignment.appRole.permissions) {
        permissionKeys.add(permission.permission.key);
      }
      permissionKeysByAppId.set(appId, permissionKeys);
    }

    return {
      userId,
      apps: accessRows.map((access) => ({
        appCode: this.formatAppCode(access.app.code),
        appLabel: access.app.name,
        grantedAt: access.updatedAt.toISOString(),
        grantedBy: access.grantedBy
          ? (grantorEmailById.get(access.grantedBy) ?? access.grantedBy)
          : null,
        roles: rolesByAppId.get(access.appId) ?? [],
        effectivePermissionCount: permissionKeysByAppId.get(access.appId)?.size ?? 0,
      })),
    };
  }

  async grantAccess(
    userId: string,
    appCode: string,
    organizationId: string,
    adminId: string,
  ) {
    const [employee, app] = await Promise.all([
      this.findEmployee(userId, organizationId),
      this.resolveApp(appCode),
    ]);

    if (employee.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('Cannot grant access to a deactivated user');
    }

    const [existingAccess, enabledAccessCount] = await Promise.all([
      this.prisma.userAppAccess.findUnique({
        where: {
          organizationId_userId_appId: {
            organizationId,
            userId,
            appId: app.id,
          },
        },
        select: {
          id: true,
          isDefault: true,
        },
      }),
      this.prisma.userAppAccess.count({
        where: {
          organizationId,
          userId,
          isEnabled: true,
        },
      }),
    ]);

    const shouldBeDefault = existingAccess?.isDefault ?? enabledAccessCount === 0;
    const access = await this.prisma.userAppAccess.upsert({
      where: {
        organizationId_userId_appId: {
          organizationId,
          userId,
          appId: app.id,
        },
      },
      update: {
        isEnabled: true,
        isDefault: shouldBeDefault,
        grantedBy: adminId,
        revokedAt: null,
        revokedBy: null,
      },
      create: {
        organizationId,
        userId,
        appId: app.id,
        isEnabled: true,
        isDefault: shouldBeDefault,
        grantedBy: adminId,
      },
      include: {
        app: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    await this.invalidatePermissionsCache(userId, organizationId);

    return {
      message: `Access to ${this.formatAppCode(access.app.code)} granted`,
      access: {
        id: access.id,
        appCode: this.formatAppCode(access.app.code),
        appLabel: access.app.name,
        isDefault: access.isDefault,
        isEnabled: access.isEnabled,
        grantedAt: access.updatedAt.toISOString(),
      },
    };
  }

  async revokeAccess(
    userId: string,
    appCode: string,
    organizationId: string,
    adminId: string,
  ) {
    await this.findEmployee(userId, organizationId);
    const app = await this.resolveApp(appCode);

    const [access, roles] = await Promise.all([
      this.prisma.userAppAccess.findUnique({
        where: {
          organizationId_userId_appId: {
            organizationId,
            userId,
            appId: app.id,
          },
        },
        select: {
          id: true,
          isEnabled: true,
          isDefault: true,
        },
      }),
      this.prisma.userAppRole.findMany({
        where: {
          organizationId,
          userId,
          appId: app.id,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!access?.isEnabled) {
      throw new NotFoundException('User does not have access to this app');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userAppAccess.updateMany({
        where: {
          organizationId,
          userId,
          appId: app.id,
        },
        data: {
          isEnabled: false,
          isDefault: false,
          revokedAt: new Date(),
          revokedBy: adminId,
        },
      });

      await tx.userAppRole.deleteMany({
        where: {
          organizationId,
          userId,
          appId: app.id,
        },
      });

      if (access.isDefault) {
        const replacementAccess = await tx.userAppAccess.findFirst({
          where: {
            organizationId,
            userId,
            appId: {
              not: app.id,
            },
            isEnabled: true,
          },
          orderBy: [{ createdAt: 'asc' }],
          select: {
            id: true,
          },
        });

        if (replacementAccess) {
          await tx.userAppAccess.update({
            where: {
              id: replacementAccess.id,
            },
            data: {
              isDefault: true,
            },
          });
        }
      }
    });

    await this.invalidatePermissionsCache(userId, organizationId);

    return {
      message: `Access to ${this.formatAppCode(app.code)} revoked`,
      appCode: this.formatAppCode(app.code),
      rolesRemoved: roles.length,
    };
  }

  async assignRole(
    userId: string,
    appRoleId: string,
    organizationId: string,
    adminId: string,
  ) {
    await this.findEmployee(userId, organizationId);

    const role = await this.prisma.appRole.findUnique({
      where: {
        id: appRoleId,
      },
      include: {
        app: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!role || !role.isActive) {
      throw new NotFoundException('Role not found');
    }

    if (role.organizationId && role.organizationId !== organizationId) {
      throw new ForbiddenException('This role does not belong to your organization');
    }

    const access = await this.prisma.userAppAccess.findUnique({
      where: {
        organizationId_userId_appId: {
          organizationId,
          userId,
          appId: role.appId,
        },
      },
      select: {
        id: true,
        isEnabled: true,
      },
    });

    if (!access?.isEnabled) {
      throw new BadRequestException(
        `Grant ${this.formatAppCode(role.app.code)} app access to this user before assigning roles.`,
      );
    }

    const assignment = await this.prisma.userAppRole.upsert({
      where: {
        organizationId_userId_appId_appRoleId: {
          organizationId,
          userId,
          appId: role.appId,
          appRoleId,
        },
      },
      update: {
        assignedAt: new Date(),
        assignedBy: adminId,
      },
      create: {
        organizationId,
        userId,
        appId: role.appId,
        appRoleId,
        assignedBy: adminId,
      },
      include: {
        appRole: {
          select: {
            id: true,
            name: true,
            slug: true,
            isSystem: true,
          },
        },
        app: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    await this.invalidatePermissionsCache(userId, organizationId);

    return {
      message: `Role "${assignment.appRole.name}" assigned`,
      userRole: {
        id: assignment.id,
        appCode: this.formatAppCode(assignment.app.code),
        appLabel: assignment.app.name,
        roleId: assignment.appRole.id,
        roleName: assignment.appRole.name,
        roleSlug: assignment.appRole.slug,
        isSystem: assignment.appRole.isSystem,
        assignedAt: assignment.assignedAt.toISOString(),
      },
    };
  }

  async removeRole(
    userId: string,
    userAppRoleId: string,
    organizationId: string,
    _adminId: string,
  ) {
    const assignment = await this.prisma.userAppRole.findFirst({
      where: {
        id: userAppRoleId,
        userId,
        organizationId,
      },
      include: {
        app: {
          select: {
            code: true,
          },
        },
        appRole: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.userAppRole.delete({
      where: {
        id: userAppRoleId,
      },
    });

    await this.invalidatePermissionsCache(userId, organizationId);

    return {
      message: `Role "${assignment.appRole.name}" removed`,
      userAppRoleId,
      appCode: this.formatAppCode(assignment.app.code),
      roleId: assignment.appRole.id,
      roleName: assignment.appRole.name,
      roleSlug: assignment.appRole.slug,
    };
  }

  private async findEmployee(userId: string, organizationId: string): Promise<EmployeeRecord> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    return user;
  }

  private async resolveApp(appCode: string): Promise<AccessAppRecord> {
    const normalizedCode = this.normalizeAppCode(appCode);
    const app = await this.prisma.appRegistry.findFirst({
      where: {
        code: normalizedCode,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!app) {
      throw new NotFoundException(`Application not found: ${appCode}`);
    }

    return app;
  }

  private normalizeAppCode(value: string): AppCode {
    const normalized = value.trim().toUpperCase();
    const appCode = APP_CODE_ALIASES[normalized];
    if (!appCode) {
      throw new BadRequestException(`Invalid app code: ${value}`);
    }

    return appCode;
  }

  private formatAppCode(appCode: AppCode): string {
    return APP_CODE_LABELS[appCode];
  }

  private async invalidatePermissionsCache(userId: string, organizationId: string): Promise<void> {
    await this.cacheService.del(`perms:${userId}:${organizationId}`);
  }
}
