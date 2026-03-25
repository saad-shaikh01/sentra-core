import { UserRole } from '@sentra-core/types';

export interface TeamLeadVisibility {
  teamId: string;
  mode: string; // LeadVisibilityMode value
}

export interface ScopeData {
  userId: string;
  orgId: string;
  role: UserRole;
  teamIds: string[];
  managedTeamIds: string[];
  brandIds: string[];
  memberVisibleTeamIds: string[];
  teamLeadVisibility: TeamLeadVisibility[];
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
  id?: { in: string[] };
  client?: { is: { upsellAgentId: string } };
}

export interface InvoiceScopeFilter {
  sale?: {
    is?: Omit<SaleScopeFilter, 'organizationId'>;
  };
}
