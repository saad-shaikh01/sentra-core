// ==========================================
// Shared Types for Sentra Core
// Used by both Backend (NestJS) and Frontend (Next.js)
// ==========================================

// ==========================================
// ENUMS
// ==========================================

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  SALES_MANAGER = 'SALES_MANAGER',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  FRONTSELL_AGENT = 'FRONTSELL_AGENT',
  UPSELL_AGENT = 'UPSELL_AGENT',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

// ==========================================
// ROLE HIERARCHY (Higher index = higher privilege)
// ==========================================

export const ROLE_HIERARCHY: UserRole[] = [
  UserRole.UPSELL_AGENT,
  UserRole.FRONTSELL_AGENT,
  UserRole.PROJECT_MANAGER,
  UserRole.SALES_MANAGER,
  UserRole.ADMIN,
  UserRole.OWNER,
];

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

// ==========================================
// JWT PAYLOAD INTERFACE
// ==========================================

export interface JwtPayload {
  sub: string; // userId
  email: string;
  orgId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ==========================================
// USER INTERFACES
// ==========================================

export interface IUserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  jobTitle?: string;
  phone?: string;
  bio?: string;
  isActive: boolean;
  organizationId: string;
  organization?: IOrganization;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPublic {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  jobTitle?: string;
  isActive: boolean;
}

// ==========================================
// ORGANIZATION INTERFACES
// ==========================================

export interface IOrganization {
  id: string;
  name: string;
  subscription: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationMember {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  jobTitle?: string;
  isActive: boolean;
  createdAt: Date;
}

// ==========================================
// INVITATION INTERFACES
// ==========================================

export interface IInvitation {
  id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  expiresAt: Date;
  organizationId: string;
  invitedById: string;
  createdAt: Date;
}

// ==========================================
// AUTH INTERFACES
// ==========================================

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ILoginResponse extends IAuthTokens {
  user: IUserProfile;
}

export interface ISignupResponse extends IAuthTokens {
  user: IUserProfile;
  organization: IOrganization;
}

// ==========================================
// ROLE DESCRIPTIONS (for UI)
// ==========================================

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Full access. Can manage organization settings and billing.',
  [UserRole.ADMIN]: 'Can manage users and roles. Cannot change Owner.',
  [UserRole.SALES_MANAGER]: 'View all leads and manage sales team.',
  [UserRole.PROJECT_MANAGER]: 'Manage orders, invoices, and project delivery.',
  [UserRole.FRONTSELL_AGENT]: 'Focus on new leads and client acquisition.',
  [UserRole.UPSELL_AGENT]: 'Focus on existing clients and upselling.',
};
