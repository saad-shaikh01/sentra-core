-- IAM Invite V2: app-level access, app roles, scoped permissions, invitation bundles

CREATE TYPE "OrganizationOnboardingMode" AS ENUM ('PUBLIC_OWNER_SIGNUP', 'INVITE_ONLY');
CREATE TYPE "AppCode" AS ENUM ('SALES_DASHBOARD', 'PM_DASHBOARD', 'HRMS', 'CLIENT_PORTAL', 'COMM_SERVICE');
CREATE TYPE "DataScopeType" AS ENUM ('OWN', 'TEAM', 'DEPARTMENT', 'BRAND', 'PROJECT', 'ALL');

ALTER TABLE "Organization"
ADD COLUMN "onboardingMode" "OrganizationOnboardingMode" NOT NULL DEFAULT 'PUBLIC_OWNER_SIGNUP';

ALTER TABLE "Invitation"
ALTER COLUMN "role" DROP NOT NULL;

CREATE TABLE "AppRegistry" (
  "id" TEXT NOT NULL,
  "code" "AppCode" NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppRegistry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionCatalog" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppRolePermission" (
  "id" TEXT NOT NULL,
  "appRoleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAppAccess" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAppAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAppRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "appRoleId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserScopeGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "scopeType" "DataScopeType" NOT NULL,
  "scopeValues" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserScopeGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvitationBundle" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "roleIds" JSONB,
  "scopeGrants" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvitationBundle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppRegistry_code_key" ON "AppRegistry"("code");
CREATE UNIQUE INDEX "PermissionCatalog_appId_key_key" ON "PermissionCatalog"("appId", "key");
CREATE INDEX "PermissionCatalog_appId_isActive_idx" ON "PermissionCatalog"("appId", "isActive");
CREATE UNIQUE INDEX "AppRole_organizationId_appId_slug_key" ON "AppRole"("organizationId", "appId", "slug");
CREATE INDEX "AppRole_organizationId_appId_isActive_idx" ON "AppRole"("organizationId", "appId", "isActive");
CREATE UNIQUE INDEX "AppRolePermission_appRoleId_permissionId_key" ON "AppRolePermission"("appRoleId", "permissionId");
CREATE INDEX "AppRolePermission_permissionId_idx" ON "AppRolePermission"("permissionId");
CREATE UNIQUE INDEX "UserAppAccess_organizationId_userId_appId_key" ON "UserAppAccess"("organizationId", "userId", "appId");
CREATE INDEX "UserAppAccess_userId_isEnabled_idx" ON "UserAppAccess"("userId", "isEnabled");
CREATE INDEX "UserAppAccess_organizationId_appId_isEnabled_idx" ON "UserAppAccess"("organizationId", "appId", "isEnabled");
CREATE UNIQUE INDEX "UserAppRole_organizationId_userId_appId_appRoleId_key" ON "UserAppRole"("organizationId", "userId", "appId", "appRoleId");
CREATE INDEX "UserAppRole_organizationId_userId_appId_idx" ON "UserAppRole"("organizationId", "userId", "appId");
CREATE INDEX "UserScopeGrant_organizationId_userId_appId_idx" ON "UserScopeGrant"("organizationId", "userId", "appId");
CREATE INDEX "UserScopeGrant_appId_resourceKey_scopeType_idx" ON "UserScopeGrant"("appId", "resourceKey", "scopeType");
CREATE UNIQUE INDEX "InvitationBundle_invitationId_appId_key" ON "InvitationBundle"("invitationId", "appId");
CREATE INDEX "InvitationBundle_invitationId_idx" ON "InvitationBundle"("invitationId");

ALTER TABLE "PermissionCatalog"
ADD CONSTRAINT "PermissionCatalog_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppRole"
ADD CONSTRAINT "AppRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppRole"
ADD CONSTRAINT "AppRole_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppRole"
ADD CONSTRAINT "AppRole_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppRolePermission"
ADD CONSTRAINT "AppRolePermission_appRoleId_fkey" FOREIGN KEY ("appRoleId") REFERENCES "AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppRolePermission"
ADD CONSTRAINT "AppRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "PermissionCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppAccess"
ADD CONSTRAINT "UserAppAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppAccess"
ADD CONSTRAINT "UserAppAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppAccess"
ADD CONSTRAINT "UserAppAccess_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppRole"
ADD CONSTRAINT "UserAppRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppRole"
ADD CONSTRAINT "UserAppRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppRole"
ADD CONSTRAINT "UserAppRole_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAppRole"
ADD CONSTRAINT "UserAppRole_appRoleId_fkey" FOREIGN KEY ("appRoleId") REFERENCES "AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserScopeGrant"
ADD CONSTRAINT "UserScopeGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserScopeGrant"
ADD CONSTRAINT "UserScopeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserScopeGrant"
ADD CONSTRAINT "UserScopeGrant_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvitationBundle"
ADD CONSTRAINT "InvitationBundle_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvitationBundle"
ADD CONSTRAINT "InvitationBundle_appId_fkey" FOREIGN KEY ("appId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
