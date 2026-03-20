-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('FRONTSELL', 'UPSELL');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "saleType" "SaleType",
ADD COLUMN     "salesAgentId" TEXT;
