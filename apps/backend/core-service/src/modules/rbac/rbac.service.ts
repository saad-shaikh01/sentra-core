import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppCode as PrismaAppCode, PrismaService } from '@sentra-core/prisma-client';
import { JwtPayload } from '@sentra-core/types';
import {
  CreateAppRoleDto,
  ReplaceAppRolePermissionsDto,
  UpdateAppRoleDto,
} from './dto';

type TicketAppCode = 'SALES' | 'PM' | 'HRMS' | 'ADMIN' | 'COMM';

type ResolvedApp = {
  appId: string;
  internalCode: PrismaAppCode;
  publicCode: TicketAppCode;
};

type RoleWithPermissions = Awaited<ReturnType<RbacService['findRoleForApp']>>;

const APP_CODE_ALIASES: Record<string, { internalCode: PrismaAppCode; publicCode: TicketAppCode }> = {
  SALES: { internalCode: PrismaAppCode.SALES_DASHBOARD, publicCode: 'SALES' },
  SALES_DASHBOARD: { internalCode: PrismaAppCode.SALES_DASHBOARD, publicCode: 'SALES' },
  PM: { internalCode: PrismaAppCode.PM_DASHBOARD, publicCode: 'PM' },
  PM_DASHBOARD: { internalCode: PrismaAppCode.PM_DASHBOARD, publicCode: 'PM' },
  HRMS: { internalCode: PrismaAppCode.HRMS, publicCode: 'HRMS' },
  ADMIN: { internalCode: PrismaAppCode.CLIENT_PORTAL, publicCode: 'ADMIN' },
  CLIENT_PORTAL: { internalCode: PrismaAppCode.CLIENT_PORTAL, publicCode: 'ADMIN' },
  COMM: { internalCode: PrismaAppCode.COMM_SERVICE, publicCode: 'COMM' },
  COMM_SERVICE: { internalCode: PrismaAppCode.COMM_SERVICE, publicCode: 'COMM' },
};

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(appCode: string, currentUser: JwtPayload) {
    const resolvedApp = await this.resolveApp(appCode);
    const roles = await this.prisma.appRole.findMany({
      where: {
        appId: resolvedApp.appId,
        isActive: true,
        OR: [{ organizationId: currentUser.orgId }, { organizationId: null, isSystem: true }],
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: { id: true, key: true, label: true, description: true },
            },
          },
        },
        _count: { select: { users: true } },
      },
    });

    return this.sortRoles(roles).map((role) => this.toRoleResponse(role, resolvedApp.publicCode));
  }

  async createRole(appCode: string, dto: CreateAppRoleDto, currentUser: JwtPayload) {
    const resolvedApp = await this.resolveApp(appCode);
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.appRole.findFirst({
      where: {
        appId: resolvedApp.appId,
        organizationId: currentUser.orgId,
        slug,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Role slug already exists for this app');
    }

    const role = await this.prisma.appRole.create({
      data: {
        organizationId: currentUser.orgId,
        appId: resolvedApp.appId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() ?? null,
        isSystem: false,
        isActive: true,
        createdById: currentUser.sub,
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: { id: true, key: true, label: true, description: true },
            },
          },
        },
        _count: { select: { users: true } },
      },
    });

    return this.toRoleResponse(role, resolvedApp.publicCode);
  }

  async updateRole(appCode: string, roleId: string, dto: UpdateAppRoleDto, currentUser: JwtPayload) {
    const resolvedApp = await this.resolveApp(appCode);
    const role = await this.findRoleForApp(roleId, resolvedApp.appId, currentUser.orgId);
    this.assertCustomOrgRole(role, currentUser.orgId);

    const updated = await this.prisma.appRole.update({
      where: { id: role.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: { id: true, key: true, label: true, description: true },
            },
          },
        },
        _count: { select: { users: true } },
      },
    });

    return this.toRoleResponse(updated, resolvedApp.publicCode);
  }

  async deleteRole(appCode: string, roleId: string, currentUser: JwtPayload) {
    const resolvedApp = await this.resolveApp(appCode);
    const role = await this.findRoleForApp(roleId, resolvedApp.appId, currentUser.orgId);
    this.assertCustomOrgRole(role, currentUser.orgId);

    const assignmentCount = await this.prisma.userAppRole.count({
      where: {
        appRoleId: role.id,
      },
    });

    if (assignmentCount > 0) {
      throw new ConflictException('Role is assigned to users and cannot be deleted');
    }

    await this.prisma.appRole.delete({
      where: { id: role.id },
    });

    return { message: 'Role deleted successfully' };
  }

  async listPermissions(appCode: string) {
    const resolvedApp = await this.resolveApp(appCode);
    const permissions = await this.prisma.permissionCatalog.findMany({
      where: {
        appId: resolvedApp.appId,
        isActive: true,
      },
      orderBy: [{ key: 'asc' }],
      select: {
        id: true,
        key: true,
        label: true,
        description: true,
      },
    });

    return permissions.map((permission) => ({
      id: permission.id,
      appCode: resolvedApp.publicCode,
      code: permission.key,
      label: permission.label,
      description: permission.description,
    }));
  }

  async replaceRolePermissions(
    appCode: string,
    roleId: string,
    dto: ReplaceAppRolePermissionsDto,
    currentUser: JwtPayload,
  ) {
    const resolvedApp = await this.resolveApp(appCode);
    const role = await this.findRoleForApp(roleId, resolvedApp.appId, currentUser.orgId);
    this.assertPermissionsEditable(role, currentUser.orgId);

    const permissionIds = [...new Set(dto.permissionIds)];
    const permissionRows = await this.prisma.permissionCatalog.findMany({
      where: {
        id: { in: permissionIds },
        appId: resolvedApp.appId,
        isActive: true,
      },
      select: { id: true },
    });

    if (permissionRows.length !== permissionIds.length) {
      throw new BadRequestException('Permission appCode must match role appCode');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.appRolePermission.deleteMany({
        where: { appRoleId: role.id },
      });

      if (permissionRows.length > 0) {
        await tx.appRolePermission.createMany({
          data: permissionRows.map((permission) => ({
            appRoleId: role.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getRolePermissions(appCode, roleId, currentUser);
  }

  async getRolePermissions(appCode: string, roleId: string, currentUser: JwtPayload) {
    const resolvedApp = await this.resolveApp(appCode);
    const role = await this.findRoleForApp(roleId, resolvedApp.appId, currentUser.orgId);

    return role.permissions
      .map((link) => ({
        id: link.permission.id,
        appCode: resolvedApp.publicCode,
        code: link.permission.key,
        label: link.permission.label,
        description: link.permission.description,
      }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  private async resolveApp(appCode: string): Promise<ResolvedApp> {
    const normalized = APP_CODE_ALIASES[appCode?.trim().toUpperCase()];
    if (!normalized) {
      throw new BadRequestException('Unknown appCode');
    }

    const app = await this.prisma.appRegistry.findFirst({
      where: {
        code: normalized.internalCode,
        isActive: true,
      },
      select: { id: true },
    });

    if (!app) {
      throw new NotFoundException('Application is not configured');
    }

    return {
      appId: app.id,
      internalCode: normalized.internalCode,
      publicCode: normalized.publicCode,
    };
  }

  private async findRoleForApp(roleId: string, appId: string, organizationId: string) {
    const role = await this.prisma.appRole.findFirst({
      where: {
        id: roleId,
        appId,
        isActive: true,
        OR: [{ organizationId }, { organizationId: null, isSystem: true }],
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: { id: true, key: true, label: true, description: true },
            },
          },
        },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private assertCustomOrgRole(role: NonNullable<RoleWithPermissions>, organizationId: string) {
    if (role.isSystem || role.organizationId === null) {
      throw new ForbiddenException('System roles cannot be modified');
    }

    if (role.organizationId !== organizationId) {
      throw new ForbiddenException('Role does not belong to this organization');
    }
  }

  private assertPermissionsEditable(role: NonNullable<RoleWithPermissions>, organizationId: string) {
    // System roles: permissions can be edited (global effect — no per-org scoping on AppRolePermission)
    // Custom roles: must belong to the requesting org
    if (!role.isSystem && role.organizationId !== organizationId) {
      throw new ForbiddenException('Role does not belong to this organization');
    }
  }

  private sortRoles<T extends { isSystem: boolean; name: string; slug: string }>(roles: T[]): T[] {
    return [...roles].sort((left, right) => {
      if (left.isSystem !== right.isSystem) {
        return left.isSystem ? -1 : 1;
      }

      return left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug);
    });
  }

  private toRoleResponse(
    role: NonNullable<RoleWithPermissions>,
    appCode: TicketAppCode,
  ) {
    return {
      id: role.id,
      organizationId: role.organizationId,
      appCode,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count?.users ?? 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions
        .map((link) => ({
          id: link.permission.id,
          code: link.permission.key,
          label: link.permission.label,
          description: link.permission.description,
        }))
        .sort((left, right) => left.code.localeCompare(right.code)),
    };
  }
}
