import { UserRole } from '@sentra-core/types';

export interface ScopeData {
  userId: string;
  orgId: string;
  role: UserRole;
  teamIds: string[];
  managedTeamIds: string[];
  brandIds: string[];
  memberVisibleTeamIds: string[];
}

export interface LeadScopeFilter {
  organizationId: string;
  brandId?: { in: string[] };
  assignedToId?: string;
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
