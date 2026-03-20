import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { UserRole } from '@sentra-core/types';
import { CacheService } from '../../common';
import { UserScope } from './user-scope.class';
import { ScopeData } from './scope.types';

const SCOPE_TTL_MS = 900_000; // 15 minutes in milliseconds
const SCOPE_KEY_PREFIX = 'scope:';

@Injectable()
export class ScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getUserScope(userId: string, orgId: string, role: UserRole): Promise<UserScope> {
    const cacheKey = `${SCOPE_KEY_PREFIX}${orgId}:${userId}`;

    const cached = await this.cache.get<ScopeData>(cacheKey);
    if (cached) {
      return UserScope.fromJSON(cached);
    }

    const scopeData = await this.computeScope(userId, orgId, role);
    const scope = new UserScope(scopeData);

    await this.cache.set(cacheKey, scope.toJSON(), SCOPE_TTL_MS);

    return scope;
  }

  async invalidateUser(userId: string, orgId: string): Promise<void> {
    const cacheKey = `${SCOPE_KEY_PREFIX}${orgId}:${userId}`;
    await this.cache.del(cacheKey);
  }

  async invalidateTeam(teamId: string, orgId: string): Promise<void> {
    const [members, team] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      }),
      this.prisma.team.findUnique({
        where: { id: teamId },
        select: { managerId: true },
      }),
    ]);

    const userIds = new Set(members.map((m) => m.userId));
    if (team?.managerId) userIds.add(team.managerId);

    await Promise.all(
      [...userIds].map((uid) => this.invalidateUser(uid, orgId)),
    );
  }

  private async computeScope(userId: string, orgId: string, role: UserRole): Promise<ScopeData> {
    if (role === UserRole.OWNER || role === UserRole.ADMIN) {
      return {
        userId,
        orgId,
        role,
        teamIds: [],
        managedTeamIds: [],
        brandIds: [],
        memberVisibleTeamIds: [],
      };
    }

    const [memberTeams, managedTeams] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: {
          userId,
          team: { organizationId: orgId, deletedAt: null, isActive: true },
        },
        select: {
          teamId: true,
          team: {
            select: {
              allowMemberVisibility: true,
              teamBrands: { select: { brandId: true } },
            },
          },
        },
      }),
      this.prisma.team.findMany({
        where: {
          managerId: userId,
          organizationId: orgId,
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          allowMemberVisibility: true,
          teamBrands: { select: { brandId: true } },
        },
      }),
    ]);

    const teamIds = new Set<string>();
    const managedTeamIds = new Set<string>();
    const brandIds = new Set<string>();
    const memberVisibleTeamIds = new Set<string>();

    for (const m of memberTeams) {
      teamIds.add(m.teamId);
      if (m.team.allowMemberVisibility) {
        memberVisibleTeamIds.add(m.teamId);
      }
      for (const tb of m.team.teamBrands) {
        brandIds.add(tb.brandId);
      }
    }

    for (const t of managedTeams) {
      teamIds.add(t.id);
      managedTeamIds.add(t.id);
      if (t.allowMemberVisibility) {
        memberVisibleTeamIds.add(t.id);
      }
      for (const tb of t.teamBrands) {
        brandIds.add(tb.brandId);
      }
    }

    return {
      userId,
      orgId,
      role,
      teamIds: [...teamIds],
      managedTeamIds: [...managedTeamIds],
      brandIds: [...brandIds],
      memberVisibleTeamIds: [...memberVisibleTeamIds],
    };
  }
}
