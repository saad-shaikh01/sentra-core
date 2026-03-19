import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';

export interface HrmsTeamMember {
  userId: string;
  user: { id: string; name: string; email: string } | null;
  role: string;
}

export interface HrmsTeam {
  id: string;
  name: string;
  description?: string;
  type: { id: string; name: string };
  manager: { id: string; name: string; email: string } | null;
  members: HrmsTeamMember[];
  memberCount: number;
}

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string): Promise<HrmsTeam[]> {
    const teams = await this.prisma.team.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        teamType: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? undefined,
      type: t.teamType,
      manager: t.manager,
      members: t.members.map((m) => ({
        userId: m.userId,
        user: m.user,
        role: m.role,
      })),
      memberCount: t.members.length,
    }));
  }

  async findOne(id: string, orgId: string): Promise<HrmsTeam | null> {
    const t = await this.prisma.team.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        teamType: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!t) return null;

    return {
      id: t.id,
      name: t.name,
      description: t.description ?? undefined,
      type: t.teamType,
      manager: t.manager,
      members: t.members.map((m) => ({
        userId: m.userId,
        user: m.user,
        role: m.role,
      })),
      memberCount: t.members.length,
    };
  }

  /**
   * Returns user IDs managed by a given manager (for lead visibility scoping).
   * SALES_MANAGER role → can see leads of all members in their HRMS teams.
   */
  async getMemberIds(managerId: string, orgId: string): Promise<string[]> {
    const teams = await this.prisma.team.findMany({
      where: {
        organizationId: orgId,
        managerId,
        deletedAt: null,
        isActive: true,
      },
      select: { members: { select: { userId: true } } },
    });

    const ids = new Set<string>();
    for (const t of teams) {
      for (const m of t.members) ids.add(m.userId);
    }
    return [...ids];
  }
}
