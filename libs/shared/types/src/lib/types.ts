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
  WON = 'WON',
  LOST = 'LOST',
  NCE = 'NCE',
  INVALID = 'INVALID',
}

export enum LeadType {
  CHAT = 'CHAT',
  SIGNUP = 'SIGNUP',
  SOCIAL = 'SOCIAL',
  REFERRAL = 'REFERRAL',
  INBOUND = 'INBOUND',
}

export enum LeadSource {
  PPC = 'PPC',
  SMM = 'SMM',
  COLD_REFERRAL = 'COLD_REFERRAL',
  FACEBOOK_ADS = 'FACEBOOK_ADS',
  WEBHOOK = 'WEBHOOK',
}

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  INACTIVE = 'INACTIVE',
  REFUNDED = 'REFUNDED',
  CHARGEBACK = 'CHARGEBACK',
  BLACKLISTED = 'BLACKLISTED',
}

export enum ClientActivityType {
  CREATED = 'CREATED',
  UPSELL_ASSIGNED = 'UPSELL_ASSIGNED',
  PM_ASSIGNED = 'PM_ASSIGNED',
  STATUS_CHANGE = 'STATUS_CHANGE',
  NOTE = 'NOTE',
  PORTAL_ACCESS_GRANTED = 'PORTAL_ACCESS_GRANTED',
  PORTAL_ACCESS_REVOKED = 'PORTAL_ACCESS_REVOKED',
  CHARGEBACK_FILED = 'CHARGEBACK_FILED',
  REFUND_ISSUED = 'REFUND_ISSUED',
}

export enum SaleStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ON_HOLD = 'ON_HOLD',
  REFUNDED = 'REFUNDED',
}

export enum SalePaymentStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
}

export enum SaleType {
  FRONTSELL = 'FRONTSELL',
  UPSELL = 'UPSELL',
}

export enum SaleActivityType {
  CREATED = 'CREATED',
  STATUS_CHANGE = 'STATUS_CHANGE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  REFUND_ISSUED = 'REFUND_ISSUED',
  CHARGEBACK_FILED = 'CHARGEBACK_FILED',
  NOTE = 'NOTE',
  INVOICE_CREATED = 'INVOICE_CREATED',
  INVOICE_UPDATED = 'INVOICE_UPDATED',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  DISCOUNT_APPLIED = 'DISCOUNT_APPLIED',
}

export enum PaymentPlanType {
  ONE_TIME = 'ONE_TIME',
  INSTALLMENTS = 'INSTALLMENTS',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

export enum InstallmentMode {
  EQUAL = 'EQUAL',
  CUSTOM = 'CUSTOM',
}

export interface ICustomInstallment {
  amount: number;
  dueDate?: string; // ISO date string
  note?: string;
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
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
  OUTREACH_STARTED = 'OUTREACH_STARTED',
  OUTREACH_SENT = 'OUTREACH_SENT',
  OUTREACH_REPLIED = 'OUTREACH_REPLIED',
  COLLABORATOR_ADDED = 'COLLABORATOR_ADDED',
  COLLABORATOR_REMOVED = 'COLLABORATOR_REMOVED',
  CLAIMED = 'CLAIMED',
  UNCLAIMED = 'UNCLAIMED',
}

export enum LeadVisibilityMode {
  OWN_ONLY = 'OWN_ONLY',
  TEAM_UNASSIGNED_ONLY = 'TEAM_UNASSIGNED_ONLY',
  TEAM_ALL = 'TEAM_ALL',
}

export type LeadViewTab = 'my' | 'collaborating' | 'pool' | 'team';

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CHARGEBACK_FILED = 'CHARGEBACK_FILED',
  CHARGEBACK_WON = 'CHARGEBACK_WON',
  CHARGEBACK_LOST = 'CHARGEBACK_LOST',
}

export enum TransactionType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
  VOID = 'VOID',
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK',
}

export enum GatewayType {
  AUTHORIZE_NET = 'AUTHORIZE_NET',
  STRIPE = 'STRIPE',
  MANUAL = 'MANUAL',
  CYBERSOURCE = 'CYBERSOURCE',
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
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.FOLLOW_UP, LeadStatus.WON, LeadStatus.LOST, LeadStatus.NCE, LeadStatus.INVALID],
  [LeadStatus.CONTACTED]: [LeadStatus.PROPOSAL, LeadStatus.FOLLOW_UP, LeadStatus.WON, LeadStatus.LOST, LeadStatus.NCE, LeadStatus.INVALID],
  [LeadStatus.PROPOSAL]: [LeadStatus.FOLLOW_UP, LeadStatus.CONTACTED, LeadStatus.WON, LeadStatus.LOST, LeadStatus.NCE, LeadStatus.INVALID],
  [LeadStatus.FOLLOW_UP]: [LeadStatus.CONTACTED, LeadStatus.PROPOSAL, LeadStatus.WON, LeadStatus.LOST, LeadStatus.NCE, LeadStatus.INVALID],
  [LeadStatus.WON]: [],      // terminal — converted
  [LeadStatus.LOST]: [],     // terminal — lost
  [LeadStatus.NCE]: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.PROPOSAL, LeadStatus.FOLLOW_UP, LeadStatus.LOST, LeadStatus.INVALID],
  [LeadStatus.INVALID]: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.PROPOSAL, LeadStatus.FOLLOW_UP, LeadStatus.LOST, LeadStatus.NCE],
};

export const SALE_STATUS_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.DRAFT]: [],
  [SaleStatus.PENDING]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED, SaleStatus.ON_HOLD],
  [SaleStatus.ACTIVE]: [SaleStatus.COMPLETED, SaleStatus.CANCELLED, SaleStatus.ON_HOLD, SaleStatus.REFUNDED],
  [SaleStatus.ON_HOLD]: [SaleStatus.ACTIVE, SaleStatus.CANCELLED],
  [SaleStatus.COMPLETED]: [SaleStatus.REFUNDED],
  [SaleStatus.CANCELLED]: [],
  [SaleStatus.REFUNDED]: [],
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

// Agent-level roles (field reps with restricted permissions).
// To add a new agent role in the future: add it to UserRole enum + this array. Done.
export const SALES_AGENT_ROLES: UserRole[] = [
  UserRole.FRONTSELL_AGENT,
  UserRole.UPSELL_AGENT,
];

export function isSalesAgentRole(role: UserRole): boolean {
  return SALES_AGENT_ROLES.includes(role);
}

// ==========================================
// JWT PAYLOAD INTERFACE
// ==========================================

export interface JwtPayload {
  sub: string; // userId
  email: string;
  orgId: string;
  organizationId?: string; // alias for orgId
  role: UserRole;
  appCodes?: AppCode[];
  jti: string;
  appCode?: string;
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

export interface IMyAppRoleSummary {
  id: string;
  name: string;
  slug: string;
}

export interface IMyAppAccess extends IUserAppAccess {
  appLabel: string;
  appUrl?: string;
  roles: IMyAppRoleSummary[];
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

export interface IBrandInvoiceConfig {
  id: string;
  brandId: string;
  billingEmail?: string;
  supportEmail?: string;
  phone?: string;
  website?: string;
  address?: string;
  taxId?: string;
  dueDays: number;
  currency: string;
  invoiceTerms?: string;
  invoiceNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

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
  invoiceConfig?: IBrandInvoiceConfig;
  createdAt?: Date;
}

// ==========================================
// LEAD INTERFACES
// ==========================================

export interface ILead {
  id: string;
  title?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  status: LeadStatus;
  leadType?: LeadType;
  source?: LeadSource;
  leadDate?: Date | string;
  lostReason?: string;
  data?: Record<string, unknown>;
  brandId: string;
  organizationId: string;
  assignedToId?: string;
  teamId?: string;
  convertedClientId?: string;
  convertedAt?: Date | string;
  followUpDate?: Date | string;
  collaboratorCount?: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ILeadCollaborator {
  id: string;
  leadId: string;
  userId: string;
  addedByUserId: string;
  user?: { id: string; name: string; avatarUrl?: string };
  createdAt: Date | string;
}

export interface ILeadAssignee {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ILeadDetail extends ILead {
  activities: ILeadActivity[];
  assignedTo?: ILeadAssignee;
  collaborators?: ILeadCollaborator[];
}

export interface ILeadActivity {
  id: string;
  type: LeadActivityType;
  data: Record<string, unknown>;
  leadId: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: Date;
}

export interface ILeadImportErrorDetail {
  row: number;
  reason: string;
}

export interface ILeadImportResult {
  total: number;
  created: number;
  duplicates: number;
  errors: number;
  errorDetails: ILeadImportErrorDetail[];
}

export interface IFacebookIntegration {
  id: string;
  organizationId: string;
  brandId: string;
  pageId: string;
  formId: string;
  label?: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IGenericLeadWebhook {
  id: string;
  organizationId: string;
  brandId: string;
  label?: string;
  defaultSource?: LeadSource;
  defaultLeadType?: LeadType;
  isActive: boolean;
  webhookUrl?: string;
  signingSecret?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ==========================================
// CLIENT INTERFACES
// ==========================================

export interface IClient {
  id: string;
  email: string;
  contactName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: ClientStatus;
  portalAccess: boolean;
  portalGrantedAt?: Date | string;
  portalGrantedBy?: string;
  emailVerified: boolean;
  mustSetPassword: boolean;
  upsellAgentId?: string;
  projectManagerId?: string;
  upsellAgent?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  projectManager?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  brandId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClientActivity {
  id: string;
  type: ClientActivityType;
  data: Record<string, unknown>;
  clientId: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: Date;
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
  packageId?: string;
  packageName?: string;
  saleId: string;
}

export interface IClientCollisionWarning {
  matched: boolean;
  matchedClientId: string;
  matchedClientName: string;
}

export interface ISale {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  paymentStatus?: SalePaymentStatus;
  saleType?: SaleType;
  salesAgentId?: string;
  currency: string;
  description?: string;
  contractUrl?: string;
  saleDate?: Date | string;
  paymentPlan: PaymentPlanType;
  installmentCount?: number;
  installmentMode?: InstallmentMode;
  discountType?: DiscountType;
  discountValue?: number;
  discountedTotal?: number;
  netAmount?: number;
  collectedAmount?: number;
  outstandingAmount?: number;
  paidInvoiceCount?: number;
  totalInvoiceCount?: number;
  clientId: string;
  brandId: string;
  organizationId: string;
  customerProfileId?: string;
  paymentProfileId?: string;
  subscriptionId?: string;
  gateway?: GatewayType;
  gatewayCustomerId?: string;
  gatewayPaymentMethodId?: string;
  gatewaySubscriptionId?: string;
  items?: ISaleItem[];
  activities?: ISaleActivity[];
  salePackage?: ISalePackage;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISaleCreateResponse extends ISale {
  collisionWarning?: IClientCollisionWarning;
}

export interface ISaleWithRelations extends ISale {
  client: IClient;
  invoices: IInvoice[];
  transactions: IPaymentTransaction[];
  items: ISaleItem[];
  salePackage?: ISalePackage;
  netAmount?: number;
  collectedAmount?: number;
  outstandingAmount?: number;
  paidInvoiceCount?: number;
  totalInvoiceCount?: number;
  paidAmount?: number;
  remainingAmount?: number;
}

export interface ISaleActivity {
  id: string;
  type: string;
  data: Record<string, unknown>;
  userId: string;
  createdAt: Date | string;
}

// ==========================================
// INVOICE INTERFACES
// ==========================================

export interface IInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: Date;
  dueDate: Date;
  paidAt?: Date | string;
  status: InvoiceStatus;
  pdfUrl?: string;
  notes?: string;
  paymentToken?: string;
  saleId: string;
  clientName?: string;
  salesAgentId?: string;
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

export enum PackageCategory {
  PUBLISHING = 'PUBLISHING',
  WRITING    = 'WRITING',
  DESIGN     = 'DESIGN',
  EDITING    = 'EDITING',
}

export interface IPackageItem {
  id: string;
  name: string;
  description?: string;
  unitPrice?: number;
  isActive: boolean;
  packageId: string;
}

export interface IProductPackage {
  id: string;
  name: string;
  description?: string;
  contentHtml?: string;
  isActive: boolean;
  category?: PackageCategory;
  price?: number;
  currency: string;
  brandId?: string;
  organizationId: string;
  items: IPackageItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISalePackageService {
  id: string;
  name: string;
  order: number;
  salePackageId: string;
}

export interface ISalePackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  category?: string;
  contentHtml?: string;
  packageId?: string;
  saleId: string;
  services: ISalePackageService[];
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SALES SUMMARY
// ==========================================

export interface ISalesSummary {
  totalRevenue: number;
  totalRevenueCount: number;
  activeRevenue: number;
  activeRevenueCount: number;
  pendingRevenue: number;
  pendingRevenueCount: number;
  cancelledRevenue: number;
  cancelledCount: number;
  refundedRevenue: number;
  refundedCount: number;
}

export interface IInvoiceSummary {
  unpaid: { count: number; total: number };
  overdue: { count: number; total: number };
  paidThisMonth: { count: number; total: number };
  upcomingDue: { count: number; total: number };
}

// ==========================================
// ANALYTICS
// ==========================================

export type AnalyticsPreset = 'this_week' | 'this_month' | 'last_30_days' | 'specific_month' | 'custom';
export type AnalyticsGranularity = 'weekly' | 'monthly';
export type AnalyticsCompareMode = 'previous_period' | 'previous_month' | 'none';

export interface IAnalyticsFilter {
  fromDate?: string;
  toDate?: string;
  preset?: AnalyticsPreset;
  granularity?: AnalyticsGranularity;
  compareMode?: AnalyticsCompareMode;
  month?: string;  // '1'-'12'
  year?: string;   // e.g. '2026'
}

export interface IAnalyticsSummary {
  periodLabel: string;
  granularity: AnalyticsGranularity;
  compareMode: 'previous_period' | 'previous_month' | null;

  bookedRevenue: number;
  collectedCash: number;
  leadCount: number;
  convertedLeadCount: number;
  salesCount: number;
  activeSales: number;
  outstandingReceivables: number;

  comparison: {
    bookedRevenue: number;
    collectedCash: number;
    leadCount: number;
    convertedLeadCount: number;
    salesCount: number;
    periodLabel: string;
  } | null;

  revenueByPeriod: Array<{ period: string; bookedRevenue: number; compBookedRevenue?: number }>;
  leadsByAgent: Array<{ agentName: string; total: number; converted: number }>;
  salesByBrand: Array<{ brandName: string; total: number; bookedRevenue: number }>;
  leadStatusBreakdown: Array<{ status: string; count: number }>;

  receivablesSummary: {
    outstanding: { count: number; total: number };
    overdue: { count: number; total: number };
    unpaidUpcoming: { count: number; total: number };
  };
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
