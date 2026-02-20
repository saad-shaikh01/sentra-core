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

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  PROPOSAL = 'PROPOSAL',
  CLOSED = 'CLOSED',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum LeadActivityType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  NOTE = 'NOTE',
  ASSIGNMENT_CHANGE = 'ASSIGNMENT_CHANGE',
  CONVERSION = 'CONVERSION',
  CREATED = 'CREATED',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum TransactionType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
  REFUND = 'REFUND',
}

// ==========================================
// LEAD STATUS TRANSITIONS
// ==========================================

export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.CLOSED],
  [LeadStatus.CONTACTED]: [LeadStatus.PROPOSAL, LeadStatus.CLOSED],
  [LeadStatus.PROPOSAL]: [LeadStatus.CLOSED, LeadStatus.CONTACTED],
  [LeadStatus.CLOSED]: [],
};

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
// PAGINATION
// ==========================================

export interface IPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
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
// BRAND INTERFACES
// ==========================================

export interface IBrand {
  id: string;
  name: string;
  domain?: string;
  logoUrl?: string;
  colors?: Record<string, string>;
  organizationId: string;
  createdAt?: Date;
}

// ==========================================
// LEAD INTERFACES
// ==========================================

export interface ILead {
  id: string;
  title: string;
  status: LeadStatus;
  source?: string;
  data?: Record<string, unknown>;
  brandId: string;
  organizationId: string;
  assignedToId?: string;
  convertedClientId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadActivity {
  id: string;
  type: LeadActivityType;
  data: Record<string, unknown>;
  leadId: string;
  userId: string;
  createdAt: Date;
}

// ==========================================
// CLIENT INTERFACES
// ==========================================

export interface IClient {
  id: string;
  email: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  brandId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SALE INTERFACES
// ==========================================

export interface ISale {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  currency: string;
  description?: string;
  clientId: string;
  brandId: string;
  organizationId: string;
  customerProfileId?: string;
  paymentProfileId?: string;
  subscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// INVOICE INTERFACES
// ==========================================

export interface IInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  pdfUrl?: string;
  notes?: string;
  saleId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// PAYMENT TRANSACTION INTERFACES
// ==========================================

export interface IPaymentTransaction {
  id: string;
  transactionId?: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  responseCode?: string;
  responseMessage?: string;
  saleId: string;
  invoiceId?: string;
  createdAt: Date;
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
