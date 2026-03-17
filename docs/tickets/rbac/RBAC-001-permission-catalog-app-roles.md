# RBAC-001: Permission Catalog + App Roles Schema and Seed

## Overview
Create the foundational RBAC tables: `PermissionCatalog` (all possible permissions), `AppRole` (roles per app per org), and `AppRolePermission` (junction). Seed default system roles for each app. Org admins can create custom roles and adjust permissions within their organization.

## Background / Context
Currently, role checks use `user.role` from the JWT and a hardcoded enum hierarchy in `roles.guard.ts`. This is inflexible — adding a new role means code changes. The new model stores roles and permissions in the DB, making them dynamic without deploys.

The permission string convention is: `{app}:{resource}:{action}` e.g. `sales:leads:view_all`.

## Acceptance Criteria
- [ ] `PermissionCatalog` table has all permissions for all apps, seeded on first run
- [ ] `AppRole` table exists with `isSystem` flag (system roles cannot be deleted)
- [ ] `AppRolePermission` junction links roles to permissions
- [ ] Default system roles are seeded per app (see list below)
- [ ] `GET /hrms/apps/:appCode/roles` returns all roles for an app within the org
- [ ] `POST /hrms/apps/:appCode/roles` creates a custom role (org-level only)
- [ ] `PATCH /hrms/apps/:appCode/roles/:roleId` updates name/description of custom roles (not system roles)
- [ ] `GET /hrms/apps/:appCode/permissions` returns all available permissions for an app
- [ ] `PUT /hrms/apps/:appCode/roles/:roleId/permissions` replaces permission set on a custom role
- [ ] System roles cannot be deleted or have permissions modified
- [ ] Permissions are namespaced per app — a SALES permission cannot be assigned to a PM role

## Technical Specification

### Database Schema

```prisma
model PermissionCatalog {
  id          String   @id @default(cuid())
  code        String   @unique  // "sales:leads:view_all"
  appCode     String            // "SALES"
  resource    String            // "leads"
  action      String            // "view_all"
  label       String            // "View All Leads"
  description String?
  createdAt   DateTime @default(now())

  rolePermissions AppRolePermission[]

  @@index([appCode])
}

model AppRole {
  id             String   @id @default(cuid())
  organizationId String?           // null = global system role (all orgs see it)
  appCode        String            // "SALES" | "PM" | "HRMS" | "ADMIN"
  name           String            // "Sales Admin", "Frontsell Agent"
  slug           String            // "sales_admin", "frontsell_agent"
  description    String?
  isSystem       Boolean  @default(false)   // system roles are read-only
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  permissions    AppRolePermission[]
  userRoles      UserAppRole[]

  @@unique([organizationId, appCode, slug])
  @@index([appCode, organizationId])
}

model AppRolePermission {
  id           String           @id @default(cuid())
  appRoleId    String
  permissionId String

  appRole      AppRole          @relation(fields: [appRoleId], references: [id], onDelete: Cascade)
  permission   PermissionCatalog @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([appRoleId, permissionId])
}
```

### Permissions Seed Data (complete list)

```typescript
// prisma/seeds/permissions.seed.ts

export const PERMISSIONS = [
  // ── SALES APP ──────────────────────────────────────────────────
  // Leads
  { code: 'sales:leads:view_own',      appCode: 'SALES', resource: 'leads',   action: 'view_own',      label: 'View Own Leads' },
  { code: 'sales:leads:view_team',     appCode: 'SALES', resource: 'leads',   action: 'view_team',     label: 'View Team Leads' },
  { code: 'sales:leads:view_all',      appCode: 'SALES', resource: 'leads',   action: 'view_all',      label: 'View All Leads' },
  { code: 'sales:leads:create',        appCode: 'SALES', resource: 'leads',   action: 'create',        label: 'Create Leads' },
  { code: 'sales:leads:edit_own',      appCode: 'SALES', resource: 'leads',   action: 'edit_own',      label: 'Edit Own Leads' },
  { code: 'sales:leads:edit_all',      appCode: 'SALES', resource: 'leads',   action: 'edit_all',      label: 'Edit All Leads' },
  { code: 'sales:leads:delete',        appCode: 'SALES', resource: 'leads',   action: 'delete',        label: 'Delete Leads' },
  { code: 'sales:leads:assign',        appCode: 'SALES', resource: 'leads',   action: 'assign',        label: 'Assign Leads' },
  { code: 'sales:leads:export',        appCode: 'SALES', resource: 'leads',   action: 'export',        label: 'Export Leads' },
  // Sales (deals/orders)
  { code: 'sales:sales:view_own',      appCode: 'SALES', resource: 'sales',   action: 'view_own',      label: 'View Own Sales' },
  { code: 'sales:sales:view_all',      appCode: 'SALES', resource: 'sales',   action: 'view_all',      label: 'View All Sales' },
  { code: 'sales:sales:create',        appCode: 'SALES', resource: 'sales',   action: 'create',        label: 'Create Sales' },
  { code: 'sales:sales:edit_own',      appCode: 'SALES', resource: 'sales',   action: 'edit_own',      label: 'Edit Own Sales' },
  { code: 'sales:sales:edit_all',      appCode: 'SALES', resource: 'sales',   action: 'edit_all',      label: 'Edit All Sales' },
  { code: 'sales:sales:delete',        appCode: 'SALES', resource: 'sales',   action: 'delete',        label: 'Delete Sales' },
  { code: 'sales:sales:refund',        appCode: 'SALES', resource: 'sales',   action: 'refund',        label: 'Process Refunds' },
  { code: 'sales:sales:chargeback',    appCode: 'SALES', resource: 'sales',   action: 'chargeback',    label: 'Handle Chargebacks' },
  // Reports
  { code: 'sales:reports:view',        appCode: 'SALES', resource: 'reports', action: 'view',          label: 'View Reports' },
  { code: 'sales:reports:export',      appCode: 'SALES', resource: 'reports', action: 'export',        label: 'Export Reports' },
  // Teams
  { code: 'sales:teams:view',          appCode: 'SALES', resource: 'teams',   action: 'view',          label: 'View Teams' },
  { code: 'sales:teams:manage',        appCode: 'SALES', resource: 'teams',   action: 'manage',        label: 'Manage Teams' },
  // Settings
  { code: 'sales:settings:view',       appCode: 'SALES', resource: 'settings', action: 'view',         label: 'View Settings' },
  { code: 'sales:settings:manage',     appCode: 'SALES', resource: 'settings', action: 'manage',       label: 'Manage Settings' },

  // ── PM APP ─────────────────────────────────────────────────────
  { code: 'pm:projects:view_assigned', appCode: 'PM',    resource: 'projects',    action: 'view_assigned', label: 'View Assigned Projects' },
  { code: 'pm:projects:view_all',      appCode: 'PM',    resource: 'projects',    action: 'view_all',      label: 'View All Projects' },
  { code: 'pm:projects:create',        appCode: 'PM',    resource: 'projects',    action: 'create',        label: 'Create Projects' },
  { code: 'pm:projects:edit',          appCode: 'PM',    resource: 'projects',    action: 'edit',          label: 'Edit Projects' },
  { code: 'pm:projects:delete',        appCode: 'PM',    resource: 'projects',    action: 'delete',        label: 'Delete Projects' },
  { code: 'pm:tasks:view_own',         appCode: 'PM',    resource: 'tasks',       action: 'view_own',      label: 'View Own Tasks' },
  { code: 'pm:tasks:view_all',         appCode: 'PM',    resource: 'tasks',       action: 'view_all',      label: 'View All Tasks' },
  { code: 'pm:tasks:create',           appCode: 'PM',    resource: 'tasks',       action: 'create',        label: 'Create Tasks' },
  { code: 'pm:tasks:edit_own',         appCode: 'PM',    resource: 'tasks',       action: 'edit_own',      label: 'Edit Own Tasks' },
  { code: 'pm:tasks:edit_all',         appCode: 'PM',    resource: 'tasks',       action: 'edit_all',      label: 'Edit All Tasks' },
  { code: 'pm:tasks:assign',           appCode: 'PM',    resource: 'tasks',       action: 'assign',        label: 'Assign Tasks' },
  { code: 'pm:departments:manage',     appCode: 'PM',    resource: 'departments', action: 'manage',        label: 'Manage Departments' },
  { code: 'pm:reports:view',           appCode: 'PM',    resource: 'reports',     action: 'view',          label: 'View PM Reports' },
  { code: 'pm:settings:manage',        appCode: 'PM',    resource: 'settings',    action: 'manage',        label: 'Manage PM Settings' },

  // ── HRMS APP ────────────────────────────────────────────────────
  { code: 'hrms:users:view',               appCode: 'HRMS', resource: 'users',       action: 'view',           label: 'View Employees' },
  { code: 'hrms:users:create',             appCode: 'HRMS', resource: 'users',       action: 'create',         label: 'Create Employees' },
  { code: 'hrms:users:edit',               appCode: 'HRMS', resource: 'users',       action: 'edit',           label: 'Edit Employees' },
  { code: 'hrms:users:suspend',            appCode: 'HRMS', resource: 'users',       action: 'suspend',        label: 'Suspend Employees' },
  { code: 'hrms:users:deactivate',         appCode: 'HRMS', resource: 'users',       action: 'deactivate',     label: 'Deactivate Employees' },
  { code: 'hrms:users:manage_sessions',    appCode: 'HRMS', resource: 'users',       action: 'manage_sessions',label: 'Manage User Sessions' },
  { code: 'hrms:roles:view',               appCode: 'HRMS', resource: 'roles',       action: 'view',           label: 'View Roles' },
  { code: 'hrms:roles:manage',             appCode: 'HRMS', resource: 'roles',       action: 'manage',         label: 'Manage Roles' },
  { code: 'hrms:app_access:manage',        appCode: 'HRMS', resource: 'app_access',  action: 'manage',         label: 'Manage App Access' },
  { code: 'hrms:teams:view',               appCode: 'HRMS', resource: 'teams',       action: 'view',           label: 'View Teams' },
  { code: 'hrms:teams:manage',             appCode: 'HRMS', resource: 'teams',       action: 'manage',         label: 'Manage Teams' },
  { code: 'hrms:departments:manage',       appCode: 'HRMS', resource: 'departments', action: 'manage',         label: 'Manage Departments' },
  { code: 'hrms:invitations:send',         appCode: 'HRMS', resource: 'invitations', action: 'send',           label: 'Send Invitations' },
];
```

### Default System Roles Seed

```typescript
// prisma/seeds/roles.seed.ts

export const SYSTEM_ROLES = [
  // SALES roles
  {
    appCode: 'SALES', slug: 'sales_admin', name: 'Sales Admin', isSystem: true,
    permissions: ['sales:leads:view_all', 'sales:leads:create', 'sales:leads:edit_all', 'sales:leads:delete',
                  'sales:leads:assign', 'sales:leads:export', 'sales:sales:view_all', 'sales:sales:create',
                  'sales:sales:edit_all', 'sales:sales:delete', 'sales:sales:refund', 'sales:sales:chargeback',
                  'sales:reports:view', 'sales:reports:export', 'sales:teams:view', 'sales:teams:manage',
                  'sales:settings:view', 'sales:settings:manage']
  },
  {
    appCode: 'SALES', slug: 'sales_manager', name: 'Sales Manager', isSystem: true,
    permissions: ['sales:leads:view_all', 'sales:leads:edit_all', 'sales:leads:assign', 'sales:leads:export',
                  'sales:sales:view_all', 'sales:sales:edit_all', 'sales:reports:view', 'sales:reports:export',
                  'sales:teams:view', 'sales:settings:view']
  },
  {
    appCode: 'SALES', slug: 'frontsell_agent', name: 'Frontsell Agent', isSystem: true,
    permissions: ['sales:leads:view_own', 'sales:leads:create', 'sales:leads:edit_own', 'sales:sales:view_own',
                  'sales:sales:create', 'sales:sales:edit_own']
  },
  {
    appCode: 'SALES', slug: 'upsell_agent', name: 'Upsell Agent', isSystem: true,
    permissions: ['sales:leads:view_own', 'sales:sales:view_own', 'sales:sales:create', 'sales:sales:edit_own']
  },
  // PM roles
  {
    appCode: 'PM', slug: 'pm_admin', name: 'PM Admin', isSystem: true,
    permissions: ['pm:projects:view_all', 'pm:projects:create', 'pm:projects:edit', 'pm:projects:delete',
                  'pm:tasks:view_all', 'pm:tasks:create', 'pm:tasks:edit_all', 'pm:tasks:assign',
                  'pm:departments:manage', 'pm:reports:view', 'pm:settings:manage']
  },
  {
    appCode: 'PM', slug: 'pm_project_manager', name: 'Project Manager', isSystem: true,
    permissions: ['pm:projects:view_all', 'pm:projects:create', 'pm:projects:edit',
                  'pm:tasks:view_all', 'pm:tasks:create', 'pm:tasks:edit_all', 'pm:tasks:assign', 'pm:reports:view']
  },
  {
    appCode: 'PM', slug: 'pm_team_lead', name: 'Team Lead', isSystem: true,
    permissions: ['pm:projects:view_assigned', 'pm:tasks:view_all', 'pm:tasks:create', 'pm:tasks:edit_all', 'pm:tasks:assign']
  },
  {
    appCode: 'PM', slug: 'pm_team_member', name: 'Team Member', isSystem: true,
    permissions: ['pm:projects:view_assigned', 'pm:tasks:view_own', 'pm:tasks:edit_own']
  },
  // HRMS roles
  {
    appCode: 'HRMS', slug: 'hrms_admin', name: 'HRMS Admin', isSystem: true,
    permissions: ['hrms:users:view', 'hrms:users:create', 'hrms:users:edit', 'hrms:users:suspend',
                  'hrms:users:deactivate', 'hrms:users:manage_sessions', 'hrms:roles:view', 'hrms:roles:manage',
                  'hrms:app_access:manage', 'hrms:teams:view', 'hrms:teams:manage',
                  'hrms:departments:manage', 'hrms:invitations:send']
  },
  {
    appCode: 'HRMS', slug: 'hrms_manager', name: 'HR Manager', isSystem: true,
    permissions: ['hrms:users:view', 'hrms:users:create', 'hrms:users:edit', 'hrms:users:suspend',
                  'hrms:roles:view', 'hrms:teams:view', 'hrms:teams:manage', 'hrms:invitations:send']
  },
];
```

## API Endpoints

```
GET    /hrms/apps/:appCode/roles              → list roles for app (system + org custom)
POST   /hrms/apps/:appCode/roles              → create custom role
PATCH  /hrms/apps/:appCode/roles/:roleId      → update name/description (custom only)
DELETE /hrms/apps/:appCode/roles/:roleId      → delete custom role (custom only, no assigned users)
GET    /hrms/apps/:appCode/permissions        → list all permissions for an app
PUT    /hrms/apps/:appCode/roles/:roleId/permissions → replace permissions (custom roles only)
GET    /hrms/apps/:appCode/roles/:roleId/permissions → get permissions for a role
```

## Testing Requirements

### Unit Tests
- Seed runs without error and creates all permissions and roles
- System role cannot be deleted → BadRequestException
- System role permissions cannot be modified → ForbiddenException
- Custom role permissions can be replaced
- Permission appCode must match role appCode (cross-app assignment rejected)

### Integration Tests
- GET permissions returns correct list per appCode
- Create custom role → appears in GET roles list with isSystem: false
- Assign permissions to custom role → GET role permissions reflects change
- Attempt to add a PM permission to a SALES role → rejected

### Edge Cases
- Seed is idempotent (run multiple times = no duplicate errors)
- AppCode in URL must be one of the valid enum values — reject unknown appCodes
- Custom role with no permissions is allowed (empty permission set)
- Deleting a role that has users assigned to it → 409 Conflict (must reassign users first)
