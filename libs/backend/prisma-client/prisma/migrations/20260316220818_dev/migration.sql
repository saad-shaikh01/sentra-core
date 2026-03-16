-- CreateEnum
CREATE TYPE "PmDeptMemberRole" AS ENUM ('LEAD', 'MEMBER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadSource" ADD VALUE 'FACEBOOK_ADS';
ALTER TYPE "LeadSource" ADD VALUE 'WEBHOOK';

-- AlterTable
ALTER TABLE "PmEngagement" ADD COLUMN     "saleId" TEXT;

-- AlterTable
ALTER TABLE "PmTask" ADD COLUMN     "departmentCode" "PmDepartmentCode";

-- CreateTable
CREATE TABLE "FacebookIntegration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenericLeadWebhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "label" TEXT,
    "signingSecret" TEXT NOT NULL,
    "defaultSource" "LeadSource",
    "defaultLeadType" "LeadType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenericLeadWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmDepartment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" "PmDepartmentCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmDepartmentMember" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PmDeptMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmDepartmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmClientPortalAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmClientPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacebookIntegration_organizationId_isActive_idx" ON "FacebookIntegration"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "FacebookIntegration_brandId_idx" ON "FacebookIntegration"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookIntegration_pageId_formId_key" ON "FacebookIntegration"("pageId", "formId");

-- CreateIndex
CREATE INDEX "GenericLeadWebhook_organizationId_isActive_idx" ON "GenericLeadWebhook"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "GenericLeadWebhook_brandId_idx" ON "GenericLeadWebhook"("brandId");

-- CreateIndex
CREATE INDEX "PmDepartment_organizationId_isActive_idx" ON "PmDepartment"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PmDepartment_organizationId_code_key" ON "PmDepartment"("organizationId", "code");

-- CreateIndex
CREATE INDEX "PmDepartmentMember_departmentId_idx" ON "PmDepartmentMember"("departmentId");

-- CreateIndex
CREATE INDEX "PmDepartmentMember_userId_idx" ON "PmDepartmentMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PmDepartmentMember_departmentId_userId_key" ON "PmDepartmentMember"("departmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PmClientPortalAccess_token_key" ON "PmClientPortalAccess"("token");

-- CreateIndex
CREATE INDEX "PmClientPortalAccess_organizationId_isActive_idx" ON "PmClientPortalAccess"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "PmClientPortalAccess_projectId_idx" ON "PmClientPortalAccess"("projectId");

-- CreateIndex
CREATE INDEX "PmEngagement_saleId_idx" ON "PmEngagement"("saleId");

-- CreateIndex
CREATE INDEX "PmTask_organizationId_departmentCode_status_idx" ON "PmTask"("organizationId", "departmentCode", "status");

-- AddForeignKey
ALTER TABLE "FacebookIntegration" ADD CONSTRAINT "FacebookIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookIntegration" ADD CONSTRAINT "FacebookIntegration_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenericLeadWebhook" ADD CONSTRAINT "GenericLeadWebhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenericLeadWebhook" ADD CONSTRAINT "GenericLeadWebhook_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmDepartmentMember" ADD CONSTRAINT "PmDepartmentMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PmDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmClientPortalAccess" ADD CONSTRAINT "PmClientPortalAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
