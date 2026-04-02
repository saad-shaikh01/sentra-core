import { UserRole } from '@sentra-core/types';

export type ScopeBehavior = 'full' | 'manager' | 'frontsell' | 'upsell' | 'pm' | 'restricted';

export interface TeamLeadVisibility {
  teamId: string;
  mode: string; // LeadVisibilityMode value
}

export interface ScopeData {
  userId: string;
  orgId: string;
  role: UserRole;
  /** Permission-derived behavior — drives all filter logic in UserScope */
  scopeBehavior: ScopeBehavior;
  teamIds: string[];
  managedTeamIds: string[];
  brandIds: string[];
  memberVisibleTeamIds: string[];
  teamLeadVisibility: TeamLeadVisibility[];
  /** True when a non-frontsell agent (e.g. upsell) has been explicitly granted lead view permission */
  viewOwnLeads?: boolean;
}

export interface LeadScopeFilter {
  organizationId: string;
  brandId?: { in: string[] };
  assignedToId?: string;
  OR?: Array<Record<string, unknown>>;
}

export interface ClientScopeFilter {
  organizationId: string;
  brandId?: { in: string[] };
  upsellAgentId?: string;
  projectManagerId?: string;
}

export interface SaleScopeFilter {
  organizationId: string;
  brandId?: { in: string[] };
  salesAgentId?: string;
  id?: { in: string[] };
  client?: { is: { upsellAgentId: string } };
  OR?: Array<Omit<SaleScopeFilter, 'organizationId' | 'OR'>>;
}

export interface InvoiceScopeFilter {
  sale?: {
    is?: Omit<SaleScopeFilter, 'organizationId'>;
  };
}
