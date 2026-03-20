-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "allowMemberVisibility" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TeamBrand" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamBrand_brandId_key" ON "TeamBrand"("brandId");

-- CreateIndex
CREATE INDEX "TeamBrand_teamId_idx" ON "TeamBrand"("teamId");

-- CreateIndex
CREATE INDEX "TeamBrand_brandId_idx" ON "TeamBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamBrand_teamId_brandId_key" ON "TeamBrand"("teamId", "brandId");

-- CreateIndex
CREATE INDEX "Client_organizationId_brandId_idx" ON "Client"("organizationId", "brandId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_teamId_idx" ON "Lead"("organizationId", "teamId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedToId_idx" ON "Lead"("organizationId", "assignedToId");

-- AddForeignKey
ALTER TABLE "TeamBrand" ADD CONSTRAINT "TeamBrand_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamBrand" ADD CONSTRAINT "TeamBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "GlobalNotification_organizationId_recipientId_isRead_created_id" RENAME TO "GlobalNotification_organizationId_recipientId_isRead_create_idx";
