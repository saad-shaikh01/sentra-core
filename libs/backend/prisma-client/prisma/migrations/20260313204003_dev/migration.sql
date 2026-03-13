/*
  Warnings:

  - The values [CLOSED] on the enum `LeadStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `password` on the `Client` table. All the data in the column will be lost.
  - The `source` column on the `Lead` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('CHAT', 'SIGNUP', 'SOCIAL', 'REFERRAL', 'INBOUND');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PPC', 'SMM', 'COLD_REFERRAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'INACTIVE', 'REFUNDED', 'CHARGEBACK', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "ClientActivityType" AS ENUM ('ASSIGNMENT_CHANGE', 'STATUS_CHANGE', 'NOTE', 'PORTAL_ACCESS_GRANTED', 'PORTAL_ACCESS_REVOKED', 'CHARGEBACK_FILED', 'REFUND_ISSUED');

-- CreateEnum
CREATE TYPE "SaleActivityType" AS ENUM ('CREATED', 'STATUS_CHANGE', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'REFUND_ISSUED', 'CHARGEBACK_FILED', 'NOTE');

-- AlterEnum
BEGIN;
CREATE TYPE "LeadStatus_new" AS ENUM ('NEW', 'CONTACTED', 'PROPOSAL', 'FOLLOW_UP', 'CLOSED_WON', 'CLOSED_LOST');
ALTER TABLE "public"."Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus_new" USING ("status"::text::"LeadStatus_new");
ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
DROP TYPE "public"."LeadStatus_old";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SaleStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "SaleStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionStatus" ADD VALUE 'CHARGEBACK_FILED';
ALTER TYPE "TransactionStatus" ADD VALUE 'CHARGEBACK_WON';
ALTER TYPE "TransactionStatus" ADD VALUE 'CHARGEBACK_LOST';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'CHARGEBACK';

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "password",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "portalAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalOtp" TEXT,
ADD COLUMN     "portalOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "projectManagerId" TEXT,
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "upsellAgentId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "leadDate" TIMESTAMP(3),
ADD COLUMN     "leadType" "LeadType",
ADD COLUMN     "lostReason" TEXT,
ALTER COLUMN "title" DROP NOT NULL,
DROP COLUMN "source",
ADD COLUMN     "source" "LeadSource";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientActivity" (
    "id" TEXT NOT NULL,
    "type" "ClientActivityType" NOT NULL,
    "data" JSONB NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleActivity" (
    "id" TEXT NOT NULL,
    "type" "SaleActivityType" NOT NULL,
    "data" JSONB NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientActivity_clientId_createdAt_idx" ON "ClientActivity"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleActivity_saleId_createdAt_idx" ON "SaleActivity"("saleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_brandId_key" ON "InvoiceSequence"("brandId");

-- CreateIndex
CREATE INDEX "InvoiceSequence_brandId_year_idx" ON "InvoiceSequence"("brandId", "year");

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Client_upsellAgentId_idx" ON "Client"("upsellAgentId");

-- CreateIndex
CREATE INDEX "Client_projectManagerId_idx" ON "Client"("projectManagerId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_upsellAgentId_fkey" FOREIGN KEY ("upsellAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleActivity" ADD CONSTRAINT "SaleActivity_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleActivity" ADD CONSTRAINT "SaleActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
