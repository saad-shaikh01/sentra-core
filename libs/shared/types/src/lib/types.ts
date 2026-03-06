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
  FOLLOW_UP = 'FOLLOW_UP',
  CLOSED = 'CLOSED',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentPlanType {
  ONE_TIME = 'ONE_TIME',
  INSTALLMENTS = 'INSTALLMENTS',
  SUBSCRIPTION = 'SUBSCRIPTION',
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

export const OrganizationOnboardingMode = {
  PUBLIC_OWNER_SIGNUP: 'PUBLIC_OWNER_SIGNUP',
  INVITE_ONLY: 'INVITE_ONLY',
} as const;
export type OrganizationOnboardingMode =
  (typeof OrganizationOnboardingMode)[keyof typeof OrganizationOnboardingMode];

export const AppCode = {
  SALES_DASHBOARD: 'SALES_DASHBOARD',
  PM_DASHBOARD: 'PM_DASHBOARD',
  HRMS: 'HRMS',
  CLIENT_PORTAL: 'CLIENT_PORTAL',
  COMM_SERVICE: 'COMM_SERVICE',
} as const;
export type AppCode = (typeof AppCode)[keyof typeof AppCode];

export const DataScopeType = {
  OWN: 'OWN',
  TEAM: 'TEAM',
  DEPARTMENT: 'DEPARTMENT',
  BRAND: 'BRAND',
  PROJECT: 'PROJECT',
  ALL: 'ALL',
} as const;
export type DataScopeType = (typeof DataScopeType)[keyof typeof DataScopeType];

// ==========================================
// LEAD STATUS TRANSITIONS
// ==========================================

export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.FOLLOW_UP, LeadStatus.CLOSED],
  [LeadStatus.CONTACTED]: [LeadStatus.PROPOSAL, LeadStatus.FOLLOW_UP, LeadStatus.CLOSED],
  [LeadStatus.PROPOSAL]: [LeadStatus.FOLLOW_UP, LeadStatus.CLOSED, LeadStatus.CONTACTED],
  [LeadStatus.FOLLOW_UP]: [LeadStatus.CONTACTED, LeadStatus.PROPOSAL, LeadStatus.CLOSED],
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
  appCodes?: AppCode[];
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
  appAccess?: IUserAppAccess[];
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
  onboardingMode?: OrganizationOnboardingMode;
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
  role?: UserRole;
  status: InvitationStatus;
  expiresAt: Date;
  organizationId: string;
  invitedById: string;
  bundles?: IInvitationBundle[];
  createdAt: Date;
}

export interface IUserAppAccess {
  appCode: AppCode;
  appName: string;
  baseUrl?: string;
  isDefault: boolean;
}

export interface IUserAppRole {
  appCode: AppCode;
  roleId: string;
  roleName: string;
  roleSlug: string;
}

export interface IUserScopeGrant {
  appCode: AppCode;
  resourceKey: string;
  scopeType: DataScopeType;
  scopeValues?: unknown;
}

export interface IInvitationBundle {
  appCode: AppCode;
  roleIds?: string[];
  scopeGrants?: Array<{
    resourceKey: string;
    scopeType: DataScopeType;
    scopeValues?: unknown;
  }>;
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
  appAccess?: IUserAppAccess[];
}

export interface ISignupResponse extends IAuthTokens {
  user: IUserProfile;
  organization: IOrganization;
  appAccess?: IUserAppAccess[];
}

// ==========================================
// BRAND INTERFACES
// ==========================================

export interface IBrand {
  id: string;
  name: string;
  domain?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
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
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  status: LeadStatus;
  source?: string;
  data?: Record<string, unknown>;
  brandId: string;
  organizationId: string;
  assignedToId?: string;
  convertedClientId?: string;
  followUpDate?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
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

export interface ISaleItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  customPrice?: number;
  saleId: string;
}

export interface ISale {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  currency: string;
  description?: string;
  contractUrl?: string;
  paymentPlan: PaymentPlanType;
  installmentCount?: number;
  clientId: string;
  brandId: string;
  organizationId: string;
  customerProfileId?: string;
  paymentProfileId?: string;
  subscriptionId?: string;
  items?: ISaleItem[];
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
// SALES TEAMS
// ==========================================

export interface ISalesTeamMember {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface ISalesTeam {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  managers: ISalesTeamMember[];
  members: ISalesTeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// PRODUCT PACKAGES
// ==========================================

export interface IPackageItem {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  isActive: boolean;
  packageId: string;
}

export interface IProductPackage {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  brandId?: string;
  organizationId: string;
  items: IPackageItem[];
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// ANALYTICS
// ==========================================

export interface IAnalyticsSummary {
  totalRevenue: number;
  totalLeads: number;
  convertedLeads: number;
  activeSales: number;
  revenueByMonth: Array<{ month: string; revenue: number }>;
  leadsByAgent: Array<{ agentName: string; total: number; converted: number }>;
  salesByBrand: Array<{ brandName: string; total: number; revenue: number }>;
}

// ==========================================
// SEARCH
// ==========================================

export interface ISearchResult {
  type: 'lead' | 'client' | 'sale' | 'invoice';
  id: string;
  title: string;
  subtitle: string;
  url: string;
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
