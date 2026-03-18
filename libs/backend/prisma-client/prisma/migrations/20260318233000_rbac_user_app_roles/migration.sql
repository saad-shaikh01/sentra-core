-- RBAC-002: add audit fields for user app access and role assignment mutations
ALTER TABLE "UserAppAccess"
ADD COLUMN "grantedBy" TEXT,
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedBy" TEXT;

ALTER TABLE "UserAppRole"
ADD COLUMN "assignedBy" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
