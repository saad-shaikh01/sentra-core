# HRMS-BE-004: App Access and Role Management Endpoints

## Overview
Implement the admin-facing API for managing user app access and role assignments. This covers granting/revoking access to apps, assigning/removing roles within apps, and listing current access/roles. Builds on RBAC-002 schema but provides the full admin management API.

## Background / Context
This is the operational layer on top of the RBAC model. RBAC-001 defines the schema and seeds. RBAC-002 defines the data layer. This ticket wires up the full admin API with all validation, error handling, and UX-friendly responses.

## Acceptance Criteria
- [ ] `GET /hrms/employees/:id/access` returns full access summary: apps + roles per app + effective permission count
- [ ] `POST /hrms/employees/:id/access` grants access to an app `{ appCode }`
- [ ] `DELETE /hrms/employees/:id/access/:appCode` revokes access (and all roles) from an app
- [ ] `POST /hrms/employees/:id/roles` assigns a role `{ appRoleId }`
- [ ] `DELETE /hrms/employees/:id/roles/:userAppRoleId` removes a role assignment
- [ ] Cannot assign a role without first granting app access
- [ ] Cannot remove a user's last role if they still have app access (warn, but allow — no roles = minimal access)
- [ ] Revoking app access also removes all role assignments for that app
- [ ] All changes create audit log entries
- [ ] Permission cache invalidated on every change (RBAC-003)

## Technical Specification

### GET /hrms/employees/:id/access — Full Access Summary

```typescript
// Response shape:
{
  userId: "xxx",
  apps: [
    {
      appCode: "SALES",
      appLabel: "Sales Dashboard",
      grantedAt: "2026-01-15T10:00:00Z",
      grantedBy: "admin@org.com",
      roles: [
        {
          userAppRoleId: "yyy",    // to use in DELETE
          roleId: "zzz",
          roleName: "Frontsell Agent",
          roleSlug: "frontsell_agent",
          isSystem: true,
          assignedAt: "2026-01-15T10:00:00Z"
        },
        {
          userAppRoleId: "aaa",
          roleId: "bbb",
          roleName: "Upsell Agent",
          roleSlug: "upsell_agent",
          isSystem: true,
          assignedAt: "2026-01-15T11:00:00Z"
        }
      ],
      effectivePermissionCount: 8    // total distinct permissions across all roles
    }
  ]
}
```

### POST /hrms/employees/:id/access — Grant App Access

```typescript
// Body: { appCode: "SALES" | "PM" | "HRMS" }

async grantAccess(userId: string, appCode: string, orgId: string, adminId: string) {
  // Validate appCode
  if (!VALID_APP_CODES.includes(appCode)) throw new BadRequestException('Invalid app code');

  // Validate user belongs to org
  const user = await this.findUserInOrg(userId, orgId);
  if (user.status === 'DEACTIVATED') throw new BadRequestException('Cannot grant access to a deactivated user');

  // Upsert app access
  const access = await this.prisma.userAppAccess.upsert({
    where: { userId_appCode_organizationId: { userId, appCode, organizationId: orgId } },
    create: { userId, appCode, organizationId: orgId, grantedBy: adminId, isActive: true },
    update: { isActive: true, revokedAt: null, revokedBy: null, grantedBy: adminId, grantedAt: new Date() }
  });

  await this.auditService.log({
    action: 'USER_APP_ACCESS_GRANTED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
    metadata: { appCode }
  });

  await this.invalidatePermissionsCache(userId, orgId);

  return { message: `Access to ${appCode} granted`, access };
}
```

### DELETE /hrms/employees/:id/access/:appCode — Revoke App Access

```typescript
async revokeAccess(userId: string, appCode: string, orgId: string, adminId: string) {
  const access = await this.prisma.userAppAccess.findFirst({
    where: { userId, appCode, organizationId: orgId, isActive: true }
  });
  if (!access) throw new NotFoundException('User does not have access to this app');

  // Revoke access
  await this.prisma.userAppAccess.updateMany({
    where: { userId, appCode, organizationId: orgId },
    data: { isActive: false, revokedAt: new Date(), revokedBy: adminId }
  });

  // Remove all roles for this app
  const userRoles = await this.prisma.userAppRole.findMany({
    where: { userId, organizationId: orgId },
    include: { appRole: { select: { appCode: true } } }
  });
  const roleIdsToRemove = userRoles.filter(r => r.appRole.appCode === appCode).map(r => r.id);
  if (roleIdsToRemove.length > 0) {
    await this.prisma.userAppRole.deleteMany({ where: { id: { in: roleIdsToRemove } } });
  }

  await this.auditService.log({
    action: 'USER_APP_ACCESS_REVOKED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
    metadata: { appCode, rolesRemoved: roleIdsToRemove.length }
  });

  await this.invalidatePermissionsCache(userId, orgId);

  return { message: `Access to ${appCode} revoked`, rolesRemoved: roleIdsToRemove.length };
}
```

### POST /hrms/employees/:id/roles — Assign Role

```typescript
// Body: { appRoleId: string }

async assignRole(userId: string, appRoleId: string, orgId: string, adminId: string) {
  // Validate role exists and is accessible to this org
  const role = await this.prisma.appRole.findUnique({ where: { id: appRoleId } });
  if (!role) throw new NotFoundException('Role not found');
  if (role.organizationId && role.organizationId !== orgId) {
    throw new ForbiddenException('This role does not belong to your organization');
  }

  // Check user has app access
  const hasAccess = await this.prisma.userAppAccess.findFirst({
    where: { userId, appCode: role.appCode, organizationId: orgId, isActive: true }
  });
  if (!hasAccess) {
    throw new BadRequestException(
      `Grant ${role.appCode} app access to this user before assigning roles.`
    );
  }

  // Upsert (idempotent)
  const userRole = await this.prisma.userAppRole.upsert({
    where: { userId_appRoleId_organizationId: { userId, appRoleId, organizationId: orgId } },
    create: { userId, appRoleId, organizationId: orgId, assignedBy: adminId },
    update: { assignedBy: adminId, assignedAt: new Date() }
  });

  await this.auditService.log({
    action: 'USER_ROLE_ASSIGNED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
    metadata: { roleId: appRoleId, roleName: role.name, appCode: role.appCode }
  });

  await this.invalidatePermissionsCache(userId, orgId);

  return { message: `Role "${role.name}" assigned`, userRole };
}
```

### DELETE /hrms/employees/:id/roles/:userAppRoleId — Remove Role

```typescript
async removeRole(userId: string, userAppRoleId: string, orgId: string, adminId: string) {
  const userRole = await this.prisma.userAppRole.findFirst({
    where: { id: userAppRoleId, userId, organizationId: orgId },
    include: { appRole: true }
  });
  if (!userRole) throw new NotFoundException('Role assignment not found');

  await this.prisma.userAppRole.delete({ where: { id: userAppRoleId } });

  await this.auditService.log({
    action: 'USER_ROLE_REMOVED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
    metadata: { roleId: userRole.appRoleId, roleName: userRole.appRole.name }
  });

  await this.invalidatePermissionsCache(userId, orgId);

  return { message: `Role "${userRole.appRole.name}" removed` };
}
```

## Frontend UX (HRMS Dashboard — User Detail Page)

```
User Detail: John Smith (john@example.com) — ACTIVE

Apps & Roles
┌──────────────────────────────────────────────────────────┐
│ Sales Dashboard                              [+ Add Role] │
│  ├── Frontsell Agent    [system]             [Remove] ✕   │
│  └── Upsell Agent       [system]             [Remove] ✕   │
│  8 effective permissions                [Revoke Access]   │
├──────────────────────────────────────────────────────────┤
│ PM Dashboard                                             │
│  └── (no roles assigned)               [Revoke Access]   │
│  0 effective permissions                                  │
│                                          [+ Grant Access] │
└──────────────────────────────────────────────────────────┘
```

UX Details:
- "+ Grant Access" shows a dropdown/modal with available apps (those the user doesn't have yet)
- "+ Add Role" opens a dropdown of available roles for that app (all system + org custom roles)
- Roles that are already assigned appear grayed out in the dropdown
- "Revoke Access" shows confirmation: "This will remove all roles for Sales Dashboard too. Continue?"
- "Remove" role shows inline confirmation
- After any change, the card refreshes to show updated state
- Permission count shown as a hint (not clickable in this view — full permission list is advanced)

## Testing Requirements

### Unit Tests
- `grantAccess()` is idempotent (granting twice = OK)
- `grantAccess()` fails for deactivated users
- `revokeAccess()` removes all roles for that app
- `assignRole()` fails if user doesn't have app access
- `assignRole()` fails if role belongs to different org's custom role
- `removeRole()` fails if userAppRoleId belongs to different user

### Integration Tests
- Grant SALES → assign frontsell_agent + upsell_agent → GET access summary shows both roles
- Revoke SALES access → both roles removed, access isActive=false
- Assign role → permission cache invalidated → next request re-fetches from DB
- Remove role → permission cache invalidated

### Edge Cases
- Granting access to a SUSPENDED user → allowed (they can work again when unsuspended)
- Assigning the same role twice → idempotent (no duplicate row, no error)
- Removing last role from a user who has app access → allowed (zero-role user has no effective permissions)
