export const EMPLOYEE_STATUS_VALUES = [
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'DEACTIVATED',
] as const;

export const EMPLOYEE_APP_FILTER_VALUES = ['SALES', 'PM', 'HRMS'] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUS_VALUES)[number];
export type EmployeeAppFilter = (typeof EMPLOYEE_APP_FILTER_VALUES)[number];

export interface DepartmentOption {
  id: string;
  name: string;
  description: string | null;
  employeeCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeAppAccess {
  appCode: string;
  appLabel: string;
}

export interface EmployeeRoleAssignment {
  appCode: string;
  roleName: string;
  roleSlug: string;
}

export interface Employee {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  status: EmployeeStatus;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  appAccess: EmployeeAppAccess[];
  roles: EmployeeRoleAssignment[];
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeesFilters {
  page: number;
  limit: number;
  search?: string;
  status?: EmployeeStatus;
  appCode?: EmployeeAppFilter;
  departmentId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface EmployeeAccessRole {
  userAppRoleId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  isSystem: boolean;
  assignedAt: string;
}

export interface EmployeeAccessApp {
  appCode: EmployeeAppFilter;
  appLabel: string;
  grantedAt: string;
  grantedBy: string | null;
  roles: EmployeeAccessRole[];
  effectivePermissionCount: number;
}

export interface EmployeeAccessSummary {
  userId: string;
  apps: EmployeeAccessApp[];
}

export interface RbacPermission {
  id: string;
  code: string;
  label: string;
  description: string | null;
}

export interface RbacRole {
  id: string;
  organizationId: string | null;
  appCode: EmployeeAppFilter;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
  permissions: RbacPermission[];
}

export interface SessionRecord {
  id: string;
  appCode: string;
  appLabel: string;
  deviceInfo: unknown;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  isActive: boolean;
}

export interface SessionListResponse {
  data: SessionRecord[];
  meta: {
    total: number;
    active: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface ActivityLogItem {
  id: string;
  action?: string;
  event?: string;
  description?: string | null;
  reason?: string | null;
  actorName?: string | null;
  adminName?: string | null;
  performedByName?: string | null;
  createdAt?: string;
  timestamp?: string;
}

const APP_BADGE_CONFIG: Record<
  EmployeeAppFilter,
  { label: string; title: string; className: string }
> = {
  SALES: {
    label: 'S',
    title: 'Sales Dashboard',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  },
  PM: {
    label: 'P',
    title: 'PM Dashboard',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  },
  HRMS: {
    label: 'H',
    title: 'HRMS',
    className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20',
  },
};

export function getAppBadge(appCode: string) {
  const normalized = normalizeAppCode(appCode);
  return normalized ? APP_BADGE_CONFIG[normalized] : null;
}

export function normalizeAppCode(appCode: string): EmployeeAppFilter | null {
  const normalized = appCode.trim().toUpperCase();
  if (normalized === 'SALES' || normalized === 'SALES_DASHBOARD') return 'SALES';
  if (normalized === 'PM' || normalized === 'PM_DASHBOARD') return 'PM';
  if (normalized === 'HRMS') return 'HRMS';
  return null;
}
