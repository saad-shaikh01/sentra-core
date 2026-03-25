import { UserRole } from '@sentra-core/types';
import { ScopeData, LeadScopeFilter, ClientScopeFilter, SaleScopeFilter, InvoiceScopeFilter } from './scope.types';

export class UserScope {
  constructor(private readonly data: ScopeData) {}

  get isFullAccess(): boolean {
    return this.data.role === UserRole.OWNER || this.data.role === UserRole.ADMIN;
  }

  get isManager(): boolean {
    return this.data.role === UserRole.SALES_MANAGER;
  }

  toLeadFilter(): LeadScopeFilter {
    const base: LeadScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.role === UserRole.FRONTSELL_AGENT) {
      const orConditions: Array<Record<string, unknown>> = [
        { assignedToId: this.data.userId },
        { collaborators: { some: { userId: this.data.userId } } },
      ];

      const poolTeamIds = this.data.teamLeadVisibility
        .filter((t) => t.mode === 'TEAM_UNASSIGNED_ONLY' || t.mode === 'TEAM_ALL')
        .map((t) => t.teamId);

      if (poolTeamIds.length > 0) {
        orConditions.push({ teamId: { in: poolTeamIds }, assignedToId: null });
      }

      const allTeamIds = this.data.teamLeadVisibility
        .filter((t) => t.mode === 'TEAM_ALL')
        .map((t) => t.teamId);

      if (allTeamIds.length > 0) {
        orConditions.push({ teamId: { in: allTeamIds } });
      }

      return { ...base, OR: orConditions };
    }

    // UPSELL_AGENT and PROJECT_MANAGER: no lead access
    return { ...base, assignedToId: '__none__' };
  }

  toClientFilter(): ClientScopeFilter {
    const base: ClientScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.role === UserRole.FRONTSELL_AGENT) {
      if (
        this.data.memberVisibleTeamIds.length > 0 &&
        this.data.brandIds.length > 0
      ) {
        return { ...base, brandId: { in: this.data.brandIds } };
      }
      return { ...base, brandId: { in: [] } };
    }

    if (this.data.role === UserRole.UPSELL_AGENT) {
      return { ...base, upsellAgentId: this.data.userId };
    }

    // PROJECT_MANAGER
    return { ...base, projectManagerId: this.data.userId };
  }

  toSaleFilter(): SaleScopeFilter {
    const base: SaleScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.role === UserRole.FRONTSELL_AGENT) {
      if (
        this.data.memberVisibleTeamIds.length > 0 &&
        this.data.brandIds.length > 0
      ) {
        return { ...base, brandId: { in: this.data.brandIds } };
      }
      // Frontsell with no visible team: no sale access
      return { ...base, id: { in: [] } };
    }

    if (this.data.role === UserRole.UPSELL_AGENT) {
      // Upsell agents see sales for clients assigned to them
      return { ...base, client: { is: { upsellAgentId: this.data.userId } } };
    }

    // PROJECT_MANAGER: no sale access
    return { ...base, id: { in: [] } };
  }

  toInvoiceFilter(): InvoiceScopeFilter {
    if (this.isFullAccess) return {};

    const { organizationId, ...saleWhere } = this.toSaleFilter();
    return Object.keys(saleWhere).length > 0
      ? { sale: { is: saleWhere as Omit<SaleScopeFilter, 'organizationId'> } }
      : {};
  }

  toJSON(): ScopeData {
    return { ...this.data };
  }

  static fromJSON(data: ScopeData): UserScope {
    return new UserScope(data);
  }
}
