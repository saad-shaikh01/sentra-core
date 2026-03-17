-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- AlterEnum
-- PostgreSQL enum additions are not transactional. If this migration fails after
-- any ALTER TYPE statement succeeds, the new enum values will remain and recovery
-- requires manual follow-up SQL for the remaining schema changes or a database restore.
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SaleActivityType" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "SaleActivityType" ADD VALUE 'INVOICE_UPDATED';
ALTER TYPE "SaleActivityType" ADD VALUE 'MANUAL_ADJUSTMENT';
ALTER TYPE "SaleActivityType" ADD VALUE 'DISCOUNT_APPLIED';

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DECIMAL(10,2),
ADD COLUMN     "discountedTotal" DECIMAL(10,2);
