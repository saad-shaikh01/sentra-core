import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { ISalesTeam, ISalesTeamMember, UserRole } from '@sentra-core/types';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreateTeamDto): Promise<ISalesTeam> {
    await this.validateUsersInOrg(orgId, [
      ...(dto.managerIds ?? []),
      ...(dto.memberIds ?? []),
    ]);

    const team = await this.prisma.salesTeam.create({
      data: {
        name: dto.name,
        description: dto.description,
        organizationId: orgId,
        managers: {
          create: (dto.managerIds ?? []).map((userId) => ({ userId })),
        },
        members: {
          create: (dto.memberIds ?? []).map((userId) => ({ userId })),
        },
      },
      include: this.teamInclude(),
    });

    return this.mapToISalesTeam(team);
  }

  async findAll(orgId: string): Promise<ISalesTeam[]> {
    const teams = await this.prisma.salesTeam.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
      include: this.teamInclude(),
    });
    return teams.map((t) => this.mapToISalesTeam(t));
  }

  async findOne(id: string, orgId: string): Promise<ISalesTeam> {
    const team = await this.prisma.salesTeam.findFirst({
      where: { id, organizationId: orgId },
      include: this.teamInclude(),
    });
    if (!team) throw new NotFoundException('Team not found');
    return this.mapToISalesTeam(team);
  }

  async update(id: string, orgId: string, dto: UpdateTeamDto): Promise<ISalesTeam> {
    const team = await this.prisma.salesTeam.findFirst({ where: { id, organizationId: orgId } });
    if (!team) throw new NotFoundException('Team not found');

    await this.validateUsersInOrg(orgId, [
      ...(dto.managerIds ?? []),
      ...(dto.memberIds ?? []),
    ]);

    // Replace managers and members if provided
    const updated = await this.prisma.salesTeam.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.managerIds !== undefined && {
          managers: {
            deleteMany: {},
            create: dto.managerIds.map((userId) => ({ userId })),
          },
        }),
        ...(dto.memberIds !== undefined && {
          members: {
            deleteMany: {},
            create: dto.memberIds.map((userId) => ({ userId })),
          },
        }),
      },
      include: this.teamInclude(),
    });

    return this.mapToISalesTeam(updated);
  }

  async remove(id: string, orgId: string): Promise<{ message: string }> {
    const team = await this.prisma.salesTeam.findFirst({ where: { id, organizationId: orgId } });
    if (!team) throw new NotFoundException('Team not found');

    await this.prisma.salesTeam.delete({ where: { id } });
    return { message: 'Team deleted successfully' };
  }

  /** Returns user IDs managed by a given manager (for visibility scoping). */
  async getMemberIds(managerId: string, orgId: string): Promise<string[]> {
    const teams = await this.prisma.salesTeam.findMany({
      where: {
        organizationId: orgId,
        managers: { some: { userId: managerId } },
      },
      select: { members: { select: { userId: true } } },
    });
    const ids = new Set<string>();
    for (const t of teams) {
      for (const m of t.members) ids.add(m.userId);
    }
    return [...ids];
  }

  private async validateUsersInOrg(orgId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const unique = [...new Set(userIds)];
    const found = await this.prisma.user.count({
      where: { id: { in: unique }, organizationId: orgId },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more users do not belong to this organization');
    }
  }

  private teamInclude() {
    return {
      managers: { include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } } },
      members:  { include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } } },
    } as const;
  }

  private mapToISalesTeam(team: any): ISalesTeam {
    const mapMember = (r: any): ISalesTeamMember => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      role: r.user.role as UserRole,
      avatarUrl: r.user.avatarUrl ?? undefined,
    });
    return {
      id: team.id,
      name: team.name,
      description: team.description ?? undefined,
      organizationId: team.organizationId,
      managers: (team.managers ?? []).map(mapMember),
      members: (team.members ?? []).map(mapMember),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }
}
