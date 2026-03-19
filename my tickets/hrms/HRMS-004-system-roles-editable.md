# HRMS-004 — System Roles: Allow Admins to Edit Permissions

## Problem

System roles (e.g. `sales_admin`, `frontsell_agent`, `pm_project_manager`) are
visible on the Roles & Permissions page but are read-only. Admins cannot adjust
which permissions a system role has, which makes it impossible to fine-tune
access without creating a separate custom role.

## Design Decision

- **Name and slug of system roles cannot be changed** — these are used as
  identifiers by the backend's permission resolution and seed data.
- **Permissions on system roles CAN be modified per-org** — admins should be
  able to add or remove permissions from a system role for their organization.
- **Delete is NOT available** for system roles.

## Current Behavior

In `role-detail-sheet.tsx`:
```ts
const editable = Boolean(role && !role.isSystem);
```
System roles render as fully read-only (no checkboxes, no Save button).

In `rbac.service.ts` (backend):
```ts
private assertCustomOrgRole(role, organizationId) {
  if (role.isSystem || role.organizationId === null) {
    throw new ForbiddenException('System roles cannot be modified');
  }
  ...
}
```
This guard blocks ALL modifications to system roles, including permission updates.

## Required Changes

### Backend — `apps/backend/core-service/src/modules/rbac/rbac.service.ts`

Add a separate `assertPermissionsEditable()` guard that allows permission updates
for system roles while still blocking name/description/delete changes:

```ts
private assertPermissionsEditable(role: NonNullable<RoleWithPermissions>, organizationId: string) {
  // System roles: allow permission edits for any org (permissions are per-org via AppRolePermission)
  // Custom roles: must belong to the same org
  if (!role.isSystem && role.organizationId !== organizationId) {
    throw new ForbiddenException('Role does not belong to this organization');
  }
}
```

Update `replaceRolePermissions()` to use this new guard instead of
`assertCustomOrgRole()`:

```ts
async replaceRolePermissions(...) {
  ...
  this.assertPermissionsEditable(role, currentUser.orgId);  // ← changed
  ...
}
```

Keep `assertCustomOrgRole()` on `updateRole()` and `deleteRole()` — name/description/delete remain system-only.

> **Note:** Verify how `AppRolePermission` is scoped. If it is org-scoped, this
> works as-is. If it is global (shared across orgs), we need to scope the
> permission update to the org. Check the Prisma schema before implementing.

### Frontend — `apps/frontend/hrms-dashboard/src/app/dashboard/roles/_components/role-detail-sheet.tsx`

Split the `editable` concept into two flags:

```ts
// Name/description can only be edited for custom org roles
const canEditMeta = Boolean(role && !role.isSystem);

// Permissions can be edited for both custom and system roles (admin only)
const canEditPermissions = Boolean(role);
```

Update the UI:
- Name and description `Input` fields: `disabled={!canEditMeta}`
- `PermissionGroup` checkboxes: `editable={canEditPermissions}`
- **Save Changes** button: show when `canEditPermissions` (not just `canEditMeta`)
- **Delete Role** button: show only when `canEditMeta`
- When role is system: add a small info note — *"System role — name cannot be changed, but permissions can be adjusted."*

## Acceptance Criteria

- [ ] Clicking a system role opens the sheet with permission checkboxes enabled.
- [ ] Toggling permissions and clicking Save updates the role successfully.
- [ ] Name and description inputs remain disabled for system roles.
- [ ] Delete button does NOT appear for system roles.
- [ ] Custom roles behave exactly as before (all editable, deletable).
- [ ] `npx tsc --noEmit` passes.
