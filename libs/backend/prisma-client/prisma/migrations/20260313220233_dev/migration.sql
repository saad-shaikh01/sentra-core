/*
  Warnings:

  - The values [ASSIGNMENT_CHANGE] on the enum `ClientActivityType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `portalOtp` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `portalOtpExpiresAt` on the `Client` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ClientActivityType_new" AS ENUM ('CREATED', 'UPSELL_ASSIGNED', 'PM_ASSIGNED', 'STATUS_CHANGE', 'NOTE', 'PORTAL_ACCESS_GRANTED', 'PORTAL_ACCESS_REVOKED', 'CHARGEBACK_FILED', 'REFUND_ISSUED');
ALTER TABLE "ClientActivity" ALTER COLUMN "type" TYPE "ClientActivityType_new" USING ("type"::text::"ClientActivityType_new");
ALTER TYPE "ClientActivityType" RENAME TO "ClientActivityType_old";
ALTER TYPE "ClientActivityType_new" RENAME TO "ClientActivityType";
DROP TYPE "public"."ClientActivityType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "portalOtp",
DROP COLUMN "portalOtpExpiresAt",
ADD COLUMN     "emailOtp" TEXT,
ADD COLUMN     "emailOtpExpiry" TIMESTAMP(3),
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mustSetPassword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalGrantedAt" TIMESTAMP(3),
ADD COLUMN     "portalGrantedBy" TEXT;
