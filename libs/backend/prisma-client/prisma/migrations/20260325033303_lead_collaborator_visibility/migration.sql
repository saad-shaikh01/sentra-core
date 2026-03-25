-- CreateEnum
CREATE TYPE "LeadVisibilityMode" AS ENUM ('OWN_ONLY', 'TEAM_UNASSIGNED_ONLY', 'TEAM_ALL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadActivityType" ADD VALUE 'OUTREACH_STARTED';
ALTER TYPE "LeadActivityType" ADD VALUE 'OUTREACH_SENT';
ALTER TYPE "LeadActivityType" ADD VALUE 'OUTREACH_REPLIED';
ALTER TYPE "LeadActivityType" ADD VALUE 'COLLABORATOR_ADDED';
ALTER TYPE "LeadActivityType" ADD VALUE 'COLLABORATOR_REMOVED';
ALTER TYPE "LeadActivityType" ADD VALUE 'CLAIMED';
ALTER TYPE "LeadActivityType" ADD VALUE 'UNCLAIMED';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "leadVisibilityMode" "LeadVisibilityMode" NOT NULL DEFAULT 'OWN_ONLY';

-- CreateTable
CREATE TABLE "LeadCollaborator" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCollaborator_leadId_idx" ON "LeadCollaborator"("leadId");

-- CreateIndex
CREATE INDEX "LeadCollaborator_userId_idx" ON "LeadCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCollaborator_leadId_userId_key" ON "LeadCollaborator"("leadId", "userId");

-- AddForeignKey
ALTER TABLE "LeadCollaborator" ADD CONSTRAINT "LeadCollaborator_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCollaborator" ADD CONSTRAINT "LeadCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCollaborator" ADD CONSTRAINT "LeadCollaborator_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
