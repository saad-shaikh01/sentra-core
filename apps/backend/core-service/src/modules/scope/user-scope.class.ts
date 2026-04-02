import { ScopeData, LeadScopeFilter, ClientScopeFilter, SaleScopeFilter, InvoiceScopeFilter } from './scope.types';

export class UserScope {
  constructor(private readonly data: ScopeData) {}

  get isFullAccess(): boolean {
    return this.data.scopeBehavior === 'full';
  }

  get isManager(): boolean {
    return this.data.scopeBehavior === 'manager';
  }

  toLeadFilter(): LeadScopeFilter {
    const base: LeadScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.scopeBehavior === 'frontsell') {
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

    // Upsell agent with explicit lead permission — show only their assigned leads
    if (this.data.scopeBehavior === 'upsell' && this.data.viewOwnLeads) {
      return { ...base, assignedToId: this.data.userId };
    }

    // upsell (no lead permission), pm, restricted: no lead access
    return { ...base, assignedToId: '__none__' };
  }

  toClientFilter(): ClientScopeFilter {
    const base: ClientScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.scopeBehavior === 'frontsell') {
      if (
        this.data.memberVisibleTeamIds.length > 0 &&
        this.data.brandIds.length > 0
      ) {
        return { ...base, brandId: { in: this.data.brandIds } };
      }
      return { ...base, brandId: { in: [] } };
    }

    if (this.data.scopeBehavior === 'upsell') {
      return { ...base, upsellAgentId: this.data.userId };
    }

    // pm: scoped to assigned projects
    return { ...base, projectManagerId: this.data.userId };
  }

  toSaleFilter(): SaleScopeFilter {
    const base: SaleScopeFilter = { organizationId: this.data.orgId };

    if (this.isFullAccess) return base;

    if (this.isManager) {
      return { ...base, brandId: { in: this.data.brandIds } };
    }

    if (this.data.scopeBehavior === 'frontsell') {
      const ownSales = { salesAgentId: this.data.userId };

      if (
        this.data.memberVisibleTeamIds.length > 0 &&
        this.data.brandIds.length > 0
      ) {
        return { ...base, OR: [{ brandId: { in: this.data.brandIds } }, ownSales] };
      }
      return { ...base, ...ownSales };
    }

    if (this.data.scopeBehavior === 'upsell') {
      return { ...base, client: { is: { upsellAgentId: this.data.userId } } };
    }

    // pm, restricted: no sale access
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
