-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "role" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "followUpDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_organizationId_deletedAt_idx" ON "Lead"("organizationId", "deletedAt");
