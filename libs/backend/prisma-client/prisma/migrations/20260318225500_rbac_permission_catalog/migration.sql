-- RBAC-001: allow global system roles by making AppRole.organizationId nullable
ALTER TABLE "AppRole"
ALTER COLUMN "organizationId" DROP NOT NULL;
