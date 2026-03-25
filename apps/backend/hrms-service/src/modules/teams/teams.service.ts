import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  Prisma,
  PrismaService,
  TeamMemberRole,
  UserStatus,
} from '@sentra-core/prisma-client';
import {
  AddTeamMemberDto,
  CreateTeamDto,
  TeamsQueryDto,
  UpdateTeamDto,
} from './dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async findAll(organizationId: string, query: TeamsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.TeamWhereInput = {
      organizationId,
      ...(query.typeId ? { typeId: query.typeId } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(query.isActive === false
        ? { isActive: false }
        : { isActive: true, deletedAt: null }),
    };

    const [teams, total] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        skip,
        take: limit,
        include: this.teamListInclude,
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.team.count({ where }),
    ]);

    return {
      data: teams.map((team) => this.mapTeamSummary(team)),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, organizationId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: this.teamDetailInclude,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return this.mapTeamDetail(team);
  }

  async create(organizationId: string, dto: CreateTeamDto, _actorUserId: string) {
    const name = dto.name.trim();
    await this.assertUniqueTeamName(organizationId, name);
    await this.assertTeamTypeAllowed(dto.typeId, organizationId);
    await this.assertManager(dto.managerId, organizationId);

    const team = await this.prisma.team.create({
      data: {
        organizationId,
        name,
        typeId: dto.typeId,
        description: dto.description?.trim() || null,
        managerId: dto.managerId ?? null,
        ...(dto.leadVisibilityMode !== undefined ? { leadVisibilityMode: dto.leadVisibilityMode } : {}),
        ...(dto.allowMemberVisibility !== undefined ? { allowMemberVisibility: dto.allowMemberVisibility } : {}),
      },
      include: this.teamDetailInclude,
    });

    return this.mapTeamDetail(team);
  }

  async update(id: string, organizationId: string, dto: UpdateTeamDto) {
    const existing = await this.findTeam(id, organizationId);

    const name = dto.name?.trim() ?? existing.name;
    await this.assertUniqueTeamName(organizationId, name, id);
    if (dto.typeId) {
      await this.assertTeamTypeAllowed(dto.typeId, organizationId);
    }
    if (dto.managerId !== undefined) {
      await this.assertManager(dto.managerId, organizationId);
    }

    const team = await this.prisma.team.update({
      where: { id },
      data: {
        name,
        ...(dto.typeId !== undefined ? { typeId: dto.typeId } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId || null } : {}),
        ...(dto.allowMemberVisibility !== undefined ? { allowMemberVisibility: dto.allowMemberVisibility } : {}),
      ...(dto.leadVisibilityMode !== undefined ? { leadVisibilityMode: dto.leadVisibilityMode } : {}),
      },
      include: this.teamDetailInclude,
    });

    // Invalidate scope cache for all team members when visibility changes
    if (dto.allowMemberVisibility !== undefined || dto.leadVisibilityMode !== undefined) {
      await this.notifyScopeInvalidation('team', { teamId: id, orgId: organizationId });
    }

    return this.mapTeamDetail(team);
  }

  async softDelete(id: string, organizationId: string, _actorUserId: string) {
    await this.findTeam(id, organizationId);

    await this.prisma.team.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return { message: 'Team deleted' };
  }

  async addMember(
    teamId: string,
    organizationId: string,
    dto: AddTeamMemberDto,
    _actorUserId: string,
  ) {
    await this.findTeam(teamId, organizationId);
    await this.assertActiveEmployee(dto.userId, organizationId, 'User');

    const existingMember = await this.prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: dto.userId,
      },
      select: { id: true },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this team');
    }

    const member = await this.prisma.teamMember.create({
      data: {
        teamId,
        userId: dto.userId,
        role: dto.role ?? TeamMemberRole.MEMBER,
      },
      include: this.teamMemberInclude,
    });

    return this.mapTeamMember(member);
  }

  async updateMemberRole(
    teamId: string,
    userId: string,
    organizationId: string,
    role: TeamMemberRole,
  ) {
    await this.findTeam(teamId, organizationId);

    const member = await this.prisma.teamMember.findFirst({
      where: {
        teamId,
        userId,
      },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    const updated = await this.prisma.teamMember.update({
      where: { id: member.id },
      data: { role },
      include: this.teamMemberInclude,
    });

    return this.mapTeamMember(updated);
  }

  async removeMember(
    teamId: string,
    userId: string,
    organizationId: string,
    _actorUserId: string,
  ) {
    await this.findTeam(teamId, organizationId);

    const member = await this.prisma.teamMember.findFirst({
      where: {
        teamId,
        userId,
      },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    await this.prisma.teamMember.delete({
      where: { id: member.id },
    });

    return { message: 'Team member removed' };
  }

  private async findTeam(id: string, organizationId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        typeId: true,
        managerId: true,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  private async assertUniqueTeamName(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A team with this name already exists');
    }
  }

  private async assertTeamTypeAllowed(typeId: string, organizationId: string): Promise<void> {
    const teamType = await this.prisma.teamType.findUnique({
      where: { id: typeId },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!teamType) {
      throw new NotFoundException('Team type not found');
    }

    if (teamType.organizationId && teamType.organizationId !== organizationId) {
      throw new ForbiddenException('This team type does not belong to your organization');
    }
  }

  private async assertManager(
    managerId: string | null | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!managerId) {
      return;
    }

    await this.assertActiveEmployee(managerId, organizationId, 'Manager');
  }

  private async assertActiveEmployee(
    userId: string,
    organizationId: string,
    label: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        status: true,
      },
    });

    if (!user || user.organizationId !== organizationId) {
      throw new BadRequestException(`${label} must belong to your organization`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(`${label} must be an active employee`);
    }
  }

  private mapTeamSummary(team: any) {
    return {
      id: team.id,
      name: team.name,
      description: team.description ?? null,
      type: {
        id: team.teamType.id,
        name: team.teamType.name,
        slug: team.teamType.slug,
        isSystem: team.teamType.isSystem,
      },
      manager: team.manager ? this.mapManager(team.manager) : null,
      memberCount: team._count.members,
      allowMemberVisibility: team.allowMemberVisibility,
      leadVisibilityMode: team.leadVisibilityMode,
      isActive: team.isActive,
      deletedAt: team.deletedAt?.toISOString() ?? null,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  private mapTeamDetail(team: any) {
    return {
      id: team.id,
      name: team.name,
      description: team.description ?? null,
      type: {
        id: team.teamType.id,
        name: team.teamType.name,
        slug: team.teamType.slug,
        isSystem: team.teamType.isSystem,
      },
      manager: team.manager ? this.mapManager(team.manager) : null,
      memberCount: team.members.length,
      members: team.members.map((member: any) => this.mapTeamMember(member)),
      allowMemberVisibility: team.allowMemberVisibility,
      leadVisibilityMode: team.leadVisibilityMode,
      isActive: team.isActive,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  private mapTeamMember(member: any) {
    return {
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl ?? null,
      role: member.role,
      jobTitle: member.user.jobTitle ?? null,
      joinedAt: member.joinedAt.toISOString(),
    };
  }

  private mapManager(manager: any) {
    return {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      avatarUrl: manager.avatarUrl ?? null,
    };
  }

  private readonly teamListInclude = {
    teamType: {
      select: {
        id: true,
        name: true,
        slug: true,
        isSystem: true,
      },
    },
    manager: {
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    },
    _count: {
      select: {
        members: true,
      },
    },
  } satisfies Prisma.TeamInclude;

  private readonly teamMemberInclude = {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        jobTitle: true,
      },
    },
  } satisfies Prisma.TeamMemberInclude;

  private readonly teamDetailInclude = {
    teamType: {
      select: {
        id: true,
        name: true,
        slug: true,
        isSystem: true,
      },
    },
    manager: {
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    },
    members: {
      include: this.teamMemberInclude,
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    },
  } satisfies Prisma.TeamInclude;

  private async notifyScopeInvalidation(
    type: 'user' | 'team',
    payload: { userId?: string; teamId?: string; orgId: string },
  ): Promise<void> {
    const coreUrl = this.config.get<string>('CORE_SERVICE_URL', 'http://localhost:3001');
    const secret = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');
    try {
      await this.httpService.axiosRef.post(
        `${coreUrl}/api/internal/scope/invalidate/${type}`,
        payload,
        {
          headers: { 'x-internal-secret': secret },
          timeout: 3000,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Scope invalidation (${type}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
