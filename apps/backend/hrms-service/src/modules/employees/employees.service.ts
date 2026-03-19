import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppCode, Prisma, PrismaService, UserStatus } from '@sentra-core/prisma-client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { HrmsCacheService } from '../../common';
import {
  CreateEmployeeDto,
  EmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto';

type EmployeeRecord = Prisma.UserGetPayload<{
  include: {
    department: {
      select: {
        id: true;
        name: true;
      };
    };
    appAccesses: {
      include: {
        app: {
          select: {
            code: true;
            name: true;
          };
        };
      };
    };
    appRoles: {
      include: {
        app: {
          select: {
            code: true;
          };
        };
        appRole: {
          select: {
            name: true;
            slug: true;
          };
        };
      };
    };
  };
}>;

export interface EmployeeView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  appAccess: Array<{ appCode: string; appLabel: string }>;
  roles: Array<{ appCode: string; roleName: string; roleSlug: string }>;
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
  updatedAt: string;
}

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

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: HrmsCacheService,
  ) {}

  async findAll(
    organizationId: string,
    query: EmployeesQueryDto,
  ): Promise<{ data: EmployeeView[]; meta: { total: number; page: number; limit: number; pages: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const normalizedAppCode = query.appCode
      ? this.normalizeAppCode(query.appCode)
      : undefined;

    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(normalizedAppCode
        ? {
            appAccesses: {
              some: {
                isEnabled: true,
                revokedAt: null,
                app: { code: normalizedAppCode },
              },
            },
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { name: 'asc' }],
        include: this.employeeInclude,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.mapEmployee(user)),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, organizationId: string): Promise<EmployeeView> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: this.employeeInclude,
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    return this.mapEmployee(user);
  }

  async create(
    organizationId: string,
    dto: CreateEmployeeDto,
    _createdBy: string,
  ): Promise<EmployeeView> {
    const existingInOrg = await this.prisma.user.findFirst({
      where: {
        organizationId,
        email: dto.email,
      },
      select: { id: true },
    });

    if (existingInOrg) {
      throw new ConflictException('A user with this email already exists in your organization');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId,
          email: dto.email,
          name: this.composeFullName(dto.firstName, dto.lastName),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone,
          jobTitle: dto.jobTitle,
          departmentId: dto.departmentId,
          status: UserStatus.INVITED,
          password: await bcrypt.hash(randomUUID(), 12),
        },
        include: this.employeeInclude,
      });

      return this.mapEmployee(user);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeView> {
    const existing = await this.findEmployeeRecord(id, organizationId);
    const fallbackName = this.splitName(existing.name);
    const firstName = dto.firstName?.trim() ?? existing.firstName ?? fallbackName.firstName;
    const lastName = dto.lastName?.trim() ?? existing.lastName ?? fallbackName.lastName;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined || dto.lastName !== undefined
          ? {
              firstName,
              lastName,
              name: this.composeFullName(firstName, lastName),
            }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      include: this.employeeInclude,
    });

    return this.mapEmployee(user);
  }

  async suspend(
    userId: string,
    adminId: string,
    organizationId: string,
    reason: string,
  ): Promise<{ message: string; revokedSessions: number }> {
    const user = await this.findEmployeeRecord(userId, organizationId);
    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User already suspended');
    }
    if (user.id === adminId) {
      throw new BadRequestException('Cannot suspend yourself');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy: adminId,
        suspendReason: reason,
      },
    });

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_SUSPENDED' },
    });

    await this.cacheService.set(`suspended:${userId}`, '1', 900_000);

    return {
      message: 'User suspended and all sessions revoked',
      revokedSessions: revoked.count,
    };
  }

  async unsuspend(
    userId: string,
    _adminId: string,
    organizationId: string,
  ): Promise<{ message: string }> {
    const user = await this.findEmployeeRecord(userId, organizationId);
    if (user.status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('User is not suspended');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        suspendedAt: null,
        suspendedBy: null,
        suspendReason: null,
      },
    });

    await this.cacheService.del(`suspended:${userId}`);

    return { message: 'User unsuspended' };
  }

  async deactivate(
    userId: string,
    organizationId: string,
    adminId: string,
  ): Promise<{ message: string; revokedSessions: number }> {
    const user = await this.findEmployeeRecord(userId, organizationId);
    if (user.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('User already deactivated');
    }
    if (user.id === adminId) {
      throw new BadRequestException('Cannot deactivate yourself');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DEACTIVATED,
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: adminId,
      },
    });

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_DEACTIVATED' },
    });

    await this.cacheService.set(`suspended:${userId}`, '1', 900_000);

    return {
      message: 'User deactivated and all sessions revoked',
      revokedSessions: revoked.count,
    };
  }

  async reactivate(
    userId: string,
    organizationId: string,
    adminId: string,
  ): Promise<{ message: string }> {
    const user = await this.findEmployeeRecord(userId, organizationId);
    if (user.status !== UserStatus.DEACTIVATED) {
      throw new BadRequestException('User is not deactivated');
    }
    if (user.id === adminId) {
      throw new BadRequestException('Cannot reactivate yourself');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null,
      },
    });

    await this.cacheService.del(`suspended:${userId}`);

    return { message: 'User reactivated successfully' };
  }

  private async findEmployeeRecord(
    id: string,
    organizationId: string,
  ): Promise<EmployeeRecord> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: this.employeeInclude,
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    return user;
  }

  private mapEmployee(user: EmployeeRecord): EmployeeView {
    const fallbackName = this.splitName(user.name);
    const firstName = user.firstName?.trim() || fallbackName.firstName;
    const lastName = user.lastName?.trim() || fallbackName.lastName;

    return {
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      fullName: user.name,
      phone: user.phone ?? null,
      jobTitle: user.jobTitle ?? null,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      departmentId: user.departmentId ?? null,
      department: user.department
        ? {
            id: user.department.id,
            name: user.department.name,
          }
        : null,
      appAccess: user.appAccesses
        .filter((access) => access.isEnabled)
        .map((access) => ({
          appCode: access.app.code,
          appLabel: access.app.name,
        })),
      roles: user.appRoles.map((assignment) => ({
        appCode: assignment.app.code,
        roleName: assignment.appRole.name,
        roleSlug: assignment.appRole.slug,
      })),
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      suspendReason: user.suspendReason ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const trimmed = name.trim();
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }

    const parts = trimmed.split(/\s+/);
    return {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' '),
    };
  }

  private composeFullName(firstName: string, lastName: string): string {
    return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  }

  private normalizeAppCode(value: string): AppCode {
    const normalized = value.trim().toUpperCase();
    const appCode = APP_CODE_ALIASES[normalized];
    if (!appCode) {
      throw new BadRequestException(`Unknown app code: ${value}`);
    }

    return appCode;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private readonly employeeInclude = {
    department: {
      select: {
        id: true,
        name: true,
      },
    },
    appAccesses: {
      where: {
        isEnabled: true,
        revokedAt: null,
      },
      include: {
        app: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    },
    appRoles: {
      include: {
        app: {
          select: {
            code: true,
          },
        },
        appRole: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    },
  } satisfies Prisma.UserInclude;
}
