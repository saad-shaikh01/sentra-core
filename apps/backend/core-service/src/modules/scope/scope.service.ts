import { Injectable } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { UserRole } from '@sentra-core/types';
import { CacheService, PermissionsService } from '../../common';
import { UserScope } from './user-scope.class';
import { ScopeBehavior, ScopeData } from './scope.types';

const SCOPE_TTL_MS = 900_000; // 15 minutes in milliseconds
const SCOPE_KEY_PREFIX = 'scope:';

@Injectable()
export class ScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly permissionsService: PermissionsService,
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

  private deriveScopeBehavior(role: UserRole, permissions: string[]): ScopeBehavior {
    const has = (p: string) => this.permissionsService.matchesAnyPermission(permissions, p);

    if (has('*:*:*') || has('sales:*:*')) return 'full';
    if (has('sales:leads:view_all') || has('sales:clients:view_all')) return 'manager';
    if (has('sales:leads:create') || has('sales:leads:view_own')) return 'frontsell';
    if (has('sales:sales:create') || has('sales:sales:view_own') || has('sales:clients:view_own')) return 'upsell';

    // Fallback to legacy role names for users with no app-role assignments
    if (role === UserRole.OWNER || role === UserRole.ADMIN) return 'full';
    if (role === UserRole.SALES_MANAGER) return 'manager';
    if (role === UserRole.FRONTSELL_AGENT) return 'frontsell';
    if (role === UserRole.UPSELL_AGENT) return 'upsell';
    if (role === UserRole.PROJECT_MANAGER) return 'pm';
    return 'restricted';
  }

  private async computeScope(userId: string, orgId: string, role: UserRole): Promise<ScopeData> {
    if (role === UserRole.OWNER || role === UserRole.ADMIN) {
      return {
        userId,
        orgId,
        role,
        scopeBehavior: 'full',
        teamIds: [],
        managedTeamIds: [],
        brandIds: [],
        memberVisibleTeamIds: [],
        teamLeadVisibility: [],
      };
    }

    // Derive scope behavior from DB permissions (with legacy role fallback inside getUserPermissions)
    const permissions = await this.permissionsService.getUserPermissions(userId, orgId);
    const scopeBehavior = this.deriveScopeBehavior(role, permissions);

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
              leadVisibilityMode: true,
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
          leadVisibilityMode: true,
          teamBrands: { select: { brandId: true } },
        },
      }),
    ]);

    const teamIds = new Set<string>();
    const managedTeamIds = new Set<string>();
    const brandIds = new Set<string>();
    const memberVisibleTeamIds = new Set<string>();
    const teamLeadVisibilityMap = new Map<string, string>();

    for (const m of memberTeams) {
      teamIds.add(m.teamId);
      if (m.team.allowMemberVisibility) {
        memberVisibleTeamIds.add(m.teamId);
      }
      teamLeadVisibilityMap.set(m.teamId, m.team.leadVisibilityMode);
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
      teamLeadVisibilityMap.set(t.id, t.leadVisibilityMode);
      for (const tb of t.teamBrands) {
        brandIds.add(tb.brandId);
      }
    }

    return {
      userId,
      orgId,
      role,
      scopeBehavior,
      teamIds: [...teamIds],
      managedTeamIds: [...managedTeamIds],
      brandIds: [...brandIds],
      memberVisibleTeamIds: [...memberVisibleTeamIds],
      teamLeadVisibility: [...teamLeadVisibilityMap.entries()].map(([teamId, mode]) => ({ teamId, mode })),
    };
  }
}
