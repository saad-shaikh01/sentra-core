ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "deactivatedBy" TEXT;

CREATE INDEX "User_organizationId_departmentId_idx" ON "User"("organizationId", "departmentId");
